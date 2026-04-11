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

### Phase 8: Execution Integration (Planned)

#### 8A: Memory → Run Injection (v1b)
- pass Project Memory as execution context
- minimal contract extension through `local-api`
- injection point in run request pipeline

#### 8B: Execution Stabilization
- enhanced stop semantics
- long-run reliability improvements
- improved error classification and handling

### Phase 9: Configuration Cleanup (Planned)
- path management improvements
- binary resolution
- settings unification

### Phase 10: Packaging (Planned)
- desktop distribution setup
- userData directory management
- installer configuration

### Phase 11: Extensions (Planned)
- retry observation and metrics
- fallback behavior visibility
- review UI enhancements
- concurrent run support

## Current Status

### Completed
- ✅ Engine (`claw-code`): stable
- ✅ API layer (`claw-ui/local-api`): stable with settings and run ownership
- ✅ UI foundation (`claw-studio`): shell, sidebar, composer, timeline
- ✅ Project Memory v1a: storage, editing, persistence
- ✅ Project Memory v2: capture, accept/dismiss flow, sections
- ✅ Memory hygiene: dedup, removal, empty states
- ✅ Details organization: metadata/output/diagnostics separated
- ✅ Project Memory v3: assistant suggestion detection and hardened dedup

### Currently Deployed
- `claw-studio` as primary workspace
- `local-api` as the only run state owner
- `claw-ui` web client for verification

### Work Location
Phase 7F hardening is complete. Ready to move to Phase 7G next.

## Next Implementation Priorities

### 1. Phase 7G: Workspace UX Polish (Next)
- **Hover interactions**: improve timeline capture button behavior and feedback
- **Spacing and visual hierarchy**: refine margins, padding, and alignment
- **Assistant response readability**: improve text formatting and display
- **Interaction smoothing**: transitions, focus states, animation

### 2. Phase 8A: Memory → Run Injection (Following)
- Design and implement minimal Project Memory injection into run requests
- Extend `local-api` run contract to carry memory context
- Wire memory into execution context without changing `claw-studio` state ownership

### 3. Phase 8B: Execution Stabilization (Following)
- Improve stop handling and run cleanup
- Enhance error classification
- Test long-running executions

### 4. Phase 9: Configuration Cleanup (Later)
- Improve binary path discovery
- Unify settings presentation
- Simplify local-api configuration

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
| `local-api` | stable | Owns run/log state, `permissionMode` wired |
| `claw-studio` | main battlefield | UI polish and memory/execution integration next |
| Project Memory v1–v2 | complete | Capture, hygiene, pending review working |
| Project Memory v3 | complete | Assistant suggestion + hardened dedup |
| Memory → Run injection | not started | Planned for Phase 8A |

## Next Entry Point

**For the next chat:**

1. Read `docs/claw-handover-spec.en.md` first to confirm architecture and contracts
2. Next work is **Phase 7G: UX Polish**
   - Start with timeline capture button hover states
   - Refine spacing in memory overlay sections
   - Improve readability of long assistant responses
3. Keep changes inside `apps/claw-studio` unless spec wording needs adjustment
4. After Phase 7G, move to Phase 8A (memory injection into run context)
5. All spec changes must update both JP and EN versions

**Current test entry point:**
- Run `npm run typecheck && npm run build` in `apps/claw-studio`
- Verify no regressions in Project Memory v3 dedup or suggestion flow
- Manual test: generate suggestions, verify duplicates are suppressed

---

**Last Updated**: 2026-04-11  
**Aligned With**: `claw-handover-spec.en.md` (commit e9b1502c7dd55781307faf2bdadea32bd9cd74c6)
