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

## Run via CLI 

```bash
npm run test:headed -- --project=chromium
```

## Debug (UI mode)

```bash
npm run test:ui
```
