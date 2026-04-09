# Claw UI Next Phases

This document defines the next development phases after the current `claw-ui` vertical slice milestone.

It is intentionally short and forward-looking. The goal is to help future work continue from the current milestone without changing the established architecture.

## Milestone status

The current vertical slice is in place:

- `web-ui`, `local-api`, and the internal engine adapter boundary are established
- real `claw` execution is wired through `local-api`
- local-api initiated settings precedence is defined for the bridged execution settings
- smoke coverage exists for core real-execution scenarios
- web-ui observability is strong enough for basic debugging and handoff
- `vertical-slice.md` is the main setup and verification entry point

This means the next phases can focus on refinement and hardening instead of rethinking the slice.

## Phase 1: UI polish and operator usability

- goal
  Improve day-to-day usability of the current web UI for longer real runs and failure investigation.
- non-goals
  No API redesign, no local-api ownership changes, no Electron/Tauri work, no major visual rewrite.
- likely files and areas
  `C:\temp\claw-code\claw-ui\apps\web-ui\src\App.tsx`
  `C:\temp\claw-code\claw-ui\apps\web-ui\src\pages\run-page.tsx`
  `C:\temp\claw-code\claw-ui\apps\web-ui\src\pages\logs-page.tsx`
  `C:\temp\claw-code\claw-ui\apps\web-ui\src\components\*.tsx`
  `C:\temp\claw-code\claw-ui\apps\web-ui\src\styles.css`
- completion criteria
  Run and Logs feel easier to scan during longer executions.
  Failure and stop flows remain understandable without reading raw backend state.
  Page components remain thin and responsibilities do not shift into web-ui.

## Phase 2: Real execution robustness

- goal
  Reduce uncertainty in edge cases around process lifecycle, path assumptions, and provider-specific failure handling.
- non-goals
  No broad parsing system, no SSE/WebSocket redesign, no route contract change.
- likely files and areas
  `C:\temp\claw-code\claw-ui\apps\local-api\src\adapters\claw-engine-adapter.ts`
  `C:\temp\claw-code\claw-ui\apps\local-api\src\services\run-service.ts`
  `C:\temp\claw-code\claw-ui\apps\local-api\scripts\real-execution-smoke.ts`
  `C:\temp\claw-code\claw-ui\docs\local-api.md`
- completion criteria
  More edge cases are covered by deterministic smoke checks where possible.
  Path, spawn, stop, and abnormal-exit behavior are more predictable across environments.
  `local-api` remains the state owner and the adapter remains execution-only.

## Phase 3: Config and path handling cleanup

- goal
  Make execution assumptions easier to configure and safer to hand off across machines and future packaging work.
- non-goals
  No architecture merge between UI and backend, no provider abstraction rewrite.
- likely files and areas
  `C:\temp\claw-code\claw-ui\apps\local-api\src\adapters\claw-engine-adapter.ts`
  `C:\temp\claw-code\claw-ui\apps\local-api\src\services\settings-service.ts`
  `C:\temp\claw-code\claw-ui\docs\vertical-slice.md`
  `C:\temp\claw-code\claw-ui\docs\local-api.md`
- completion criteria
  Binary path, repo-root assumptions, and local-api-owned execution settings are clearer and easier to override intentionally.
  Developer setup requires fewer hidden environment assumptions.
  The precedence rule for local-api initiated runs stays explicit and testable.

## Phase 4: Workspace and packaging preparation

- goal
  Prepare the current slice for future local packaging work by reducing incidental friction in dev/build/test workflows.
- non-goals
  No Electron/Tauri implementation yet, no shell replacement, no cross-process redesign.
- likely files and areas
  `C:\temp\claw-code\claw-ui\package.json` or future workspace config
  `C:\temp\claw-code\claw-ui\apps\local-api\package.json`
  `C:\temp\claw-code\claw-ui\apps\web-ui\package.json`
  `C:\temp\claw-code\claw-ui\docs\vertical-slice.md`
- completion criteria
  Common developer commands are simpler to run from one place.
  Build, smoke, and startup workflows are easier to script and hand off.
  The slice is easier to wrap later without changing its boundaries.

## Phase 5: Electron/Tauri readiness

- goal
  Define what the current vertical slice would need in order to be embedded in a local desktop shell later.
- non-goals
  No actual Electron/Tauri code in this phase, no desktop-only branching in the current runtime path.
- likely files and areas
  `C:\temp\claw-code\claw-ui\docs\vertical-slice.md`
  `C:\temp\claw-code\claw-ui\docs\next-phases.md`
  future packaging notes under `C:\temp\claw-code\claw-ui\docs\`
- completion criteria
  Required assumptions for local packaging are written down.
  Remaining blockers are explicit: process management, bundled binary strategy, config storage, startup orchestration.
  The current slice remains runnable as plain web-ui plus local-api.

## Why this split

This phase split follows the current maturity of the slice:

1. Improve the operator experience first, because the current slice is already usable.
2. Harden real execution next, because it is the main risk area once usage expands.
3. Clean up config and path assumptions before they become harder to change.
4. Make dev workflows easier before introducing packaging complexity.
5. Treat desktop wrapping as a later readiness exercise instead of pulling it into the current slice too early.

The intent is to keep momentum while preserving the current boundaries:

1. `web-ui`
2. `local-api`
3. `engine adapter`
