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

- `default -> --permission-mode workspace-write`
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

## LLM Selection Policy

Current product direction for normal UX:

- present the product as if it uses a single default AI
- keep advanced provider/model selection out of the normal workspace surface

Internal direction:

- keep the architecture multi-LLM capable
- `local-api` remains the truth owner for LLM settings
- `claw-studio` may expose input/display for settings but must not become the truth owner

Recommended internal shape:

- `executionMode` = `cloud | local`
- `provider`
- `modelId`

Recommended UX:

- `Standard` = product-default AI
- `Local` = local LLM mode
- `Advanced` = explicit provider/model selection

Rule:

- keep normal UX simple for general users
- keep the internal design extensible for future multi-LLM support
- keep runtime tuning values such as stop timeout separate from the LLM settings shape
- manage runtime tuning values through `local-api` settings, not through the LLM selection path

## Cloud Provider Taxonomy

Cloud-provider naming must be explicit and stable at the `local-api` boundary.

Fixed cloud provider ids:

- `google`
- `openrouter`
- `openai`
- `anthropic`

Rules:

- `executionMode=cloud` means `provider` must resolve to one of the fixed cloud provider ids above
- `executionMode=local` is a separate path and must not be conflated with cloud-provider billing or routing
- keep `provider` as the execution/billing path identifier, not as a vague model-family label
- future providers may be added later, but they must be added deliberately to the taxonomy rather than inferred from model names

## Gemini Routing Policy

Gemini direct and Gemini-via-OpenRouter are separate execution paths and must stay distinguishable.

Rules:

- `provider=google` means direct Google API / Google billing / Google endpoint
- `provider=openrouter` with a Gemini-family `modelId` means OpenRouter routing and OpenRouter billing, even if the underlying model family is Gemini
- Gemini model family naming must not silently imply `provider=google`
- OpenRouter Gemini usage must remain a valid option, but it is not the same path as Google direct
- logs and diagnostics should make the chosen provider path understandable without requiring users to infer it from transport details

Practical interpretation:

- `google + gemini-*` = Gemini direct
- `openrouter + google/gemini-*` or another Gemini-family OpenRouter model id = Gemini through OpenRouter

## Standard Provider Default

Standard mode should now prefer direct Gemini rather than Gemini hidden behind OpenRouter.

Current default:

- `executionMode=cloud`
- `provider=google`
- `modelId=gemini-2.5-flash`
- `profile=standard`

Rules:

- Standard must remain a single-default-AI experience in the UI
- `claw-studio` may show `Standard`, but `local-api` owns the actual resolved provider/model
- if Standard defaults change later, they should be changed in one place at the `local-api` settings-resolution layer

## Advanced Provider Policy

Advanced mode is the explicit provider-selection surface.

Rules:

- Advanced must allow explicit provider choice among the supported cloud taxonomy values
- Advanced may also choose `executionMode=local` for local-provider use, but that remains separate from cloud taxonomy
- provider choice must remain explicit in saved `llmSettings`
- `claw-studio` stays input/display only and must not own resolution logic
- `local-api` remains the truth owner for provider/model resolution and compatibility fallback

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
- sessions and Project Memory are accessed via rail-triggered overlay panels
- overlay panels are mutually exclusive
- overlay panels support toggle close, backdrop click close, and Esc close
- run information is de-emphasized in normal view and accessible via Details
- assistant labels are minimized and only shown on user -> assistant transitions
- debug and run details are always behind Details

Current UI behavior:

- composer is fixed at the bottom of the center pane and acts as the primary interaction focus
- timeline is the only scrolling area
- normal view prioritizes user / assistant conversation flow over execution details
- run information is displayed minimally (status + Details) and not as a primary UI element
- assistant labels are conditionally rendered to reduce repetition noise
- sessions and Project Memory are opened via rail-triggered overlays
- overlays are exclusive and closing returns focus to the originating rail control
- stdout / stderr / metadata stay inside Details

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

## Runtime / Execution (Planned Improvements)

The current run execution model keeps `local-api` as the state owner and uses the adapter as the boundary to the engine.

