# Qi UI Automation (Playwright)

Run intake-agent automation tests via a simple dashboard or the CLI.

## Setup

```bash
npm install
npx playwright install
```


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

## Headed (visible browser) runs

Cloud PaaS hosts (Render/Railway/Fly.io) generally do **not** provide a GUI display, so Playwright can only run **headless** there.

If you need **headed** runs, use a **Windows VM** (Azure/AWS/GCP) and connect via RDP.