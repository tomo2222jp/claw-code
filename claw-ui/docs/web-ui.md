# Web UI

For the end-to-end setup and verification flow of the current `claw-ui` vertical slice, start with `C:\temp\claw-code\claw-ui\docs\vertical-slice.md`.

## Setup

Run backend first:

```bash
cd C:\temp\claw-code\claw-ui\apps\local-api
npm install
npm run dev
```

Then run the UI:

```bash
cd C:\temp\claw-code\claw-ui\apps\web-ui
npm install
npm run dev
```

Default dev URLs:

- web-ui: `http://127.0.0.1:5173`
- local-api: `http://127.0.0.1:4000`

Vite proxies `/api/*` to the local-api dev server.

## Screens

- `Run`
  prompt input, run, stop, clearer status badge, timestamps, short error summary, final output
- `Settings`
  active provider, active model, retry count, OpenAI base URL
- `Logs`
  current run logs with 2-second polling, stream legend, per-stream counts, clearer system/stdout/stderr separation

## Backend connection check

1. Open the Settings tab and confirm values load.
2. Change a setting and press Save.
3. Go to Run and press Run.
4. Confirm run id and status update.
5. Open Logs and confirm log rows appear.
6. Start another run and press Stop to verify the stop flow.
7. Confirm Run shows short failure text while Logs keeps the detailed stderr trail.
8. Confirm completed and stopped runs are visually distinct in both Run and Logs.

## Environment override

If you do not want to use the Vite proxy, set:

```bash
VITE_API_BASE_URL=http://127.0.0.1:4000
```

## Verification checklist

- Backend down case
  Stop `local-api`, refresh the page, and confirm health/settings errors are visible instead of silent failure.
- Settings save failure
  Break the backend or save route temporarily and confirm the Settings tab shows a save error message.
- Run failure
  Stop the backend and press Run, then confirm Run shows a startup error and does not create duplicate runs.
- Logs polling failure
  Start a run, then stop the backend, and confirm the Logs tab shows polling failure without crashing the page.
- Stop behavior
  Start a run and press Stop once; confirm status becomes `stopped` and logs include the stop message.
- Terminal state behavior
  Let a run reach `completed`, then confirm polling stops and pressing Stop is effectively harmless.
- Log observability
  During a real run, confirm system, stdout, and stderr rows are easy to distinguish and stream counts update as logs arrive.
- Failure readability
  Trigger a failing run and confirm Run shows the short error summary while the Logs tab still exposes the detailed stderr context.