Future improvements in Phase 9.5 will focus on:

- run state stability
- reliable stop / cancel behavior
- streaming / progressive output
- clear error classification and visibility
- retry handling
- logs / details readability

These improvements must preserve the existing architecture.

The following must remain true:

- `local-api` remains the single source of truth for run state
- the adapter remains the integration boundary for prompt, context, and tools
- the UI must not depend directly on internal run mechanics

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

## Current Phase

Current primary phase:

- Phase 7G UI simplification: completed
- next phase: Phase 9.5 Runtime strengthening

Current main priorities:

1. strengthen runtime robustness and lifecycle handling
2. refine run-state visibility without breaking chat-first UX
3. improve error, stop, and abnormal-exit handling
4. maintain strict local-api state ownership
5. prepare runtime behavior for packaging and multi-environment stability

Current repo state at a glance:

- `claw-code`: active-model implementation exists and OpenRouter direction is already reflected
- `local-api`: run/log truth, adapter wiring, and `permissionMode` normalization are in place
- `claw-ui`: verification vertical slice is already working
<<<<<<< HEAD
- `claw-studio`: primary workspace UI is running with persistence, permission mode selection, and mirrored timeline behavior

Most likely next major area:

- `claw-studio` workspace evolution and model-selection shaping
=======
- `claw-studio`: quiet, chat-first workspace UI with full execution integration
  - Phase 7G UI simplification is complete
  - composer is the primary interaction surface
  - timeline is the only scrolling area
  - sessions and Project Memory are rail-triggered overlays
  - overlays are exclusive and return focus to the originating rail control on close
  - run information stays minimized in normal view and lives behind Details
  - image attachments: paste (Ctrl+V), drag & drop, file picker
  - assistant responses: copy-to-clipboard button
  - Project Memory: v1a (storage), v2 (capture flow), v3 (assistant suggestions) all complete
  - model selection: per-session UI, saved through local-api settings
  - role-based modes: default/planner/builder/reviewer with prompt shaping
  - run injection: accepted durable memory prioritized and injected into prompt
  - memory prioritization: pinnedItems/currentFocus/decisions/rules with fixed per-section limits
  - attachment awareness: factual acknowledgment in prompt when images present
  - web search: minimal explicit-trigger search with bounded results
  - git read tools: safe read-only file reading and git log inspection

Most likely next major area:

- Phase 9: Configuration Cleanup (path management, settings unification)

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
- Git tooling stays phased and conservative
  - Phase 8G is read-only repository context only
  - no git write path is active in the adapter or UI
  - Controlled Git Write is planned for a later phase only
- cloud provider taxonomy is fixed at:
  - `google`
  - `openrouter`
  - `openai`
  - `anthropic`
- Gemini direct and Gemini through OpenRouter are separate paths and must never be treated as the same provider route
- Standard should default to direct Gemini:
  - `executionMode=cloud`
  - `provider=google`
  - `modelId=gemini-2.5-flash`
- Advanced is the explicit provider-selection path and should be the place where OpenRouter vs Google direct is chosen deliberately

## Resolved Items

- ✅ execution injection from Project Memory into run context (Phase 8A)
- ✅ minimal prompt injection of accepted durable memory (Phase 8B-1)
- ✅ factual attachment awareness in prompt (Phase 8B-2)
- ✅ session-level model selection UI wired through local-api (Phase 8C)
- ✅ lightweight role-based agent modes with prompt shaping (Phase 8D)
- ✅ deterministic memory prioritization before prompt injection (Phase 8E)
- ✅ minimal web search with explicit trigger and bounded results (Phase 8F)
- ✅ minimal git read tools with safe, bounded file reading (Phase 8G)
- ✅ Phase 9A tool abstraction (v1): shared tool-context collection for web + git (local-api only)
- ✅ image attachment support: paste, drag & drop, file picker (Phase 7G-3)
- ✅ response copy button on assistant messages (Phase 7G-2)
- ✅ quiet workspace visual polish (Phase 7G-1)
- ✅ Project Memory v1–v3 complete with full lifecycle
- ✅ duplicate handling with exact-match and normalized suppression

