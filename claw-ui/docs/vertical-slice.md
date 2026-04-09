# Claw UI Vertical Slice

This document is the developer-facing entry point for the current `claw-ui` vertical slice:

- `web-ui`
- `local-api`
- `local-api` engine adapter boundary

It is intended to make setup, execution, verification, and handoff easier without changing the current architecture.

## Current shape

- `web-ui` is a thin React client for settings, run start/stop, and log visibility.
- `local-api` owns run lifecycle, run status, logs, final output, terminal states, and API response shape.
- `EngineAdapter` inside `local-api` owns execution concerns only.
- The current real adapter spawns the existing `claw` CLI and forwards stdout/stderr back into the `local-api` state model.

The current separation remains:

1. `web-ui`
2. `local-api`
3. `engine adapter`

## Prerequisites

- Node.js and npm available locally
- the `claw` Rust CLI built locally
- access to credentials expected by the spawned `claw` process

Expected paths in the current repo layout:

- repo root: `C:\temp\claw-code`
- web-ui: `C:\temp\claw-code\claw-ui\apps\web-ui`
- local-api: `C:\temp\claw-code\claw-ui\apps\local-api`
- default `claw` binary: `C:\temp\claw-code\rust\target\debug\claw.exe`

If the default binary path is not correct, set:

```bash
CLAW_CLI_PATH=C:\path\to\claw.exe
```

## Credentials and runtime expectations

- The spawned `claw` process still runs from the repo root.
- That means normal workspace `.claw` config discovery still applies for runtime settings outside the bridged local-api fields.
- Provider credentials are still expected to be available to the child process through the normal environment and existing config chain.
- On Windows, `HOME` is backfilled from `USERPROFILE` when needed by the adapter.

## Startup flow

Start `local-api` first:

```bash
cd C:\temp\claw-code\claw-ui\apps\local-api
npm install
npm run dev
```

Then start `web-ui`:

```bash
cd C:\temp\claw-code\claw-ui\apps\web-ui
npm install
npm run dev
```

Default dev URLs:

- web-ui: `http://127.0.0.1:5173`
- local-api: `http://127.0.0.1:4000`

The Vite dev server proxies `/api/*` to `local-api`.

If you do not want to use the Vite proxy, set:

```bash
VITE_API_BASE_URL=http://127.0.0.1:4000
```

## Authoritative settings behavior

For runs started through `POST /api/run`, saved `local-api` settings are authoritative for these execution settings:

- `activeProvider`
- `activeModel`
- `retryCount`
- `openaiBaseUrl`

Current mapping:

- `activeModel` -> `--model`
- `openaiBaseUrl` -> child env `OPENAI_BASE_URL`
- `activeProvider` -> child env `CLAW_ACTIVE_PROVIDER_OVERRIDE`
- `retryCount` -> child env `CLAW_RETRY_COUNT_OVERRIDE`

Precedence rule for local-api initiated runs:

- saved `local-api` settings win for the four bridged fields above
- repo-local `.claw/settings.local.json` can still affect unrelated runtime behavior

This rule applies only to runs started through the `local-api` execution path.

## Basic verification flow

Use this flow when validating the current vertical slice manually:

1. Open `http://127.0.0.1:5173`.
2. Confirm the health banner reports a healthy `local-api`.
3. Open `Settings` and confirm values load from `local-api`.
4. Change a setting and press `Save`.
5. Open `Run`, enter a prompt, and press `Run`.
6. Confirm a run id appears and the status moves through `starting` and `running`.
7. Open `Logs` and confirm system/stdout/stderr rows appear.
8. Confirm the Run tab shows short error text when a run fails.
9. Confirm the Logs tab keeps the detailed stderr trail for the same failure.
10. Start another run and press `Stop` once.
11. Confirm terminal status becomes `stopped` and does not flip back to `completed`.

## Smoke coverage

`local-api` includes an automated smoke harness for real execution behavior:

```bash
cd C:\temp\claw-code\claw-ui\apps\local-api
npm run smoke:real-execution
```

Current coverage:

- missing claw binary
- completed fixture run
- failed fixture run
- stop during running
- real auth missing

Optional live coverage:

- invalid model: requires valid provider credentials such as `OPENAI_API_KEY`
- completed live run: requires `LOCAL_API_SMOKE_RUN_COMPLETED=1`, `LOCAL_API_SMOKE_MODEL`, `LOCAL_API_SMOKE_BASE_URL`, and valid credentials

## Expected outcomes

- missing binary
  run start should fail cleanly without leaving ambiguous run state
- auth missing
  run should reach `failed` and logs should show credential guidance
- invalid model
  run should reach `failed` and preserve provider-side error detail in logs
- stop during running
  run should end as `stopped`
- completed run
  run should end as `completed` and `finalOutput` should contain the last meaningful stdout block when possible

## Current limitations

- `finalOutput` still uses a lightweight heuristic and not full structured parsing
- provider-specific live success and invalid-model verification still depend on available credentials
- runtime settings outside the four bridged fields can still come from the normal repo-local config chain
- stop is still best-effort process termination

## Related docs

- local-api details: `C:\temp\claw-code\claw-ui\docs\local-api.md`
- web-ui details: `C:\temp\claw-code\claw-ui\docs\web-ui.md`
- next development phases: `C:\temp\claw-code\claw-ui\docs\next-phases.md`
