import express from 'express';
import { exec, spawn } from 'child_process';
import cors from 'cors';
import { platform } from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const app = express();
const PORT = Number(process.env.PORT || 3001);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine the shell to use based on the platform
const isWindows = platform() === 'win32';
const shell = isWindows ? 'cmd.exe' : '/bin/bash';

// Allow the frontend to communicate with this server
app.use(cors());
app.use(express.json());

// Optional Basic Auth (recommended even for internal sharing).
// Enable by setting BOTH env vars: DASHBOARD_USER and DASHBOARD_PASS.
const DASHBOARD_USER = (process.env.DASHBOARD_USER || '').trim();
const DASHBOARD_PASS = (process.env.DASHBOARD_PASS || '').trim();

function parseBasicAuth(header) {
    if (!header) return null;
    const m = /^Basic\s+(.+)$/i.exec(header);
    if (!m) return null;
    try {
        const decoded = Buffer.from(m[1], 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        if (idx < 0) return null;
        return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
    } catch {
        return null;
    }
}

app.use((req, res, next) => {
    if (!DASHBOARD_USER || !DASHBOARD_PASS) return next(); // auth disabled

    const creds = parseBasicAuth(req.headers.authorization);
    if (creds && creds.user === DASHBOARD_USER && creds.pass === DASHBOARD_PASS) return next();

    res.setHeader('WWW-Authenticate', 'Basic realm="Automation Runner"');
    return res.status(401).send('Unauthorized');
});

// Serve the dashboard UI
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Serve Playwright HTML report (static) at /report (like Playwright's default report folder)
app.use('/report', express.static(path.join(__dirname, 'playwright-report')));

// Serve Playwright raw artifacts (videos/screenshots/error-context) at /test-results.
// NOTE: Protect your service with Basic Auth (DASHBOARD_USER/DASHBOARD_PASS) to avoid leaking artifacts.
app.use(
    '/test-results',
    express.static(path.join(__dirname, 'test-results'), {
        etag: false,
        maxAge: 0,
        setHeaders: (res) => {
            res.setHeader('Cache-Control', 'no-store');
        },
    }),
);

// Render/cloud note: headed mode usually won't work (no display). Force headless when enabled.
const FORCE_HEADLESS =
    ['1', 'true', 'yes'].includes(String(process.env.FORCE_HEADLESS || '').toLowerCase()) ||
    !!process.env.RENDER;

// Simple endpoints for Render debugging (verify deployment is running this server)
app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        uptimeSec: Math.round(process.uptime()),
        forceHeadless: FORCE_HEADLESS,
        node: process.version,
        // Render metadata (best-effort; values depend on Render environment)
        render: {
            serviceId: process.env.RENDER_SERVICE_ID || null,
            instanceId: process.env.RENDER_INSTANCE_ID || null,
            gitCommit:
                process.env.RENDER_GIT_COMMIT ||
                process.env.RENDER_COMMIT ||
                process.env.GIT_COMMIT ||
                null,
        },
    });
});

app.get('/routes', (_req, res) => {
    res.json({
        sse: ['/stream-run-agent', '/stream-run-headed', '/stream-run-headless'],
        post: ['/run-test', '/run-all-tests-headed', '/run-all-tests', '/run-all-playwright', '/run-all', '/stop-run', '/debug-ui'],
        agents: Object.keys(AGENT_SPECS).sort(),
    });
});

function pwCommand({ headed, specOrDir }) {
    const safeTarget = specOrDir ? ` ${specOrDir}` : '';
    return headed
        ? `npm run test:headed -- --project=chromium${safeTarget}`
        : `npm test -- --project=chromium${safeTarget}`;
}

// Mapping of Agent IDs to your Playwright Commands
const AGENT_SPECS = {
    '1': 'automation/tests/agent1.spec.ts',
    '1.2': 'automation/tests/agent1.2.spec.ts',
    '2': 'automation/tests/agent2.spec.ts',
    '2.1': 'automation/tests/agent2.1.spec.ts',
    // Agent 3 = future-date termination, Agent 3.1 = terminate immediately
    '3': 'automation/tests/agent3.spec.ts',
    '3.1': 'automation/tests/agent3_1.spec.ts',
    '4': 'automation/tests/agent4.spec.ts',
    '4.1': 'automation/tests/agent4.1.spec.ts',
    '5': 'automation/tests/agent5.spec.ts',
    '5.1': 'automation/tests/agent5_1.spec.ts',
};