## Unresolved Items (Later Phases)

- Controlled Git Write is planned, not implemented
- whether git write should require explicit diff preview and confirmation before execution
- whether to add write capability to git tools (later enhancement)
- whether to add more sophisticated repo browsing (later enhancement)
- whether the v2 shell needs a stronger top-level project switcher beyond the current rail + expandable panel
- whether Project Memory should gain explicit quick actions in the workspace header beyond opening the overlay
- whether run summaries should become richer than the current status + Details grouping
- whether pinned items should later gain ordering controls beyond simple add/remove
- whether suggestion heuristics should later become configurable or remain fixed/simple
- whether later phases should expose a lightweight way to permanently dismiss a suggestion source beyond hidden rejected candidates
- memory ranking and prioritization for long-running sessions (Phase 8E)
- multimodal image consumption when CLI supports it (future)
- whether `local-api` should enforce a strict cloud-provider allowlist at route-validation time or only at resolution time
- whether Standard should later move from a fixed direct-Gemini default to a named remotely configurable profile
- how much provider-path visibility should be shown in normal UI versus only in Advanced/settings/debug surfaces

## Next Entry Point

- Phases 7F–8G are complete and production-ready
- the next phase is **Phase 9B: Configuration Cleanup**
  - improve path management and binary resolution
  - unify settings presentation
  - simplify local-api configuration
  - improve developer experience
- after Phase 9, the planned sequence is:
  - Phase 10: Controlled Git Write (planned, not implemented)
  - Phase 11: Packaging
  - Phase 12: Extensions
- MCP integration should remain for later phases, after core execution modes, tools, and configuration are stable
- next provider/settings slice should:
  - move Standard resolution to `google / gemini-2.5-flash`
  - preserve legacy fallback when `llmSettings` is absent or invalid
  - keep OpenRouter as an explicit alternative provider rather than an implicit Gemini path

## Provider Design Update (2026-04-12)

### Confirmed Decisions

- `local-api` remains the truth owner for provider/model resolution.
- Cloud provider taxonomy is fixed to `google`, `openrouter`, `openai`, and `anthropic`.
- Gemini direct is represented by `provider=google`.
- Gemini through OpenRouter is represented by `provider=openrouter` plus an OpenRouter Gemini-family model id.
- Standard mode should resolve to direct Gemini by default:
  - `executionMode=cloud`
  - `provider=google`
  - `modelId=gemini-2.5-flash`
  - `profile=standard`
- Advanced remains the explicit provider-selection surface.

### Unresolved Items

- whether route-time validation should reject unknown cloud provider ids immediately
- whether Standard defaults should later become remotely configurable instead of fixed
- how strongly normal UI should expose the active provider path versus keeping it mostly inside Advanced/debug surfaces

### Next Entry Point

- implement `local-api` provider resolution against the fixed taxonomy
- ensure Standard maps to Google direct Gemini by default
- keep legacy fallback for missing/invalid `llmSettings`
- preserve explicit separation between Google direct Gemini and OpenRouter Gemini
>>>>>>> 8456d9f (docs: sync spec and roadmap status)

## Change Log

### 2026-04-11

- added English LLM/tooling companion spec
- aligned English spec with the current `claw-studio`-first direction
- recorded persistence first version
- recorded `permissionMode` end-to-end wiring
- recorded explicit model-selection and preferred-model policy
<<<<<<< HEAD
=======
- recorded collapsed-rail + Project Memory overlay implementation progress
- recorded workspace-shell polish direction: minimal context strip, fixed low-noise timeline, Project Memory still secondary
- recorded Project Memory v2 direction: subtle capture actions, pending review, accept/dismiss promotion flow
- recorded Project Memory hygiene direction: hidden empty sections, exact duplicate prevention, remove actions, clamp-first readability
- recorded Project Memory v3 direction: assistant/final-output suggestions stay heuristic, subtle, and review-gated via Pending Review

## Runtime 9.5 Update (2026-04-11)

### Confirmed Decisions

