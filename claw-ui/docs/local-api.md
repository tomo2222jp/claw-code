# Local API

For the end-to-end setup and verification flow of the current `claw-ui` vertical slice, start with `C:\temp\claw-code\claw-ui\docs\vertical-slice.md`.

## Setup

```bash
cd claw-ui/apps/local-api
npm install
```

## Run

```bash
npm run dev
```

Server defaults:

- host: `127.0.0.1`
- port: `4000`

## Build

```bash
npm run build
```

## API

- `GET /api/health`
- `GET /api/settings`
- `POST /api/settings`
- `POST /api/run`
- `GET /api/run/:id/status`
- `GET /api/run/:id/logs`
- `POST /api/run/:id/stop`

## Storage

- settings file: `claw-ui/apps/local-api/data/settings.json`
- run state: in memory
- run logs: in memory

## Engine adapter boundary

- `RunService` remains the state owner for run lifecycle, status, logs, final output, and terminal-state handling.
- `EngineAdapter` is an internal `local-api` boundary at `claw-ui/apps/local-api/src/adapters/engine-adapter.ts`.
- Adapters are responsible only for execution concerns: starting work, emitting status/log events back to `RunService`, and handling stop requests.
- Terminal states remain defined in `local-api`, so a future real claw adapter should be swappable without route or API contract changes.

## Real claw adapter

- The current real adapter is `claw-ui/apps/local-api/src/adapters/claw-engine-adapter.ts`.
- It spawns the existing `claw` CLI as a child process, streams `stdout` and `stderr` into the current log model, and derives `finalOutput` from `stdout` with a small heuristic plus a trimmed-stdout fallback.
- `POST /api/run` now reads the saved local-api settings first and passes that settings snapshot into the adapter for the lifetime of the spawned run.
- Default process assumptions:
  - repo root resolves from `claw-ui/apps/local-api` to `C:\temp\claw-code`
  - CLI binary resolves to `rust/target/debug/claw(.exe)`
  - child process runs from the repo root so workspace `.claw` config can be discovered
  - `HOME` is backfilled from `USERPROFILE` on Windows when needed
  - execution uses `--permission-mode danger-full-access` because the local API is unattended
- Precedence rule for `POST /api/run`:
  - saved local-api settings are authoritative for local-api initiated runs
  - repo-local `.claw/settings.local.json` still participates for unrelated runtime config, but it no longer wins over local-api values for `activeProvider`, `activeModel`, `retryCount`, or `openaiBaseUrl`
- Current settings wiring:
  - `activeModel` is passed via `--model`
  - `openaiBaseUrl` is passed via child-process `OPENAI_BASE_URL`
  - `activeProvider` is passed via child-process `CLAW_ACTIVE_PROVIDER_OVERRIDE`
  - `retryCount` is passed via child-process `CLAW_RETRY_COUNT_OVERRIDE`
- Optional overrides:
  - `CLAW_CLI_PATH` can point at a different built `claw` binary

## Smoke coverage

- Automated smoke harness:
  - run `npm run smoke:real-execution` from `claw-ui/apps/local-api`
  - deterministic adapter coverage:
    - missing claw binary
    - completed run
    - failed run
    - stop during running
  - real claw coverage without provider credentials:
    - auth missing
  - optional live coverage:
    - invalid model: requires `OPENAI_API_KEY`
    - completed run: requires `LOCAL_API_SMOKE_RUN_COMPLETED=1`, `LOCAL_API_SMOKE_MODEL`, `LOCAL_API_SMOKE_BASE_URL`, and valid credentials

## Verification checklist

- `missing claw binary`
  - expected: run start fails before any run state is left behind
- `auth missing`
  - expected: run reaches `failed`, stderr logs include missing credential guidance
- `invalid model`
  - expected: run reaches `failed`, stderr logs preserve provider-side model error details
- `stop during running`
  - expected: terminal status is `stopped`, not `completed`
- `completed run`
  - expected: terminal status is `completed`, `finalOutput` prefers the last meaningful stdout block
- `failed run`
  - expected: terminal status is `failed`, `errorMessage` is a short summary while full stderr remains in logs

## Current limitations

- The first real-adapter version still avoids structured parsing of claw output.
- `finalOutput` extraction now prefers the last non-empty `stdout` block after light cleanup, then falls back to full trimmed `stdout`.
- It assumes credentials and model-related runtime configuration are already available to the spawned `claw` process through the workspace `.claw` config and ambient environment.
- Other repo-local runtime settings outside the four bridged fields can still affect execution, because the child process still runs from the repo root and loads the normal project config chain.
- Stop is best-effort process termination; there is no process-tree cleanup or escalation beyond the initial kill request.

## Next UI integration points

- `GET /api/settings` for initial settings screen hydration
- `POST /api/settings` for settings save
- `POST /api/run` to start prompt execution
- `GET /api/run/:id/status` for polling run lifecycle
- `GET /api/run/:id/logs` for console/log panel
- `POST /api/run/:id/stop` for stop button wiring
