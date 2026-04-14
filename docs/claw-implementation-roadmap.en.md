# Claw Implementation Roadmap (English)

## Purpose

This roadmap clarifies the implementation phases, current state, and next entry points for `claw-code` / `claw-ui` / `claw-studio`.

---

## System Structure

1. UI Layer
   - `apps/claw-studio` = primary desktop workspace UI
   - `claw-ui/apps/web-ui` = verification web client
2. API Layer
   - `claw-ui/apps/local-api` = state owner / run coordinator
3. Engine Layer
   - `claw-code` = model routing / execution

---

## Completed Phases

- **Phase 7G**: UI simplification
  - chat-first / quiet workspace
  - overlay rail UX
  - low-noise timeline
  - composer as primary actor

- **Phase 8A–8G**
  - memory injection
  - attachment awareness
  - model selection
  - role-based modes
  - memory prioritization
  - web search
  - git read

- **Phase 9A**: minimal tool abstraction

- **Phase 9.5**: Runtime / Execution UX Hardening
  - `stopping` / `abnormal_exit` states introduced
  - stop timeout fallback
  - lifecycle guard
  - composer quieting
  - local readiness hint

- **Phase 9B**: Provider Taxonomy & Gemini Direct Routing
  - Cloud provider taxonomy fixed (`google / openrouter / openai / anthropic`)
  - Google direct and OpenRouter-via-Gemini treated as separate paths
  - `provider=google` = Google direct; `provider=openrouter` + Gemini = OpenRouter-routed

- **Phase 9C**: Advanced Custom Provider (first version)
  - `provider=custom` introduced
  - OpenAI-compatible endpoint configurable in Advanced mode
  - `customProvider` settings added

---

## Phase 9.8 — Execution Path Stabilization (Completed)

### Goals

- Support OpenRouter free models
- Reduce CLI dependency
- Establish execution stability

### Implemented

- Dual execution path separation
  - `tool-enabled` (via CLI)
  - `prompt-only` (Direct API fetch)
- `DirectApiEngineAdapter` introduced
- CLI stdin hang resolved (Thinking fixation)
- Safe JSON parsing (`response.text()` → `JSON.parse` + try/catch)
- API key overwrite prevention (empty string on save retains existing value)
- Identification logging added (`[engine]` / `[direct-api]`)
- MODEL_OPTIONS refreshed (DeepSeek V3.2 added, deprecated models replaced)

### Result

- DeepSeek V3.2 stable operation confirmed
- Llama 3.3 70B / Hermes 405B usable (with constraints)
- Thinking fixation resolved

---

## Phase 9B — Provider Taxonomy & Gemini Direct Routing (Enhancement)

### Enhancements

- API key input UI (Settings screen)
- Settings merge-save (prevent studio from wiping apiKey)
- Provider selection UI stabilization
- Env fallback cleanup (`OPENROUTER_API_KEY` / `OPENAI_API_KEY`)

### Done When

- User can complete all configuration from the UI
- Model switching does not erase apiKey

---

## Phase 9C — Advanced Custom Provider (Design Enhancement)

### Design Tasks

- OpenCode-inspired settings alignment
  - Define settings shape for providerOptions, customProvider, baseUrl
  - Plan migration path from current settings to OpenCode-inspired shape
  - Maintain `local-api` truth ownership throughout

### Implementation Notes

- Settings shape follows OpenCode provider/model/options patterns
- UI provides OpenCode-like surfaces, normalization remains in `local-api`
- `provider=custom` remains Advanced-only feature

---

## Phase 10 — Model & Usability Layer (Current)

### Focus

- Model selection UI stabilization
- Model capability display
- OpenCode-inspired settings normalization in `local-api`

### In Progress

- Establishing DeepSeek as default model
- Organizing provider-specific behavior
- Improving error display

### Next

- Prompt optimization
- tool-enabled path re-stabilization
- Per-provider tuning

---

## Future Phase Candidates

### Packaging

- Desktop distribution
- Installer
- userData handling

### Controlled Git Write

- Planned only
- Explicit confirmation
- Diff preview
- Branch-only write

---

## Next Entry Point

1. **Phase 9B**: Add API key input UI to Settings
2. **Phase 9B**: Fully prevent apiKey overwrite on settings save
3. **Phase 9B**: Stabilize provider selection UI
4. **Phase 9C**: Define OpenCode-inspired settings shape (providerOptions, customProvider, baseUrl)
5. **Phase 10**: Add model capability labeling
6. **Phase 10**: Improve per-provider error display
7. **Phase 10**: Implement OpenCode-inspired settings normalization in `local-api`

---

## Fixed Rules

- Maintain `local-api` as truth owner
- Keep `claw-studio` as mirrored UI only
- Do not break quiet UI / chat-first principle
- Do not move provider resolution logic into `claw-studio`
- Do not infer provider from model family name