- Runtime hardening is now active (Phase 9.5) with strict boundary preservation.
- `local-api` remains the single run/state truth owner.
- `claw-studio` remains a mirrored UI and must not introduce inferred run truth.
- Run lifecycle contract now includes `stopping` and `abnormal_exit` for clearer state interpretation.
- Stop flow is explicit: stop request -> `stopping` -> terminal state (`stopped` or failure-class terminal).
- Abnormal process endings are surfaced with explicit cause text while keeping the existing API shape.

### Unresolved Items

- Stop-timeout value is currently fixed and may need tuning from real operator feedback.
- Abnormal-exit categorization is string-based and may later need a compact machine-readable error code.
- Progressive/streaming UX refinements in `claw-studio` Details remain a later runtime slice.

### Next Entry Point

- Continue Phase 9.5 in `claw-ui/apps/local-api`:
  - strengthen stop/cancel reliability across edge process states
  - validate lifecycle ordering under polling concurrency
  - expand regression checks for `stopping` / `abnormal_exit` paths
- Keep `claw-studio` changes limited to mirrored rendering updates only when API lifecycle states expand.

## Runtime 9.5 Continuation (stop timeout / LLM settings split)

### Confirmed Decisions

- stop timeout is a runtime tuning value
- the default stop timeout remains `8000ms`
- stop timeout may be overridden by `local-api` settings
- stop timeout should not be exposed on the normal UI yet
- `claw-studio` does not own timeout truth and only mirrors API truth

### Unresolved Items

- exact settings key name for the stop-timeout override
- whether timeout should ever appear in the settings UI later
- whether the LLM settings profile should stay fixed as `Standard / Local / Advanced`
- which providers should be supported first

### Next Entry Point

- add configurable stop timeout to `local-api` settings
- then add the LLM settings shape (`executionMode / provider / modelId`)

Reason:

- stop timeout is a runtime tuning concern and should be separated first
- after that, the LLM settings shape can remain focused on model-selection concerns

## LLM Settings Shape Update (2026-04-11)

### Confirmed Decisions

- `shared/contracts` now includes optional `llmSettings` under `AppSettings`.
- `llmSettings` requires `executionMode`, `provider`, and `modelId`.
- `llmSettings` supports optional `fallbackProvider`, `fallbackModelId`, and `profile` for future expansion.
- Runtime tuning and model selection remain separated: `stopTimeoutMs` stays a runtime tuning value.
- `local-api` remains the settings truth owner; `claw-studio` remains mirrored UI only.
- `POST /api/settings` now applies lightweight shape validation for `llmSettings` and rejects invalid values.

### Unresolved Items

- Whether provider/model allowlists should be introduced in the route layer.
- Whether `profile` should later drive default provider/model selection behavior.
- How much of `llmSettings` should be exposed in normal UX versus advanced surfaces.

### Next Entry Point

- Wire `llmSettings` into execution selection in `local-api` without breaking existing `activeProvider` / `activeModel` clients.
- Keep route validation lightweight and avoid framework-heavy settings abstractions.
- Keep runtime tuning values independent from LLM selection shape.

## LLM Settings Resolution Update (2026-04-11)

### Confirmed Decisions

- `local-api` now resolves execution provider/model with this priority:
  1. valid `settings.llmSettings` (`executionMode`, `provider`, `modelId`)
  2. legacy `activeProvider` / `activeModel`
- `llmSettings` remains optional to preserve compatibility with existing clients.
- legacy `activeProvider` / `activeModel` remains supported and must not be removed yet.
- `profile` is accepted as optional metadata but does not change execution behavior in this slice.
- runtime tuning values (for example `stopTimeoutMs`) remain separate from LLM selection settings.

### Unresolved Items

- whether `profile` should later influence default provider/model mapping.
- whether to add provider/model allowlists for stricter route-time validation.

### Next Entry Point

- wire optional fallback selection (`fallbackProvider` / `fallbackModelId`) into runtime selection in a small, safe slice.
- keep legacy compatibility as the first guardrail.

## Minimal LLM Selector Update

### Confirmed Decisions

