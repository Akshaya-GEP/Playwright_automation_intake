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
