# Claw Implementation Roadmap (English)

## Purpose

This roadmap clarifies the development plan for `claw-code`, `claw-ui`, and `claw-studio` across implementation phases. It documents:

- completed phases and their status
- current phase and current location in the work
- next implementation priorities
- non-goals and planned-for-later features
- development rules and constraints
- entry points for the next chat or implementer

The roadmap is aligned with `claw-handover-spec.en.md` as the source of truth for architecture and contracts.

## System Structure

The project is organized in three layers:

1. **UI Layer**: `claw-studio` — primary desktop workspace UI
   - Electron + React + TypeScript shell
   - coding-tool-first, low-noise design
   - project/session/timeline/composer workspace
   - project memory and suggestion management

2. **API Layer**: `claw-ui/apps/local-api` — state owner and run coordinator
   - run lifecycle and state authority
   - log aggregation and buffering
   - settings management and persistence
   - execution bridge to engine

3. **Engine Layer**: `claw-code` — model routing and execution
   - OpenRouter-first provider direction
   - active model configuration
   - permission mode normalization
   - fallback and retry policies

## Phase Map

### Phase 0–5: Foundation (Complete)
Initial architecture, git setup, core dependency structure.

### Phase 6: claw-studio Foundation (Complete)
- Electron + React shell
- timeline display with event types
- composer with Enter-to-send, Shift+Enter for newline
- sidebar and session navigation
- polling loop for run status and logs
- session persistence

### Phase 7: Workspace Completion (In Progress)

#### 7A: UI Shell Establishment (Complete)
- collapsed sidebar icon rail (default state)
- fixed bottom composer
- timeline-first center pane
- context strip for project / session / memory framing
- overlay architecture for Project Memory and future panels

#### 7B: Details Organization (Complete)
- metadata / output / diagnostics separated
- moved to collapsible Details section in normal view
- maintained low-noise timeline display

#### 7C: Project Memory v1a (Complete)
- project-scoped memory storage
- persistence via `projectMemoryByProjectId`
- memory UI as right-side overlay
- lightweight manual editing interface
- read-first design with edit mode on demand

#### 7D: Project Memory v2 (Complete)
- capture flow: timeline → pending review → durable memory
- accept / dismiss actions on pending candidates
- kind classification: rule / decision / current_focus
- pinned items support
- rule/decision/current_focus sections with upgradeable candidates

#### 7E: Memory Hygiene (Complete)
- exact-duplicate detection and prevention
- remove operations on durable items
- empty state display
- `updatedAt` tracking
- overlay section organization (Summary / Rules / Decisions / Current Focus / Pinned / Pending Review)

#### 7F: Project Memory v3 / Assistant Suggestion (Complete)
- heuristic detection of assistant-suggested memory candidates
- pattern matching for rule/decision/current_focus
- subtle UI integration via timeline capture buttons with "suggested" styling
- normalized duplicate suppression (v3 hardening)
- suggestions stage into pending review (no auto-save)
- durable memory only mutates on explicit accept

**Status**: Fully implemented and hardened with duplicate deduplication.

#### 7G: Workspace UX Polish (Complete)

##### 7G-1: Quiet Workspace (Complete)
- de-emphasized run/status events in timeline
- hidden UUIDs in event details
- reduced Details button visual weight
- improved visual hierarchy

##### 7G-2: Response Copy (Complete)
- copy-to-clipboard button on assistant responses
- temporary "Copied" feedback (no toast infrastructure)
- quiet, minimal UI integration

##### 7G-3: Attachments UX (Complete)
- pasted image attachments (Ctrl+V)
- drag & drop image support with visual feedback
- file picker button with image filtering
- compact attachment chip display with remove buttons
- unified image file processing across all input methods
- forward to execution pipeline

**Status**: Phase 7 (Workspace Completion) fully complete.

## Phase 7G: UI Simplification

Status: ✅ Completed

Summary:
- removed top-level workspace noise
- established a chat-first normal view
- de-emphasized run information in normal view
- promoted the composer as the main interaction surface
- replaced the persistent sidebar with rail-triggered exclusive overlays
- added overlay close behavior via toggle, backdrop click, and Esc
- restored focus to the originating rail control after overlay close

