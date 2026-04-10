# Claw Handover Spec (LLM Companion)

## Status

This file is the English LLM/tooling companion to:

- `C:\temp\claw-code\docs\claw-handover-spec.md`

Use this file when prompting GPT/Codex or other tooling that benefits from an English, stable, grep-friendly handover format.

The Japanese file remains the canonical human-facing handover spec.  
Both files should be updated in the same work unit whenever the spec changes.

Recommended opener:

> First read `C:\temp\claw-code\docs\claw-handover-spec.en.md` before making implementation or design decisions. If the spec needs to change, describe the change and get agreement before implementing it.

## Purpose

This document keeps `claw-code`, `claw-ui`, and `claw-studio` aligned across chats and implementation cycles.

It defines:

- the current architecture
- the fixed boundaries
- what is already implemented
- what the current priorities are
- what future chats should treat as true

## Product Direction

Current product direction:

- Engine repo: `claw-code`
- Provider path: OpenRouter-first
- Primary UI: `claw-studio` desktop workspace UI
- Secondary UI: `claw-ui` web client for verification and debugging

Long-term goal:

- use `claw-code` as the engine
- build a coding-agent workflow and workspace around it

## Roles

- User: final product direction, priority decisions, boundary decisions
- GPT / ChatGPT: planning, review, handoff shaping, repo-level judgment
- Codex: implementation, file edits, build/test verification

## Fixed Architecture

### Layering

The current layered split is fixed:

1. UI Layer
   - `apps/claw-studio` = primary desktop workspace UI
   - `claw-ui/apps/web-ui` = verification web client
2. App API Layer
   - `claw-ui/apps/local-api` = state owner
3. Engine Layer
   - `claw-code` runtime and execution bridge

### Fixed Boundaries

- `local-api` owns run lifecycle, run status, logs, final output, and stop state
- adapter / execution bridge owns execution concerns only
- `claw-studio` owns mirrored timeline and workspace/session UX only
- `claw-studio` must not become the run truth
- `shared/contracts` is the shared boundary for run-related types

### Non-Goals

Do not do these accidentally:

- collapse UI and engine concerns together
- turn `claw-studio` into the state owner
- push broad UI concerns into the adapter
- casually redesign contracts during UI work
- replace `claw-ui` instead of keeping it as the verification client

## Engine Decisions

### Active Model

`claw-code` uses an active-model approach rather than ad hoc model selection.

Core settings:

- `active_provider`
- `active_model`
- `fallback_provider`
- `fallback_model`
- `retry_count`

### OpenRouter Policy

OpenRouter is the default provider direction for current development.

- `active_provider=openrouter`
- `active_model` should use the OpenRouter model id
- transport may still use OpenAI-compatible paths internally

This is why logs may show both:

- `selected_provider=openai`
- `provider_intent=openrouter`

That split is currently expected.

### Permission Mode

Current supported permission modes:

- `default`
- `full_access`

Shared contract:

```ts
type PermissionMode = "default" | "full_access";

type RunRequest = {
  prompt: string;
  permissionMode?: PermissionMode;
};
```

Rules:

- missing `permissionMode` falls back to `default`
- invalid `permissionMode` falls back to `default`
- existing `{ prompt }` clients must keep working unchanged

Execution bridge mapping:

- `default -> --permission-mode default`
- `full_access -> --permission-mode danger-full-access`

## Model Selection Policy

LLM selection must follow the same boundary rules as other execution-affecting settings.

Current policy:

- provider/model truth remains with `local-api` and the execution path behind it
- `claw-studio` may expose model-selection UX, but it must not silently become the source of truth
- any execution-affecting model choice must flow through `shared/contracts -> local-api -> execution bridge`
- existing clients must remain compatible when model-related inputs are expanded

Implementation direction:

- short term: `claw-studio` may show or prepare model-selection UI, but execution truth stays aligned with `local-api` settings
- medium term: if per-session model selection is added, it must still be normalized by `local-api`
- do not add renderer-only model-selection behavior that bypasses `local-api`

## Preferred Models

Current preferred model direction:

- Primary implementation and validation model: `openai/gpt-oss-120b:free`

Current provider direction:

- Preferred provider intent: `openrouter`

Practical meaning:

- new work should assume `openai/gpt-oss-120b:free` is the first model to validate against
- UI and logs should remain understandable even when transport/provider display differs from provider intent
- other models may be evaluated later, but they are not current implementation priorities unless explicitly added to the spec

Not yet fixed:

- fallback model policy for production use
- model ranking UI in `claw-studio`
- session-level model persistence behavior

## Current Apps

### `claw-ui`

Role:

- verification web client
- vertical-slice validation surface
- API behavior and observability checks

Primary docs:

- `C:\temp\claw-code\claw-ui\docs\vertical-slice.md`
- `C:\temp\claw-code\claw-ui\docs\next-phases.md`

### `claw-studio`

Role:

- primary desktop workspace UI
- project/session/timeline/composer workspace
- mirrored run experience over `local-api`

Current UI direction:

- left sidebar for projects and sessions
- compact top bar
- central timeline
- bottom composer
- chat-first / minimal normal view
- debug and run details moved behind Details

## UI Direction Refinement

`claw-studio` should remain coding-tool-first rather than settings-heavy.

- the normal workspace view must stay minimal and low-noise
- advanced controls must not be always visible in the main workspace
- advanced features should live behind Details, panels, or secondary views
- workspace focus (`compose -> run -> inspect`) is prioritized over UI richness
- the sidebar should default to a collapsed icon rail rather than an always-expanded menu