- `claw-studio` now has a minimal three-option LLM selector in the composer area.
- The options are `Standard`, `Local`, and `Advanced`.
- `Standard` clears `llmSettings`, so `local-api` continues through the legacy `activeProvider` / `activeModel` fallback path.
- `Local` sends a compact `llmSettings` payload with `executionMode=local` and fixed local placeholder values.
- `Advanced` is currently a placeholder path and does not expose a detailed provider/model picker yet.
- `claw-studio` remains mirrored UI only and does not resolve LLM truth locally.

### Unresolved Items

- whether `Advanced` should later open a detailed settings surface or reuse the existing settings page
- whether the fixed local placeholder values should later become configurable
- whether `Standard` should eventually map to a named profile instead of clearing `llmSettings`

### Next Entry Point

- keep the selector quiet and stable while runtime hardening continues
- only expand the selector if a later phase needs a richer advanced settings surface

## Advanced Selector First Version

### Confirmed Decisions

- `Advanced` now opens a small composer popover instead of exposing always-visible detailed controls.
- The first version edits only:
  - `executionMode`
  - `provider`
  - `modelId`
- `Save` writes `llmSettings` through `local-api` settings.
- `Cancel` closes the popover without applying draft changes.
- `Reset to Standard` removes `llmSettings` and returns to legacy fallback (`activeProvider` / `activeModel`).
- `claw-studio` remains input/display only; all execution-setting truth stays in `local-api`.

### Unresolved Items

- fallback fields (`fallbackProvider`, `fallbackModelId`) are intentionally not exposed in this first version
- no provider-specific advanced options are exposed yet
- no extra routing logic is added in the UI layer

### Next Entry Point

- keep this advanced popover minimal and quiet
- if needed later, expand only inside advanced surfaces without changing `local-api` truth ownership

## Local Execution Failure UX Notes

### Confirmed Decisions

- Local-mode runtime failures are translated into clearer user-facing messages for first-run usability.
- Current friendly hints cover:
  - Ollama unreachable
  - local model missing/not pulled
  - provider request timeout
- `local-api` remains the truth owner; `claw-studio` only mirrors and displays returned terminal errors.

### Unresolved Items

- whether to expose one-click recovery guidance (for example "run `ollama pull ...`") in future UI
- whether provider-specific hints should be localized and structured rather than plain text

## Composer Quieting Update

### Confirmed Decisions

- The composer now uses a single primary Run/Stop button instead of separate always-visible submit and stop actions.
- The main action switches by mirrored API state only:
  - idle / not stoppable -> `Run`
  - active / stoppable -> `Stop`
- A lightweight `Thinking...` indicator is shown only while a run is active.
- `Thinking...` disappears after stop, completion, failure, or abnormal exit.
- Permission mode and AI mode are now accessed through compact composer popovers instead of always-visible segmented controls.
- Role selection remains reachable, but the toolbar should stay quieter than earlier segmented-control versions.
- The composer remains the main interaction surface, but it should not become visually heavy.

### Current UI Behavior

- normal view should not show explanatory `Running` / `Completed` chrome as a primary signal
- primary runtime feedback in normal view is:
  - the single Run/Stop action
  - the temporary `Thinking...` indicator
  - `Details` when deeper inspection is needed
- timeline rendering keeps `running`, `completed`, and `stopping` status rows out of the normal flow
- terminal error/abnormal/stopped states may still surface when needed for user clarity

### Unresolved Items

- whether the Role control should later move behind the same compact popover pattern
- whether `Thinking...` should later distinguish queueing vs model-processing more explicitly
- whether the main action label should later become icon-first without harming clarity

### Next Entry Point

- keep the composer quiet and obvious to operate
- avoid reintroducing always-visible segmented toolbar controls
- preserve API-truth-driven action switching only

## Local Readiness Hint Update

### Confirmed Decisions

- A lightweight local-readiness hint may appear only when:
  - `llmSettings.executionMode=local`
  - the latest relevant run ended with a local abnormal-exit pattern
- Current hint categories are:
  - Ollama unreachable
  - local model missing
  - local provider timeout
- The hint is advisory UI only; it does not change execution flow or local-api truth.