Outcome:
- `claw-studio` now behaves like a quiet LLM workspace
- conversation flow and input are primary; execution details are secondary

### Phase 8: Execution Integration (In Progress)

#### 8A: Input / Memory → Run Injection (Complete)
- extended RunRequest contract with `attachments` and `projectMemory` fields
- studio-store collects durable project memory (rules, decisions, focus, pinned items)
- wired through local-api without breaking existing clients
- EngineAdapter interface extended to carry new fields
- run request pipeline fully transparent

#### 8B: Prompt Injection (Complete)

##### 8B-1: Minimal Prompt Injection (Complete)
- builds composed prompt with project context preamble
- includes only non-empty memory sections
- preserves original user prompt exactly
- conditional section inclusion (no empty headers)

##### 8B-2: Attachment Awareness Injection (Complete)
- adds factual "Attached images:" section when images present
- factual wording only (no image parsing or false claims)
- composes cleanly with memory sections
- prepared for future multimodal support

**Status**: Core execution integration complete. Next focus on model selection and agent modes.

### Phase 8C: Model Selection (Complete)
- per-session model selection UI ✅
- model routing without changing `local-api` truth ✅
- backward compatibility with active model settings ✅

### Phase 8D: Role-based Agent Modes (Complete)
- lightweight role/mode system (default, planner, builder, reviewer) ✅
- mode-specific prompt augmentation ✅
- mode persistence per session ✅

### Phase 8E: Memory Prioritization (Complete)
- deterministic memory truncation with fixed per-section limits ✅
- priority order: pinnedItems → currentFocus → decisions → rules ✅
- safe, minimal truncation for long-running sessions ✅

### Phase 8F: Web Search (Minimal) (Complete)
- optional lightweight web search for specific queries ✅
- integration with memory and context ✅
- explicit user control and bounded results ✅

### Phase 8G: Git Read Tools (Complete)
- read-only git log, diff, and blame access ✅
- scope limited to current project ✅
- safe subprocess handling with bounded results ✅

### Phase 9: Tool Abstraction + Configuration Cleanup (In Progress)

#### 9A: Tool Abstraction (v1, minimal) (Complete)
- minimal shared context-tool shape for web + git
- explicit triggers preserved (no always-on behavior)
- bounded outputs preserved
- adapter injection order unchanged

#### 9B: Configuration Cleanup (Planned)
- path management improvements
- binary resolution
- settings unification

### Phase 9.5: Runtime / Execution UX Hardening (In Progress)

Goal:
Improve execution reliability and perceived runtime quality before expanding into write-capable or MCP-backed tooling.

Background:
UI, memory, role, model selection, web search, git read, and tool abstraction are already in place.
The next meaningful improvement lies in execution stability and runtime UX.

Scope:
- run stabilization
- stop / cancel reliability
- long-running run handling
- streaming / progressive output
- error classification and visibility
- retry UX
- logs / details readability

Guidelines:
- Prefer aligning with the stronger aspects of the upstream Claw Code execution model where it improves reliability
- Keep adapter responsibility boundaries intact
- Keep all tool triggers explicit
- Maintain chat-first UI; execution remains background context

Non-goals:
- Git write implementation
- MCP integration
- agent orchestration expansion
- UI restructuring (Phase 7G already defines the UI direction)

Status:
In Progress

#### Phase 9.5 continuation: configurable stop timeout

Goal:
- reduce fixed stop-timeout dependence and improve runtime stability across environments
- keep runtime tuning values separate from future LLM-selection settings

Direction:
- keep the default stop timeout at `8000ms`
- allow overriding it through `local-api` settings
- do not expose it on the normal UI yet
- `claw-studio` must not own timeout truth; it only mirrors API truth

Completion criteria:
- stop timeout can be overridden from `local-api` settings
- default behavior remains unchanged when no override is provided
- build and smoke checks pass
- fixed boundaries remain intact (`local-api` truth owner, `claw-studio` mirrored UI)

#### Next candidate phase: LLM settings shape

