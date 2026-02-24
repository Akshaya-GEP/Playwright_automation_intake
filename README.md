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

This repo includes a `Dockerfile` that bundles Playwright browsers, which is the easiest way to deploy on Render.

- **Service type**: Web Service
- **Runtime**: Docker
- **Start**: uses `CMD ["npm","start"]` from the Dockerfile
- **Port**: Render sets `PORT` automatically (server uses `process.env.PORT`)

### Steps

1. Push your code to GitHub.
2. In Render: **New +** → **Web Service** → connect your repo.
3. Choose **Docker**.
4. (Recommended) Add env var:
   - `FORCE_HEADLESS=true` (headed mode usually won’t work on servers without a display)
5. Deploy.

After deploy, open the service URL to access the dashboard.