const AGENT_COMMANDS = Object.fromEntries(
    Object.entries(AGENT_SPECS).map(([id, spec]) => [
        id,
        pwCommand({ headed: !FORCE_HEADLESS, specOrDir: spec }),
    ]),
);

let isRunning = false;
let debugUiRunning = false;
let currentChild = null; // exec()-based run (non-streaming)
let currentStreamChild = null; // spawn()-based run (SSE streaming)
let currentRunCommand = null;
let currentRunStartedAtMs = null;

// SSE fan-out + reconnect support (Render/Cloudflare may drop long-lived streams).
// We buffer recent log lines so a reconnecting client can "catch up".
const RUN_LOG_MAX_LINES = Number(process.env.RUN_LOG_MAX_LINES || 2000);
const runLogBuffer = [];
const sseClients = new Set(); // { res, pingTimer }

function getRunStatus() {
    if (!isRunning) return { isRunning: false };
    const runningForMs = currentRunStartedAtMs ? Date.now() - currentRunStartedAtMs : null;
    return {
        isRunning: true,
        command: currentRunCommand,
        runningForSec: runningForMs !== null ? Math.round(runningForMs / 1000) : null,
        pid: currentStreamChild?.pid || currentChild?.pid || null,
        clients: sseClients.size,
    };
}

function writeSseHeaders(res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        // no-transform helps prevent proxies from buffering/chunking SSE.
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        // Some reverse proxies buffer responses unless explicitly disabled.
        'X-Accel-Buffering': 'no',
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function sseSend(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcastSse(event, data) {
    for (const client of sseClients) {
        try {
            sseSend(client.res, event, data);
        } catch { }
    }
}

function bufferLogLine(text) {
    runLogBuffer.push(text);
    if (runLogBuffer.length > RUN_LOG_MAX_LINES) {
        runLogBuffer.splice(0, runLogBuffer.length - RUN_LOG_MAX_LINES);
    }
}

function attachSseClient(res, { replay = false } = {}) {
    writeSseHeaders(res);

    // Reduce latency/buffering for SSE.
    try {
        res.socket?.setNoDelay?.(true);
    } catch { }

    // Keep-alive pings so proxies (Render, etc.) don't close idle SSE connections.
    const pingTimer = setInterval(() => {
        try {
            // SSE comment line (doesn't trigger an event).
            // Include padding to reduce the chance of intermediate proxies buffering tiny chunks.
            res.write(`: ping ${Date.now()} ${' '.repeat(2048)}\n\n`);
        } catch { }
    }, 15_000);

    const client = { res, pingTimer };
    sseClients.add(client);

    if (replay && runLogBuffer.length) {
        for (const line of runLogBuffer) {
            try {
                sseSend(res, 'line', { text: line });
            } catch { }
        }
    }

    res.on('close', () => {
        clearInterval(pingTimer);
        sseClients.delete(client);
    });

    return client;
}

function endAllSseClients() {
    for (const client of sseClients) {
        clearInterval(client.pingTimer);
        try { client.res.end(); } catch { }
    }
    sseClients.clear();
}

function killProcessTree(pid) {
    if (!pid) return Promise.resolve(false);

    return new Promise((resolve) => {
        try {
            if (isWindows) {
                // /T = kill child processes, /F = force
                const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: true, windowsHide: true });
                killer.on('exit', (code) => resolve(code === 0));
                killer.on('error', () => resolve(false));
                return;
            }

            // Best effort on POSIX
            try {
                // If process was spawned as its own process group (detached), this kills the whole group
                process.kill(-pid, 'SIGTERM');
                return resolve(true);
            } catch { }

            try {
                process.kill(pid, 'SIGTERM');
                return resolve(true);
            } catch { }

            return resolve(false);
        } catch {
            return resolve(false);
        }
    });
}