Additional rules:

- project memory and settings must not dominate the main work surface
- new features must preserve a simple, mock-like mental model
- always-visible UI chrome should be minimized

## Current Implementation Status

### `local-api`

Implemented endpoints:

- `GET /api/health`
- `GET /api/settings`
- `POST /api/settings`
- `POST /api/run`
- `GET /api/run/:id/status`
- `GET /api/run/:id/logs`
- `POST /api/run/:id/stop`

Implemented responsibilities:

- settings JSON management
- run and log state ownership
- real claw adapter wiring
- settings precedence
- `permissionMode` normalization and bridge wiring

Settings precedence:

- for local-api initiated runs, saved local-api settings are authoritative
- bridged fields:
  - `activeProvider`
  - `activeModel`
  - `retryCount`
  - `openaiBaseUrl`

### `claw-ui/web-ui`

Implemented:

- Run / Settings / Logs pages
- observability improvements
- build and typecheck checks
- remains the verification UI

### `claw-studio`

Implemented:

- Electron + React + TypeScript shell
- project / session navigation
- timeline display
- composer
  - Enter to send
  - Shift+Enter for newline
  - auto-grow
- ja / en locale switching
- local-api health connection
- run start
- status / logs / final output mirroring via polling
- mirrored timeline view
- Jump to latest
- auto-scroll only when already near the bottom
- session persistence first version
- permission mode selector UI
- `permissionMode` wiring into the run request path
- debug information behind Details

Current UI behavior:

- composer is fixed at the bottom of the center pane
- timeline is the only scrolling area
- normal view prioritizes user / assistant / run status
- stdout / stderr / metadata stay inside Details

## Persistence Policy

`claw-studio` session persistence first version is implemented.

Storage:

- Electron `userData/studio-state.json`

Responsibility split:

- main: file path resolution and file I/O only
- preload: `loadStudioState()` / `saveStudioState()` only
- renderer store: hydration and debounced saving

Persisted data:

- `projects`
- `sessions`
- `timelineBySessionId`
- `selectedProjectId`
- `selectedSessionId`
- `locale`
- `sidebarCollapsed`

Not persisted:

- active run truth
- local-api health truth
- polling state
- running process restoration state

Rule:

- run truth must not be restored from persisted studio state

## Project Memory (Planned)

Project Memory is introduced as project-scoped long-lived context for `claw-studio`.

Purpose:

- preserve important project context across sessions
- separate project-level rules and decisions from session timeline history
- reduce repeated context restatement

Boundary rules:

- Project Memory belongs to `claw-studio` workspace responsibility
- Project Memory is not run truth
- Project Memory is separate from session timeline
- v1a includes storage and editing only
- execution injection is a later phase

V1a direction:

- persist project memory separately from timeline state
- keep memory UI minimal and secondary
- memory must not appear as a dominant UI surface
- optimize for human readability and manual editing

Future direction:

- allow user-explicit memory saving (`remember this`)
- allow assistant-suggested memory candidates
- memory updates must be reviewable and never silently auto-persisted

## Persistence Extension (Planned)

New persisted structure:

- `projectMemoryByProjectId`

Rules:

- it must remain separate from timeline and session state
- it must not restore run truth

## Context Management

Long-context usage is planned around three ideas:

- Context Guard
- Context Compression
- Session Rollover

Current intent:

- start new sessions deliberately instead of keeping a single endless session
- rollover should include a user-reviewable handoff
- exact behavior is still a later phase

## Current Phase

Current primary phase:

- `claw-ui`: verification UI
- `claw-studio`: execution workspace phase

Current main priorities:

1. improve `claw-studio` operator usability
2. refine Details into clearer metadata / output / diagnostics groupings
3. shape context-management behavior
4. improve config and path handling
5. prepare for packaging later

## Fixed Constraints

The following must stay true unless the spec is explicitly changed:

- keep the three-layer split
- keep `local-api` as the state owner
- keep adapter as execution bridge only
- keep `claw-studio` as a mirrored workspace UI rather than run truth
- keep OpenRouter as the current provider direction
- keep `selected_provider=openai / provider_intent=openrouter` as an expected normal state
- keep `claw-ui` as the verification client
- keep existing-client compatibility in mind for contract changes

## Work Rules For The Next Chat

Every next chat should follow this order:

1. read this file first
2. do not assume older chat memory is still correct if this file says otherwise
3. if a spec change is needed, describe it and record it in both spec files
4. prioritize `claw-studio` unless explicitly told otherwise
5. do not break `local-api` truth / state-owner boundaries
6. treat `claw-studio` as display/workspace responsibility first

## Current Summary

Current repo state at a glance:

- `claw-code`: active-model implementation exists and OpenRouter direction is already reflected
- `local-api`: run/log truth, adapter wiring, and `permissionMode` normalization are in place
- `claw-ui`: verification vertical slice is already working
- `claw-studio`: primary workspace UI is running with persistence, permission mode selection, and mirrored timeline behavior

Most likely next major area:

- `claw-studio` workspace evolution and model-selection shaping

## Change Log

### 2026-04-11

- added English LLM/tooling companion spec
- aligned English spec with the current `claw-studio`-first direction
- recorded persistence first version
- recorded `permissionMode` end-to-end wiring
- recorded explicit model-selection and preferred-model policy
