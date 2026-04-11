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

type ImageAttachment = {
  id: string;
  data: string;  // base64 data URL
  mimeType: string;
};

type InjectedProjectMemory = {
  rules?: string[];
  decisions?: string[];
  currentFocus?: string[];
  pinnedItems?: string[];
};

type RunRequest = {
  prompt: string;
  permissionMode?: PermissionMode;
  attachments?: ImageAttachment[];
  projectMemory?: InjectedProjectMemory;
};
```

Rules:

- missing `permissionMode` falls back to `default`
- invalid `permissionMode` falls back to `default`
- existing `{ prompt }` clients must keep working unchanged
- `attachments` carries pasted/dragged/selected image files (pass-through)
- `projectMemory` carries only accepted durable memory (rules, decisions, focus, pinned)
- pending/suggested memory is never included
- empty memory sections are excluded from payload

Execution bridge mapping:

- `default -> --permission-mode default`
- `full_access -> --permission-mode danger-full-access`
- `projectMemory` → minimal prompt injection (if present)
- `attachments` → factual acknowledgment in prompt (if present)

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
- timeline display with quiet, low-noise styling
- composer with multi-method image attachments
  - Enter to send
  - Shift+Enter for newline
  - auto-grow
  - Ctrl+V image paste
  - drag & drop image support
  - file picker button for image selection
- image attachment display as compact removable chips
- ja / en locale switching
- local-api health connection
- run start with attachments and project memory
- status / logs / final output mirroring via polling
- mirrored timeline view
- Jump to latest
- auto-scroll only when already near the bottom
- session persistence first version
- permission mode selector UI
- `permissionMode` wiring into the run request path
- response copy button on assistant messages with temporary "Copied" feedback
- debug information behind Details
- collapsed icon rail default
- expandable sidebar panel for projects and sessions
- right-side Project Memory overlay
- project-scoped memory persistence (`projectMemoryByProjectId`)
- lightweight Project Memory edit mode
- Project Memory v2 capture flow (timeline → pending review → durable memory)
- Project Memory v3 assistant suggestion detection and deduplication
- workspace context strip for project / memory / session framing
- shell polish: de-emphasized run/status events, reduced Details weight, improved hierarchy

Current UI behavior:

- composer is fixed at the bottom of the center pane
- timeline is the only scrolling area
- normal view prioritizes user / assistant / run status
- stdout / stderr / metadata stay inside Details
- Project Memory stays secondary and opens as a right overlay
- run requests carry composed text, pasted/dropped/selected image attachments, and accepted durable project memory

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
- `projectMemoryByProjectId`
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

Current implementation status:

- project-scoped memory storage is implemented in `claw-studio`
- memory is persisted separately from timeline/session history
- memory opens in a right-side overlay
- lightweight manual editing is implemented
- Project Memory v1a, v2, v3 all implemented with full lifecycle
- execution injection is implemented: accepted durable memory is carried in RunRequest
- adapter layer injects memory into prompt minimally and conditionally
- run requests include: `prompt`, `attachments`, `projectMemory` (durable items only)
- pending/suggested memory is never injected

V2 direction:

- timeline items may expose subtle capture actions for user-explicit memory saving
- capture must stage a reviewable candidate before any durable memory write
- accepted `rule` / `decision` / `current_focus` candidates promote into durable Project Memory fields
- accepted `pinned` items may stay in a small overlay-only pinned section rather than expanding the durable memory schema
- pending review must live inside the Project Memory overlay, not as a separate dashboard surface

V2 hygiene direction:

- overlay sections should stay structured as Summary / Rules / Decisions / Current Focus / Pinned / Pending Review
- empty durable sections should be hidden when possible, while Pending Review may show a minimal empty state
- exact-duplicate durable accepts should be ignored rather than duplicated
- durable memory items and pinned items must support lightweight removal
- long text should stay readable via clamp-first display with a simple way to expand

V3 assistant-suggested direction:

- assistant-suggested memory must stay subtle and user-controlled
- suggestions should appear only on eligible assistant/final-output timeline items
- the first implementation should use simple renderer/store heuristics rather than a new LLM call
- suggestion buttons should stage into Pending Review rather than writing durable memory directly
- durable memory still changes only after the existing accept flow
- suggestion state may stay lightweight and derived as long as dismissed suggestions do not immediately reappear

Future direction:

- allow user-explicit memory saving (`remember this`)
- allow assistant-suggested memory candidates
- memory updates must be reviewable and never silently auto-persisted

## Persistence Extension (Planned)

New persisted structure:

- `projectMemoryByProjectId`
- `projectMemoryCandidatesByProjectId`

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
- `local-api`: run/log truth, adapter wiring, extended RunRequest with `attachments` and `projectMemory` fields
- `claw-ui`: verification vertical slice is already working
- `claw-studio`: quiet, chat-first workspace UI with image attachments, response copy, low-noise design
  - image attachments: paste (Ctrl+V), drag & drop, file picker
  - assistant responses: copy-to-clipboard button
  - Project Memory: v1a (storage), v2 (capture flow), v3 (assistant suggestions) all complete
  - run injection: accepted durable memory carried in RunRequest and injected into prompt
  - attachment awareness: factual acknowledgment in prompt when images present

Most likely next major area:

- `claw-studio` model selection UI, wired through `local-api` without breaking state ownership

## Confirmed Decisions

- `claw-studio` remains the primary UI and should keep a coding-tool-first workspace shell
- workspace polish should improve framing and readability without moving execution truth away from `local-api`
- Project Memory remains a secondary surface; lightweight inline context is acceptable, but the full editor stays in the right overlay
- normal timeline view should stay low-noise, with deeper run output still living behind Details
- Project Memory v2 uses user-explicit capture with pending review before durable memory writes
- accepted `pinned` items may remain overlay-only instead of changing the durable memory fields
- Project Memory hygiene should prefer low-noise readability over richer management UI
- Project Memory v3 should keep assistant suggestions subtle on assistant/final-output items and must never auto-save durable memory
- assistant suggestions should stage into the same Pending Review gate rather than creating a second review surface
- Project Memory v2 capture flow is implemented
  - timeline items provide subtle capture actions:
    - `Pin`
    - `Save as Rule`
    - `Save as Decision`
    - `Save as Current Focus`
  - capture creates a pending candidate first
  - durable memory updates only via `Accept` from Pending Review
  - `Dismiss` prevents promotion to durable memory
- Project Memory hygiene is implemented
  - exact duplicate prevention applies on durable accept
  - remove actions exist for Rules / Decisions / Current Focus / Pinned
  - `updatedAt` updates on accept and remove
  - the memory overlay uses Summary / Rules / Decisions / Current Focus / Pinned / Pending Review
  - empty states are defined for both memory and pending
- UI remains coding-tool-first and low-noise
  - capture actions stay subtle and hover/focus-first
  - Project Memory overlay remains secondary
  - normal timeline structure remains unchanged

## Resolved Items

- ✅ execution injection from Project Memory into run context (Phase 8A)
- ✅ minimal prompt injection of accepted durable memory (Phase 8B-1)
- ✅ factual attachment awareness in prompt (Phase 8B-2)
- ✅ image attachment support: paste, drag & drop, file picker (Phase 7G-3)
- ✅ response copy button on assistant messages (Phase 7G-2)
- ✅ quiet workspace visual polish (Phase 7G-1)
- ✅ Project Memory v1–v3 complete with full lifecycle
- ✅ duplicate handling with exact-match and normalized suppression

## Unresolved Items (Later Phases)

- how session-level model selection should appear once it is wired through `shared/contracts -> local-api` (Phase 8C)
- whether role-based agent modes should be part of model selection or separate (Phase 8D)
- how memory ranking should handle large context (Phase 8E)
- whether web search should be integrated with memory (Phase 8F)
- whether git read tools should use MCP or direct subprocess (Phase 8G)
- whether the v2 shell needs a stronger top-level project switcher beyond the current rail + expandable panel
- whether Project Memory should gain explicit quick actions in the workspace header beyond opening the overlay
- whether run summaries should become richer than the current status + Details grouping
- whether pinned items should later gain ordering controls beyond simple add/remove
- whether suggestion heuristics should later become configurable or remain fixed/simple
- whether later phases should expose a lightweight way to permanently dismiss a suggestion source beyond hidden rejected candidates
- memory ranking and prioritization for long-running sessions (Phase 8E)
- multimodal image consumption when CLI supports it (future)

## Next Entry Point

- Phases 7F–8B are complete and production-ready
- the next phase is **Phase 8C: Model Selection**
  - add per-session model selection UI in `claw-studio`
  - wire selection through `local-api` without breaking state ownership
  - maintain backward compatibility with active model settings
  - keep implementation minimal and reversible
- start implementation from `apps/claw-studio/src/renderer/pages/workspace-page.tsx` and `studio-store.ts`
- model selection should use existing run request pipeline, not create new structures
- after Phase 8C, next phases are 8D (agent modes), 8E (memory prioritization), 8F (web search), 8G (git tools)
- MCP integration should remain for later phases, after these core execution modes are stable

## Change Log

### 2026-04-11 (Updated for Phase 8B Completion)

- **Phases 7G-1/2/3 complete**: quiet workspace, response copy, image attachments (paste/drag/picker)
- **Phase 8A complete**: run request carries attachments and accepted durable project memory
- **Phase 8B-1/2 complete**: adapter injects memory and attachment awareness into prompt
- **Contract updated**: RunRequest now includes `attachments` and `projectMemory` fields
- **Next entry point**: Phase 8C (model selection per-session)
- **Roadmap updated**: phases 8C–8G outlined, MCP deferred to later phases
- **Spec aligned**: current status reflects all completed implementation work

### 2026-04-11 (Original)

- added English LLM/tooling companion spec
- aligned English spec with the current `claw-studio`-first direction
- recorded persistence first version
- recorded `permissionMode` end-to-end wiring
- recorded explicit model-selection and preferred-model policy
- recorded collapsed-rail + Project Memory overlay implementation progress
- recorded workspace-shell polish direction: minimal context strip, fixed low-noise timeline, Project Memory still secondary
- recorded Project Memory v2 direction: subtle capture actions, pending review, accept/dismiss promotion flow
- recorded Project Memory hygiene direction: hidden empty sections, exact duplicate prevention, remove actions, clamp-first readability
- recorded Project Memory v3 direction: assistant/final-output suggestions stay heuristic, subtle, and review-gated via Pending Review