Goal:
- keep the normal user experience aligned with a single default AI
- make the internal design multi-LLM capable

Direction:
- normal UX should continue to feel like one default AI
- internal settings should at least support:
  - `executionMode`
  - `provider`
  - `modelId`
- `local-api` remains the truth owner
- `claw-studio` stays input/display only for these settings

Note:
- runtime tuning values such as stop timeout must not be mixed into the LLM settings shape
- start this after configurable stop timeout is done

#### Phase 9B continuation: provider taxonomy and Gemini direct routing

Goal:
- remove ambiguity between Gemini direct and Gemini-through-OpenRouter
- make provider, billing path, and endpoint path explicit in `local-api`

Direction:
- fix cloud provider taxonomy to:
  - `google`
  - `openrouter`
  - `openai`
  - `anthropic`
- keep `executionMode=local` separate from cloud-provider taxonomy
- treat `google` as Gemini direct when a Gemini model is selected
- treat `openrouter` as OpenRouter billing/routing even when the model family is Gemini
- set Standard to direct Gemini by default:
  - `executionMode=cloud`
  - `provider=google`
  - `modelId=gemini-2.5-flash`
- keep Advanced as the explicit provider-selection surface

Non-goals:
- do not move provider-resolution logic into `claw-studio`
- do not let model-family names implicitly choose the provider path
- do not collapse Google direct and OpenRouter Gemini into one conceptual route

Completion criteria:
- provider taxonomy is documented and enforced consistently in `local-api`
- Standard resolves to Google direct Gemini
- OpenRouter remains selectable explicitly
- legacy fallback still works when `llmSettings` is missing or invalid

### Phase 10: Controlled Git Write (Planned)

Goal:
Allow safe, user-approved repository modifications through the system.

Scope (future):
- explicit user confirmation before write
- diff preview before execution
- branch-only writes (no direct main modification)
- rollback-friendly design

Non-goals (for now):
- autonomous commits
- silent modifications
- direct main branch writes

Status:
Planned (NOT IMPLEMENTED)

### Phase 11: Packaging (Planned)
- desktop distribution setup
- userData directory management
- installer configuration

### Phase 12: Extensions (Planned)
- retry observation and metrics
- fallback behavior visibility
- review UI enhancements
- concurrent run support

## Current Status

### Completed
- ✅ Engine (`claw-code`): stable, OpenRouter-first
- ✅ API layer (`claw-ui/local-api`): stable, owns run/log state, extended for attachments, memory, and role injection
- ✅ UI foundation (`claw-studio`): shell, sidebar, composer, timeline, all core interactions
- ✅ Project Memory v1a: storage, editing, persistence
- ✅ Project Memory v2: capture, accept/dismiss flow, sections
- ✅ Memory hygiene: dedup, removal, empty states
- ✅ Details organization: metadata/output/diagnostics separated
- ✅ Project Memory v3: assistant suggestion detection and hardened dedup
- ✅ Workspace UX Polish (Phase 7G-1/2/3): quiet timeline, response copy, image attachments (paste/drag/picker)
- ✅ Execution integration (Phase 8A): run request carries prompt, attachments, project memory
- ✅ Prompt injection (Phase 8B): memory and attachment awareness wired into execution
- ✅ Model selection (Phase 8C): per-session UI, routed through local-api, backward compatible
- ✅ Role-based agent modes (Phase 8D): lightweight role system with prompt shaping
- ✅ Memory prioritization (Phase 8E): deterministic truncation with fixed per-section limits
- ✅ Web search (Phase 8F): minimal explicit-trigger search with bounded results
- ✅ Git read tools (Phase 8G): safe read-only file reading and git log inspection

### Currently Deployed
- `claw-studio` as primary quiet, chat-first workspace
- sessions and Project Memory live behind mutually exclusive rail-triggered overlay panels
- run information stays quiet in normal view and is inspected via Details
- assistant labels are minimized to user -> assistant transitions only
- composer fixed at the bottom of the center pane as the primary interaction focus
- timeline remains the only scrolling area
- stdout / stderr / metadata stay inside Details
- image attachments via paste, drag & drop, and file picker
- assistant response copy functionality
- `local-api` as the only run state owner
- run requests carrying accepted durable memory + attachments
- adapter with minimal memory/attachment injection into prompt
- `claw-ui` web client for verification