function runCommand(command, res) {
    if (isRunning) {
        return res.status(409).json({
            success: false,
            error: 'A test run is already in progress. Please wait until it finishes.',
            ...getRunStatus(),
        });
    }

    isRunning = true;
    currentRunCommand = command;
    currentRunStartedAtMs = Date.now();
    console.log(`Executing: ${command}`);

    const child = exec(
        command,
        {
            cwd: process.cwd(),
            maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
            shell: shell,
            detached: !isWindows,
        },
        (error, stdout, stderr) => {
            try {
                if (stdout) console.log(`\n=== STDOUT ===\n${stdout}\n`);
                if (stderr) console.log(`\n=== STDERR ===\n${stderr}\n`);

                if (error) {
                    console.error(`\n❌ Command failed with error: ${error.message}`);
                    return res.status(500).json({
                        success: false,
                        error: 'Test run failed. Check server logs for details.'
                    });
                }

                console.log(`\n✅ Command completed successfully`);
                return res.json({
                    success: true,
                    message: 'Execution successful. You can run another test.'
                });
            } finally {
                isRunning = false;
                currentChild = null;
                currentRunCommand = null;
                currentRunStartedAtMs = null;
            }
        }
    );

    currentChild = child;
}

// API Endpoint to trigger the test
app.post('/run-test', (req, res) => {
    const { agentId } = req.body;
    const command = AGENT_COMMANDS[agentId];

    if (!command) {
        return res.status(400).json({ error: 'Invalid Agent ID' });
    }

    console.log(`Received request to run Agent ${agentId}`);
    return runCommand(command, res);
});

// Run ALL tests in headed mode (chromium project)
app.post('/run-all-tests-headed', (_req, res) => {
    // Run all Playwright specs under automation/tests (headed, chromium).
    // (Project dependency "setup" will still run automatically.)
    const command = pwCommand({ headed: !FORCE_HEADLESS, specOrDir: 'automation/tests' });
    console.log(`Received request to run ALL Playwright tests (${FORCE_HEADLESS ? 'headless (forced)' : 'headed'}).`);
    return runCommand(command, res);
});

// Back-compat alias: /run-all-tests (headed)
app.post('/run-all-tests', (_req, res) => {
    const command = pwCommand({ headed: !FORCE_HEADLESS, specOrDir: 'automation/tests' });
    console.log(`Received request to run ALL Playwright tests (${FORCE_HEADLESS ? 'headless (forced)' : 'headed'}) via /run-all-tests.`);
    return runCommand(command, res);
});

// Run ALL Playwright tests (headless) for chromium project
app.post('/run-all-playwright', (_req, res) => {
    const command = pwCommand({ headed: false, specOrDir: 'automation/tests' });
    console.log('Received request to run ALL Playwright tests (headless).');
    return runCommand(command, res);
});

// Run ALL tests: Playwright (chromium) + BDD (Cucumber) sequentially
app.post('/run-all', (_req, res) => {
    // Works on both cmd.exe and bash: "&&" runs the second command only if the first succeeds.
    const command = 'npm test -- --project=chromium automation/tests && npm run bdd';
    console.log('Received request to run ALL tests (Playwright + BDD).');
    return runCommand(command, res);
});

/**
 * SSE streaming helper — spawns a shell command and sends each stdout/stderr
 * line as an SSE event so the browser can display live progress.
 */