### Unresolved Items

- whether local-readiness hints should later include one-click recovery affordances
- whether hint detection should move from string matching to structured API error codes in a later slice

## Advanced Custom Provider (First Version)

### Confirmed Decisions

- Built-in cloud taxonomy remains fixed to:
  - `google`
  - `openrouter`
  - `openai`
  - `anthropic`
- Advanced may additionally expose a separate explicit path: `provider=custom`.
- `provider=custom` is not a replacement for the fixed taxonomy; it is an Advanced-only escape hatch for trying non-preset providers.
- The first version of `custom` is limited to OpenAI-compatible endpoints only.
- Provider routing must stay explicit:
  - preset providers use the fixed taxonomy ids
  - custom providers use `provider=custom` plus a nested `customProvider` object
- Model family names must not be used to infer provider path.
- `local-api` remains the truth owner for provider resolution, endpoint resolution, and secret-bearing settings.
- `claw-studio` remains input/display only and must not resolve provider behavior locally.

### Proposed Shape

- `llmSettings` keeps its current top-level fields:
  - `executionMode`
  - `provider`
  - `modelId`
  - optional `fallbackProvider`
  - optional `fallbackModelId`
  - optional `profile`
- When `provider=custom`, `llmSettings` may additionally include:
  - `customProvider.providerId`
  - `customProvider.displayName`
  - `customProvider.baseUrl`
  - `customProvider.apiKey`
  - `customProvider.modelId`
- `llmSettings.modelId` should remain present for compatibility, but for `provider=custom` it should mirror the chosen `customProvider.modelId` rather than replace the nested object.

### Preset / Custom Boundary

- Preset providers are for known product-level routing semantics and billing paths.
- Custom provider is for explicit experimentation with OpenAI-compatible endpoints that do not fit the fixed preset taxonomy.
- Preset provider ids must keep their stable meaning:
  - `google` = Google direct contract / endpoint / billing path
  - `openrouter` = OpenRouter contract / endpoint / billing path
  - `openai` = OpenAI direct contract / endpoint / billing path
  - `anthropic` = Anthropic direct contract / endpoint / billing path
- `custom` must not silently alias any preset provider.
- If a user wants Qwen through an OpenAI-compatible endpoint, that should be represented as `provider=custom`, not by overloading `openai` or `openrouter`.

### Advanced UI Direction

- Normal workspace UX must remain quiet.
- Standard and Local stay simple entry points.
- Advanced remains the explicit provider-selection surface.
- Detailed custom-provider inputs must not be always visible in the composer toolbar.
- In the first version, selecting `Custom` inside Advanced should reveal only the minimum required fields:
  - provider id
  - display name
  - base URL
  - API key
  - model id
- Save writes settings through `local-api`.
- Cancel discards the draft.
- Reset to Standard removes `llmSettings` and returns to legacy/default resolution.

### API Key Storage (Interim Policy)

- Custom-provider API keys must be treated as `local-api`-owned settings data, not as renderer-owned truth.
- `claw-studio` may collect and send the value, but must not become the durable authority for it.
- First version may store the custom API key in the existing local settings path if needed for compatibility and scope control.
- This first version should explicitly be treated as an interim storage policy, not a final secret-management design.
- A later slice may move custom secrets into a more isolated local secret store without changing the Advanced UX contract.

### Unresolved Items

- whether `provider=custom` should be validated only by shape or also by allow/deny rules on `baseUrl`
- whether `customProvider.providerId` should be globally unique or only locally descriptive
- whether preset provider API keys and custom-provider API keys should later move into a dedicated secret store
- whether Advanced should show the active endpoint path in a quiet summary line after save

### Next Entry Point

- extend `shared/contracts` and `local-api` settings shape to support optional `customProvider`
- keep preset taxonomy semantics unchanged while adding explicit `provider=custom`
- implement `local-api` resolution so custom providers use only the nested explicit endpoint/key fields
- add the minimum quiet Advanced UI needed to edit custom-provider fields without expanding normal workspace chrome
>>>>>>> 8456d9f (docs: sync spec and roadmap status)