### Work Location
Phase 8G (Git Read Tools) complete. Ready to move to Phase 9 (Configuration Cleanup) next.

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

## Next Implementation Priorities

### 1. Phase 9.5: Runtime / Execution UX Hardening (Next, In Progress)
- run stabilization
- stop / cancel reliability
- streaming / progressive output
- error classification and visibility
- retry UX
- logs / details readability

### 2. Phase 9B: Configuration Cleanup (Following)
- Improve binary path discovery
- Unify settings presentation
- Simplify local-api configuration
- clarify provider taxonomy and billing-path semantics

### 3. Phase 10: Controlled Git Write (Following, Planned)
- explicit user confirmation before write
- diff preview before execution
- branch-only writes
- status: Planned (NOT IMPLEMENTED)

### 4. Phase 11: Packaging (Following)
- Desktop distribution setup
- userData directory management
- Installer configuration

### 5. Phase 12: Extensions (Following)
- Parallel execution support
- Retry observation and metrics
- Fallback behavior visibility
- Review UI enhancements

## Non-Goals and Not-Now Items

**Will NOT do in this phase:**
- AI auto-save of memory
- vector database or semantic deduplication
- fuzzy or similarity-based matching
- complex memory ranking or prioritization
- dashboard-style UI reorganization
- move Project Memory into local-api ownership (stays in `claw-studio`)
- turn `claw-studio` into a run state owner

**Explicitly out of scope:**
- parallel execution (queued for Phase 11)
- retry observation (queued for Phase 11)
- fallback UI (queued for Phase 11)
- review UI (queued for Phase 11)

## Development Rules

1. **Spec is source of truth**: Always read the handover spec before implementing. If spec needs to change, update both JP and EN versions in the same work unit.

2. **Three-layer architecture is fixed**:
   - `claw-studio` = workspace UI and mirroring only
   - `local-api` = run/log state owner only
   - `claw-code` = execution bridge only
   - No collapsing of responsibilities

3. **Workspace must stay low-noise**:
   - minimize always-visible UI chrome
   - move advanced controls behind Details, panels, or secondary views
   - keep normal view focused on compose → run → inspect flow

4. **Project Memory stays secondary**:
   - memory does not dominate the main work surface
   - memory stays in right-side overlay, not expanded sidebar
   - memory UI remains optional and reviewable

5. **State ownership is strict**:
   - `claw-studio` must not become run truth
   - `local-api` is the only state owner
   - adapter is execution bridge only

6. **Persistence rules**:
   - run truth is never restored from saved state
   - timeline events are fresh from API each session
   - only workspace metadata persists (project/session selection, UI state)

7. **Keep decisions in contracts**:
   - Use `shared/contracts` for run-related types
   - Update both JP and EN spec if contracts change
   - Maintain backward compatibility for existing clients

## Current Summary

| Component | Status | Note |
|---|---|---|
| `claw-code` | stable | OpenRouter-first, active model configured |
| `local-api` | stable | Owns run/log state, accepts extended RunRequest with attachments + projectMemory + role + web/git results |
| `claw-studio` | quiet workspace | Chat-first, image attachments (paste/drag/picker), response copy, low-noise UI |
| Project Memory v1–v3 | complete | Capture, hygiene, assistant suggestion, durable memory working end-to-end |
| Execution integration | complete | Memory + attachments + web/git results wired through run request, adapter injects with minimal prompt augmentation |
| Model selection | complete | Per-session UI in studio, routed through local-api |
| Role-based modes | complete | Lightweight role system (default/planner/builder/reviewer) with prompt shaping |
| Memory prioritization | complete | Deterministic truncation with fixed per-section limits before injection |
| Web search | complete | Minimal explicit-trigger search with bounded 3-5 results |
| Git read tools | complete | Safe read-only repository context only |
| Runtime / execution UX | in progress | Phase 9.5 initial lifecycle hardening added (`stopping` / `abnormal_exit`, stop fallback, transition guards) |
| Controlled Git Write | planned | Not implemented; later phase with explicit confirmation |
| Next phase entry | Phase 9.5 | Runtime regression hardening (trigger/terminal consistency, stop race/timeout validation) |

