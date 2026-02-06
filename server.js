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

// Serve the dashboard UI
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Serve Playwright HTML report (static) at /report (like Playwright's default report folder)
app.use('/report', express.static(path.join(__dirname, 'playwright-report')));

// Mapping of Agent IDs to your Playwright Commands
const AGENT_COMMANDS = {
    '1': 'npm run test:headed -- --project=chromium automation/tests/agent1.spec.ts',
    '1.1': 'npm run test:headed -- --project=chromium automation/tests/agent1.1.spec.ts',
    '1.2': 'npm run test:headed -- --project=chromium automation/tests/agent1.2.spec.ts',
    '1.3': 'npm run test:headed -- --project=chromium automation/tests/agent1.3.spec.ts',
    '2': 'npm run test:headed -- --project=chromium automation/tests/agent2.spec.ts',
    '2.1': 'npm run test:headed -- --project=chromium automation/tests/agent2.1.spec.ts',
    '3.1': 'npm run test:headed -- --project=chromium automation/tests/agent3.spec.ts',
    '3': 'npm run test:headed -- --project=chromium automation/tests/agent3_1.spec.ts',
    '4': 'npm run test:headed -- --project=chromium automation/tests/agent4.spec.ts',
    '4.1': 'npm run test:headed -- --project=chromium automation/tests/agent4.1.spec.ts',
    '5': 'npm run test:headed -- --project=chromium automation/tests/agent5.spec.ts',
    '5.1': 'npm run test:headed -- --project=chromium automation/tests/agent5.1.spec.ts',
};

let isRunning = false;
let debugUiRunning = false;

function runCommand(command, res) {
    if (isRunning) {
        return res.status(409).json({
            success: false,
            error: 'A test run is already in progress. Please wait until it finishes.'
        });
    }

    isRunning = true;
    console.log(`Executing: ${command}`);

    exec(
        command,
        {
            cwd: process.cwd(),
            maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
            shell: shell
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
            }
        }
    );
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
    const command = 'npm run test:headed -- --project=chromium';
    console.log('Received request to run ALL tests (headed).');
    return runCommand(command, res);
});

// Back-compat alias: /run-all-tests (headed)
app.post('/run-all-tests', (_req, res) => {
    const command = 'npm run test:headed -- --project=chromium';
    console.log('Received request to run ALL tests (headed) via /run-all-tests.');
    return runCommand(command, res);
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
} catch {}

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