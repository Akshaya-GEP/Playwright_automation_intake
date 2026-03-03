# Qi UI Automation (Playwright)

Run intake-agent automation tests via a simple dashboard or the CLI.

## Setup

```bash
npm install
npx playwright install
```

## Environment variables (local)

- Copy `ENV.example` → `.env`
- Fill in `BASE_URL`, `QUBE_MESH_URL`, `USER_ID`, `PASSWORD`
- **Do not commit `.env`** (it must stay local only)
- If `.env` was ever pushed to GitHub, **rotate credentials immediately** and consider purging it from git history.


## Run via dashboard 

```bash
node server.js
```

- Open: `http://localhost:3001/`
- Use:
  - **Run Test**: runs the selected agent flow (headed)
  - **Run All Tests**: runs the full suite (headed)
  - **Report**: opens the latest Playwright HTML report

## Run via CLI [to run testsuite]

```bash
npm run test:headed -- --project=chromium
```

## BDD (Cucumber)

Supplier-offboarding (Agents `1`, `1.1`, `1.2`, `1.3`) can be run as a single Cucumber feature driven by CSV test data:

- Feature: `automation/bdd/features/supplier-offboarding.feature`
- Data: `automation/test-data/supplierOffboarding.csv` (lookup by `SNO`)

Run:

```bash
npm run bdd
```

Debug headed (so you can see the browser):

```bash
$env:PW_HEADED="true"
npm run bdd
```

## Debug (UI mode)

```bash
npm run test:ui
```

## Deploy on Render

**Recommended**: deploy using Docker (headless). This avoids Linux dependency issues when installing Playwright on PaaS hosts.

- **Service type**: Web Service
- **Runtime**: Docker
- **Start**: uses `CMD ["npm","start"]` from the Dockerfile
- **Port**: Render sets `PORT` automatically (server uses `process.env.PORT`)

### Steps

1. Push your code to GitHub.
2. In Render: **New +** → **Web Service** → connect your repo.
3. Choose **Docker**.
4. Add required env vars (see `ENV.md` / your internal doc):
   - `BASE_URL`, `QUBE_MESH_URL`, `USER_ID`, `PASSWORD`
5. (Recommended) Add access gate (internal sharing):
   - `DASHBOARD_USER`, `DASHBOARD_PASS` (enables Basic Auth)
6. Deploy.

After deploy, open the service URL to access the dashboard.

## Deploy on Fly.io (Docker) — recommended for SSE stability

### Prereqs

- Install `flyctl` (Fly.io CLI) and login.

### Steps

1. Create the Fly app (from repo root):

```bash
fly launch --no-deploy
```

2. Set secrets (required):

```bash
fly secrets set BASE_URL="..." QUBE_MESH_URL="..." USER_ID="..." PASSWORD="..."
```

3. Protect the dashboard (recommended):

```bash
fly secrets set DASHBOARD_USER="admin" DASHBOARD_PASS="change-me"
```

4. Deploy:

```bash
fly deploy
```

5. Open:

- Dashboard: `https://<your-app>.fly.dev/`
- Report: `https://<your-app>.fly.dev/report/index.html`

Notes:
- Keep **1 instance** (so the report you generate is served from the same machine): `fly scale count 1`
- Cloud runs are **headless** (the repo defaults `FORCE_HEADLESS=true` in `fly.toml`).

## GitHub Actions (trigger runs from a URL)

This repo includes a manual workflow: `.github/workflows/playwright-manual.yml`.

1. In GitHub repo settings, add **Repository secrets** (Actions):
   - `BASE_URL`, `QUBE_MESH_URL`, `USER_ID`, `PASSWORD`
2. Trigger the run:
   - Open GitHub → **Actions** → **Playwright (manual)** → **Run workflow**
3. View the report:
   - Open the workflow run → **Artifacts** → download `playwright-report` → open `index.html`

## Headed (visible browser) runs

Cloud PaaS hosts (Render/Railway/Fly.io) generally do **not** provide a GUI display, so Playwright can only run **headless** there.

If you need **headed** runs, use a **Windows VM** (Azure/AWS/GCP) and connect via RDP.