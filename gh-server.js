import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = Number(process.env.PORT || 3002);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── GitHub configuration (set via environment variables) ──
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim();
const GITHUB_REPO = (process.env.GITHUB_REPO || '').trim(); // e.g. "Akshaya-GEP/Playwright_automation_intake"
const GITHUB_WORKFLOW = 'playwright-manual.yml';
const GH_API = 'https://api.github.com';

app.use(cors());
app.use(express.json());

// ── Optional Basic Auth ──
const DASH_USER = (process.env.DASHBOARD_USER || '').trim();
const DASH_PASS = (process.env.DASHBOARD_PASS || '').trim();

app.use((req, res, next) => {
    if (!DASH_USER || !DASH_PASS) return next();
    const auth = req.headers.authorization;
    if (!auth) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Dashboard"');
        return res.status(401).send('Unauthorized');
    }
    const m = /^Basic\s+(.+)$/i.exec(auth);
    if (!m) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Dashboard"');
        return res.status(401).send('Unauthorized');
    }
    try {
        const decoded = Buffer.from(m[1], 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        const user = decoded.slice(0, idx);
        const pass = decoded.slice(idx + 1);
        if (user === DASH_USER && pass === DASH_PASS) return next();
    } catch { }
    res.setHeader('WWW-Authenticate', 'Basic realm="Dashboard"');
    return res.status(401).send('Unauthorized');
});

// ── Serve dashboard ──
app.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'gh-dashboard.html'));
});

app.get('/health', (_req, res) => {
    res.json({ ok: true, uptimeSec: Math.round(process.uptime()), configured: !!GITHUB_TOKEN && !!GITHUB_REPO });
});

// ── GitHub API helper ──
async function gh(endpoint, opts = {}) {
    if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not configured. Set it as an environment variable.');
    if (!GITHUB_REPO) throw new Error('GITHUB_REPO not configured. Set it as an environment variable (e.g. owner/repo).');

    const resp = await fetch(`${GH_API}${endpoint}`, {
        ...opts,
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(opts.headers || {}),
        },
    });
    return resp;
}

// ── POST /api/trigger — Trigger a workflow run ──
const VALID_AGENTS = [
    'suite', 'agent-1', 'agent-1.2', 'agent-2', 'agent-2.1',
    'agent-3', 'agent-3.1', 'agent-4', 'agent-4.1', 'agent-5', 'agent-5.1',
];

app.post('/api/trigger', async (req, res) => {
    try {
        const { agent } = req.body;
        if (!agent) return res.status(400).json({ error: 'Missing agent selection.' });
        if (!VALID_AGENTS.includes(agent)) return res.status(400).json({ error: `Invalid agent: ${agent}` });

        const resp = await gh(`/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`, {
            method: 'POST',
            body: JSON.stringify({ ref: 'main', inputs: { run: agent } }),
            headers: { 'Content-Type': 'application/json' },
        });

        if (resp.status === 204) {
            return res.json({ success: true, message: `Workflow triggered for "${agent}". It will appear in the runs list shortly.` });
        }

        const body = await resp.text().catch(() => '');
        return res.status(resp.status).json({ error: `GitHub returned ${resp.status}: ${body}` });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ── GET /api/runs — List recent workflow runs ──
app.get('/api/runs', async (_req, res) => {
    try {
        const resp = await gh(`/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/runs?per_page=15`);
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            return res.status(resp.status).json({ error: `GitHub ${resp.status}: ${body}` });
        }
        const data = await resp.json();
        const runs = (data.workflow_runs || []).map(r => ({
            id: r.id,
            status: r.status,
            conclusion: r.conclusion,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            htmlUrl: r.html_url,
            actor: r.actor?.login || 'unknown',
            runNumber: r.run_number,
            displayTitle: r.display_title || r.name || '',
        }));
        return res.json({ runs });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ── GET /api/runs/:runId — Single run status ──
app.get('/api/runs/:runId', async (req, res) => {
    try {
        const resp = await gh(`/repos/${GITHUB_REPO}/actions/runs/${req.params.runId}`);
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            return res.status(resp.status).json({ error: `GitHub ${resp.status}: ${body}` });
        }
        const r = await resp.json();
        return res.json({
            id: r.id,
            status: r.status,
            conclusion: r.conclusion,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            htmlUrl: r.html_url,
            actor: r.actor?.login || 'unknown',
            runNumber: r.run_number,
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ── GET /api/artifacts/:runId — List artifacts for a run ──
app.get('/api/artifacts/:runId', async (req, res) => {
    try {
        const resp = await gh(`/repos/${GITHUB_REPO}/actions/runs/${req.params.runId}/artifacts`);
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            return res.status(resp.status).json({ error: body });
        }
        const data = await resp.json();
        const artifacts = (data.artifacts || []).map(a => ({
            id: a.id,
            name: a.name,
            sizeMB: (a.size_in_bytes / 1024 / 1024).toFixed(1),
            expired: a.expired,
        }));
        return res.json({ artifacts });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ── GET /api/download/:artifactId — Proxy artifact download ──
app.get('/api/download/:artifactId', async (req, res) => {
    try {
        const ghResp = await fetch(
            `${GH_API}/repos/${GITHUB_REPO}/actions/artifacts/${req.params.artifactId}/zip`,
            {
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github+json',
                },
                redirect: 'manual',
            }
        );

        // GitHub returns 302 with a signed URL that doesn't need auth
        if (ghResp.status === 302) {
            const signedUrl = ghResp.headers.get('location');
            return res.redirect(signedUrl);
        }

        return res.status(ghResp.status).json({ error: `GitHub returned ${ghResp.status}` });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ── GET /api/config — Repo info for the dashboard ──
app.get('/api/config', (_req, res) => {
    res.json({
        repo: GITHUB_REPO || '(not set)',
        workflow: GITHUB_WORKFLOW,
        configured: !!GITHUB_TOKEN && !!GITHUB_REPO,
        repoUrl: GITHUB_REPO ? `https://github.com/${GITHUB_REPO}` : null,
        actionsUrl: GITHUB_REPO ? `https://github.com/${GITHUB_REPO}/actions` : null,
    });
});

// ── Start ──
const server = app.listen(PORT, () => {
    console.log(`\n🚀 GitHub Actions Dashboard: http://localhost:${PORT}`);
    if (!GITHUB_TOKEN) console.warn('⚠️  GITHUB_TOKEN not set — set it to enable workflow triggers.');
    if (!GITHUB_REPO) console.warn('⚠️  GITHUB_REPO not set — set it to "owner/repo" format.');
    console.log('');
});

server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        process.exit(0);
    }
    console.error('❌ Server failed to start:', err);
    process.exit(1);
});