## Next Entry Point

**For the next chat:**

1. Read `docs/claw-handover-spec.en.md` first to confirm architecture and contracts
2. Next work is **Phase 9.5 continuation: configurable stop timeout**
   - keep stop timeout in `local-api` settings only
   - keep the default at `8000ms`
   - preserve `local-api` truth owner / `claw-studio` mirrored UI boundaries
3. After stop timeout is stabilized, move to **LLM settings shape**
   - support `executionMode / provider / modelId`
   - keep normal UX aligned with a single default AI
   - keep runtime tuning values separate from model selection
4. Planned later phases remain:
   - Phase 10: Controlled Git Write (planned, not implemented)
   - Phase 11: Packaging
   - Phase 12: Extensions
5. All spec changes must update both JP and EN versions
6. Keep implementation minimal and reversible
7. provider-related follow-up after runtime hardening:
   - fix cloud-provider taxonomy
   - make Gemini direct (`google`) and OpenRouter Gemini (`openrouter`) explicitly separate
   - move Standard to direct Gemini by default

**Current test entry point:**
- Run `npm run typecheck && npm run build` in `claw-ui/apps/local-api`
- Verify no regressions in execution pipeline
- Manual test: verify model selection, role-based modes, memory prioritization, web search, and git read in logs
- Check debug logs for "[v1 injection]", "[v1 role]", "[v1 memory]", "[v1 web]", and "[v1 git]" messages
- Verify attachment handling continues to work (paste, drag, picker)

## Phase 9C: Advanced Custom Provider (planned)

Goal:
- add an Advanced-only path for trying OpenAI-compatible providers without weakening the fixed preset cloud taxonomy

Scope:
- introduce `provider=custom`
- add optional nested `customProvider` settings
- first version fields:
  - `providerId`
  - `displayName`
  - `baseUrl`
  - `apiKey`
  - `modelId`
- keep preset providers unchanged:
  - `google`
  - `openrouter`
  - `openai`
  - `anthropic`

Rules:
- preset and custom providers must stay explicitly separated
- do not infer provider path from `modelId`
- custom provider is limited to OpenAI-compatible endpoints in the first version
- `local-api` remains the truth owner for endpoint/key resolution
- `claw-studio` remains input/display only
- keep custom-provider controls inside quiet Advanced surfaces only

Non-goals:
- no provider plugin framework
- no generic non-OpenAI-compatible custom transport yet
- no normal-surface expansion of advanced settings
- no automatic provider inference from model-family names

Status:
- Planned

## Updated Next Entry Point

1. extend `shared/contracts` and `local-api` settings with optional `customProvider`
2. keep fixed taxonomy semantics unchanged for preset providers
3. implement `provider=custom` resolution in `local-api` for OpenAI-compatible endpoints only
4. add the minimum quiet Advanced UI needed to edit custom-provider fields
5. keep legacy fallback and Standard/Local behavior unchanged

## Recent UI Polish Status

Completed small polish updates in `claw-studio`:

- unified the composer primary action into a single Run/Stop button
- added a lightweight `Thinking...` indicator that appears only during active runs
- moved Permission and AI selection behind compact composer popovers
- kept normal timeline view quieter by suppressing `running` / `completed` / `stopping` status rows from the main flow
- added a lightweight local-readiness hint for recent local abnormal-exit cases

These changes preserve the existing boundaries:

- `local-api` remains the truth owner
- `claw-studio` remains mirrored UI only
- normal workspace UX stays chat-first and low-noise

---

**Last Updated**: 2026-04-12  
**Aligned With**: `claw-handover-spec.en.md` (latest)  
**Implementation Status**: Phase 7G complete; Phase 9.5 runtime hardening started (initial lifecycle changes landed); provider taxonomy fixed; Advanced custom-provider slice planned