function streamCommand(command, res) {
    // Always attach the client first.
    // If a run is in progress, we "join" it and replay buffered lines so reconnect works.
    attachSseClient(res, { replay: isRunning });

    if (isRunning) {
        sseSend(res, 'server_info', {
            message: 'A test run is already in progress. Attached to live output.',
            ...getRunStatus(),
        });
        // Send the current command as a start event for this client.
        sseSend(res, 'start', { command: currentRunCommand });
        return;
    }

    // Start a new run and broadcast to all connected clients.
    isRunning = true;
    currentRunCommand = command;
    currentRunStartedAtMs = Date.now();
    runLogBuffer.length = 0;

    broadcastSse('start', { command });
    console.log(`[stream] Executing: ${command}`);

    // IMPORTANT: Do NOT detach on Linux for SSE runs. Render/proxies may drop the SSE connection;
    // detaching can orphan the process and make stop/cleanup unreliable.
    const child = spawn(command, { cwd: process.cwd(), shell: true, detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
    currentStreamChild = child;

    child.stdout.on('data', (chunk) => {
        const lines = chunk.toString().split(/\r?\n/);
        for (const line of lines) {
            if (!line.trim()) continue;
            bufferLogLine(line);
            broadcastSse('line', { text: line });
        }
    });

    child.stderr.on('data', (chunk) => {
        const lines = chunk.toString().split(/\r?\n/);
        for (const line of lines) {
            if (!line.trim()) continue;
            bufferLogLine(line);
            broadcastSse('line', { text: line });
        }
    });

    const finish = (payload) => {
        broadcastSse('done', payload);
        endAllSseClients();
        isRunning = false;
        currentStreamChild = null;
        currentRunCommand = null;
        currentRunStartedAtMs = null;
    };

    child.on('exit', (code) => finish({ exitCode: code, success: code === 0 }));
    child.on('error', (err) => {
        broadcastSse('server_error', { message: err.message });
        finish({ exitCode: null, success: false });
    });
}

// Stop the currently running command (best-effort)
app.post('/stop-run', async (_req, res) => {
    if (!isRunning) {
        return res.status(409).json({ success: false, error: 'No run is currently in progress.' });
    }

    const pid = currentStreamChild?.pid || currentChild?.pid;
    const killed = await killProcessTree(pid);

    // Even if kill fails, mark as not running to unblock the UI (process may already be exiting)
    isRunning = false;
    currentChild = null;
    currentStreamChild = null;
    currentRunCommand = null;
    currentRunStartedAtMs = null;

    // Notify any connected SSE clients that the run was stopped.
    broadcastSse('server_error', { message: 'Run stopped by user.' });
    broadcastSse('done', { exitCode: null, success: false });
    endAllSseClients();

    if (!killed) {
        return res.status(500).json({ success: false, error: 'Failed to stop the running process (best-effort).' });
    }

    return res.json({ success: true });
});

// Run status endpoint (helps when the dashboard says "already running")
app.get('/run-status', (_req, res) => {
    res.json(getRunStatus());
});

// SSE stream — Run ALL tests headed
app.get('/stream-run-headed', (_req, res) => {
    streamCommand(pwCommand({ headed: !FORCE_HEADLESS, specOrDir: 'automation/tests' }), res);
});

// SSE stream — Run ALL tests headless
app.get('/stream-run-headless', (_req, res) => {
    streamCommand(pwCommand({ headed: false, specOrDir: 'automation/tests' }), res);
});

// SSE stream — Run a single agent test
app.get('/stream-run-agent', (req, res) => {
    const agentId = req.query.agentId;
    const command = AGENT_COMMANDS[agentId];
    if (!command) {
        writeSseHeaders(res);
        sseSend(res, 'server_error', { message: 'Invalid Agent ID' });
        sseSend(res, 'done', { exitCode: null, success: false });
        return res.end();
    }
    streamCommand(command, res);
});

// Start Playwright UI mode in the background (optional debug helper)
app.post('/debug-ui', (_req, res) => {
    if (isRunning) {
        return res.status(409).json({ success: false, error: 'A test run is in progress. Try Debug UI after it finishes.' });
    }
    if (debugUiRunning) {
        return res.status(409).json({ success: false, error: 'Debug UI is already running.' });
    }

    debugUiRunning = true;
    const command = 'npm run test:ui';
    console.log('Received request to start Playwright UI mode.');
    console.log(`Spawning: ${command}`);

    const child = spawn(command, {
        cwd: process.cwd(),
        shell: shell,
        windowsHide: false,
        detached: true,
        stdio: 'ignore',
    });

    child.unref();

    // Best-effort: mark as not running when the process exits.
    child.on('exit', () => {
        debugUiRunning = false;
    });
    child.on('error', () => {
        debugUiRunning = false;
    });

    // Playwright UI mode typically serves at localhost:9323
    return res.json({ success: true, url: 'http://localhost:9323' });
});

// Report availability check (dashboard can call this before opening /report/index.html)
app.get('/report-status', (_req, res) => {
    const reportIndex = path.join(__dirname, 'playwright-report', 'index.html');
    const exists = fs.existsSync(reportIndex);
    return res.json({ exists });
});

const server = app.listen(PORT, () => {
    console.log(`🚀 Automation Runner Server running at http://localhost:${PORT}`);
    console.log(`🧭 Dashboard: http://localhost:${PORT}/`);

});

// Ensure the process stays alive in terminals/environments where stdin may be closed unexpectedly.
// (Express listen normally keeps Node alive, but this makes startup more resilient on Windows shells.)
try {
    process.stdin.resume();
} catch { }

server.on('error', (err) => {
    // Common when server is already running in another terminal
    if (err && err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. If the server is already running, open: http://localhost:${PORT}/`);
        process.exit(0);
    }
    console.error('❌ Server failed to start:', err);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => process.exit(0));
});