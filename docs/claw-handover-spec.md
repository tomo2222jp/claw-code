# Claw Handover Spec

## Source Of Truth

このファイルは canonical な handover spec です。

- Path: `C:\temp\claw-code\docs\claw-handover-spec.md`
- LLM/tooling 向け companion: `C:\temp\claw-code\docs\claw-handover-spec.en.md`
- 新しい chat は必ずこのファイルを先に読む
- spec change は実装前または同じ work unit で両ファイルに反映する
- このファイルに反する提案は、明示的に更新されるまでこのファイルより優先しない

Recommended next-chat opener:

> First read `C:\temp\claw-code\docs\claw-handover-spec.md` before making decisions. If the spec needs to change, describe the change and get agreement before implementing it.

Recommended LLM/tooling opener:

> First read `C:\temp\claw-code\docs\claw-handover-spec.en.md` before making implementation or design decisions. If the spec needs to change, describe the change and get agreement before implementing it.

## Purpose

この文書は `claw-code` / `claw-ui` / `claw-studio` の認識を次の chat へ正確に引き継ぐためのものです。

扱う内容:

- 現在の architecture
- 固定 boundary
- すでに実装済みの範囲
- 現在の priority
- 次の chat が true として扱うべき事項

## Final Goal

長期 goal は `claw-code` を engine として使い、その上に coding-agent workflow を組み立てることです。

Current product direction:

- Engine repo: `claw-code`
- Provider path: OpenRouter-first
- Primary UI: `claw-studio` desktop workspace UI
- Secondary UI: `claw-ui` web client for verification and debugging

## Team Roles

- User: 最終 product direction / priority / boundary の決定
- GPT / ChatGPT: planning / review / handoff shaping / repo-level judgment
- Codex: implementation / file edits / build と verification

## Fixed Architecture

### Layering

現在の layered split は固定です:

1. UI Layer
   - `apps/claw-studio` = primary desktop workspace UI
   - `claw-ui/apps/web-ui` = verification web client
2. App API Layer
   - `claw-ui/apps/local-api` = state owner
3. Engine Layer
   - `claw-code` runtime and execution bridge

### Fixed Boundaries

- `local-api` が run lifecycle / run status / logs / final output / stop state を持つ
- adapter / execution bridge は execution concern のみを持つ
- `claw-studio` は mirrored timeline と workspace/session UX を持つ
- `claw-studio` は run truth になってはいけない
- `shared/contracts` は run-related type の shared boundary

### Non-Goals

次を incidental に起こしてはいけない:

- UI と engine concern の collapse
- `claw-studio` の state owner 化
- adapter への広い UI concern の流入
- UI work のついでの contract redesign
- `claw-ui` を verification client ではなく置き換えてしまうこと

## Engine Decisions

### Active Model

`claw-code` は ad hoc model selection ではなく active-model approach を使う。

Core settings:

- `active_provider`
- `active_model`
- `fallback_provider`
- `fallback_model`
- `retry_count`

### OpenRouter Policy

現在の default provider direction は OpenRouter。

- `active_provider=openrouter`
- `active_model` は OpenRouter model id を使う
- transport は内部で OpenAI-compatible path を使ってよい

そのため log に次が同居しても正常:

- `selected_provider=openai`
- `provider_intent=openrouter`

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

- missing `permissionMode` は `default`
- invalid `permissionMode` も `default`
- 既存 `{ prompt }` client はそのまま動くこと
- `attachments` はペースト/ドラッグ/選択された画像ファイルをキャリア（パススルー）
- `projectMemory` は受け入れ済み永続メモリのみをキャリア（ルール、決定、焦点、ピン留め）
- 保留中/提案メモリは決してインクルードしない
- 空のメモリセクションはペイロードから除外

Execution bridge mapping:

- `default -> --permission-mode default`
- `full_access -> --permission-mode danger-full-access`
- `projectMemory` → minimal prompt injection (if present)
- `attachments` → factual acknowledgment in prompt (if present)

## Model Selection Policy

LLM selection も execution-affecting setting と同じ boundary rule に従う。

Current policy:

- provider/model truth は `local-api` とその先の execution path に残す
- `claw-studio` は model-selection UX を出してよいが truth source になってはいけない
- execution-affecting model choice は `shared/contracts -> local-api -> execution bridge` を通す
- model-related input を増やしても既存 client compatibility を保つ

Implementation direction:

- short term: `claw-studio` は model-selection UI を出してよいが execution truth は `local-api`
- medium term: per-session model selection を入れても normalization は `local-api`
- renderer-only state だけで local-api を bypass する model-selection はしない

## Preferred Models

Current preferred model direction:

- Primary implementation and validation model: `openai/gpt-oss-120b:free`

Current provider direction:

- Preferred provider intent: `openrouter`

Practical meaning:

- 新しい work はまず `openai/gpt-oss-120b:free` を前提に検証する
- transport/provider display と provider intent がずれても UI/log は理解可能であること
- 他 model は後で評価してよいが、明示されるまでは current priority ではない

Not yet fixed:

- production 向け fallback model policy
- `claw-studio` の model ranking UI
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
- debug と run details は Details の中へ

## UI Direction Refinement

`claw-studio` は settings-heavy ではなく coding-tool-first を維持する。

- normal workspace view は minimal / low-noise を保つ
- advanced controls は main workspace に常時表示しない
- advanced features は Details / panel / secondary view に置く
- workspace focus は `compose -> run -> inspect`
- sidebar は常時 expanded menu ではなく collapsed icon rail を default にする

Additional rules:

- Project Memory と settings は main work surface を支配しない
- 新 feature でも simple / mock-like な mental model を崩さない
- always-visible UI chrome は最小限にする

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
- run と log の truth ownership
- real claw adapter wiring
- settings precedence
- `permissionMode` normalization と bridge wiring

Settings precedence:

- local-api initiated run では saved local-api settings が authoritative
- bridged fields:
  - `activeProvider`
  - `activeModel`
  - `retryCount`
  - `openaiBaseUrl`

### `claw-ui/web-ui`

Implemented:

- Run / Settings / Logs pages
- observability improvements
- build と typecheck
- verification UI の維持

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
- near-bottom 時だけ auto-scroll
- session persistence first version
- permission mode selector UI
- `permissionMode` wiring into the run request path
- response copy button on assistant messages with temporary "Copied" feedback
- debug information behind Details
- collapsed icon rail default
- expandable panel for projects and sessions
- right-side Project Memory overlay
- project-scoped memory persistence (`projectMemoryByProjectId`)
- lightweight Project Memory edit mode
- workspace context strip for project / memory / session framing
- de-emphasized run/status events, reduced Details weight, improved visual hierarchy
- Project Memory v2 capture flow with pending review
- Project Memory hygiene for duplicate prevention / remove / empty state handling
- Project Memory v3 assistant-suggested candidates with heuristic staging into Pending Review

Current UI behavior:

- composer は center pane bottom に固定
- timeline が唯一の scrolling area
- normal view は user / assistant / run status を優先
- stdout / stderr / metadata は Details に入る
- Project Memory は secondary surface として right overlay で開く
- run requests carry composed text, pasted/dropped/selected image attachments, and accepted durable project memory

## Persistence Policy

`claw-studio` session persistence first version は実装済み。

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
- `projectMemoryCandidatesByProjectId`
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

- persisted studio state から run truth を restore しない

## Project Memory (Plan and Current State)

Project Memory は `claw-studio` 内の project-scoped long-lived context として扱う。

Purpose:

- session をまたいで重要 context を保持する
- project-level rules / decisions を timeline history から分離する
- repeated restatement を減らす

Boundary rules:

- Project Memory は `claw-studio` workspace responsibility に属する
- run truth ではない
- session timeline とは別物
- v1a は storage と editing のみ
- execution injection は later phase

V1a direction:

- timeline / session state と分けて persist する
- UI は lightweight で secondary
- memory が main surface を支配しない
- human-readable / manual-editable を優先する

Current implementation status:

- project-scoped memory persistence は `claw-studio` に実装済み
- memory は timeline / session history と分離して保存される
- memory は right overlay に出る
- lightweight manual editing は実装済み
- Project Memory v1a, v2, v3 all implemented with full lifecycle
- execution injection は実装済み：受け入れ済み永続メモリは RunRequest に含まれる
- adapter層はメモリをプロンプトに最小限かつ条件付きで注入
- run requests include: `prompt`, `attachments`, `projectMemory` (durable items only)
- pending/suggested memory は決してインジェクトされない

V2 direction:

- timeline item は user-explicit memory saving 用の subtle capture action を出せる
- capture は durable write の前に reviewable candidate を stage する
- accepted `rule` / `decision` / `current_focus` candidate は durable Project Memory field に昇格する
- accepted `pinned` item は durable schema を広げず overlay-only pinned section に残してよい
- pending review は Project Memory overlay の中に置き、別 dashboard にしない

V2 hygiene direction:

- overlay section は Summary / Rules / Decisions / Current Focus / Pinned / Pending Review を維持する
- empty durable section は必要に応じて隠し、Pending Review は minimal empty state を持つ
- durable accept 時の exact duplicate は無視する
- durable memory item と pinned item は lightweight remove を持つ
- long text は clamp-first で readable にし、必要時だけ expand する

V3 assistant-suggested direction:

- assistant suggestion は subtle で user-controlled のままにする
- suggestion は assistant / final-output の timeline item にだけ出す
- 初回実装は新しい LLM call ではなく renderer/store の simple heuristic で行う
- suggestion button は durable memory を直接更新せず Pending Review に stage する
- durable memory の更新は既存の accept flow を通ったときだけ行う
- suggestion state は lightweight でよいが、dismiss した suggestion が即座に再出現しないこと

Future direction:

- explicit な user-triggered saving (`remember this`) をさらに育てる
- assistant-suggested memory candidate を改善する
- memory update は常に reviewable にし、silent auto-persist はしない

## Persistence Extension (Planned)

Added structure:

- `projectMemoryByProjectId`
- `projectMemoryCandidatesByProjectId`

Rules:

- timeline / session state とは分離したままにする
- run truth は restore しない

## Context Management

Long-context usage は次の 3 つを軸に後続設計する:

- Context Guard
- Context Compression
- Session Rollover

Current intent:

- endless session を続けるより deliberate に新 session を切る
- rollover には user-reviewable handoff を含める
- exact behavior は later phase

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

明示的に spec を変えない限り、次を維持する:

- three-layer split を維持する
- `local-api` を state owner のまま保つ
- adapter は execution bridge only
- `claw-studio` は mirrored workspace UI であり run truth ではない
- OpenRouter を current provider direction とする
- `selected_provider=openai / provider_intent=openrouter` を expected normal state として扱う
- `claw-ui` を verification client のまま保つ
- contract change では existing-client compatibility を意識する

## Work Rules For The Next Chat

Every next chat should follow this order:

1. read this file first
2. do not assume older chat memory is still correct if this file says otherwise
3. if a spec change is needed, describe it and record it here and in `docs/claw-handover-spec.en.md`
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
- Project Memory v3 では assistant suggestion を assistant/final-output item 上の subtle な affordance にとどめ、durable memory を auto-save しない
- assistant suggestion も review gate は既存の Pending Review を使い、別の review surface を増やさない
- Project Memory v2 capture flow は実装済み
  - timeline item には subtle な capture action がある
    - `Pin`
    - `Save as Rule`
    - `Save as Decision`
    - `Save as Current Focus`
  - capture は最初に pending candidate を作る
  - durable memory は Pending Review からの `Accept` でのみ更新する
  - `Dismiss` は durable memory への昇格を防ぐ
- Project Memory hygiene は実装済み
  - durable accept 時に exact duplicate を防止する
  - Rules / Decisions / Current Focus / Pinned に remove action がある
  - `updatedAt` は accept と remove で更新する
  - memory overlay は Summary / Rules / Decisions / Current Focus / Pinned / Pending Review を使う
  - memory と pending の両方に empty state がある
- UI は coding-tool-first と low-noise を維持する
  - capture action は subtle で hover/focus 中心
  - memory overlay は secondary のまま
  - normal timeline の構造は変えない

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

- created `docs/claw-handover-spec.md` as the canonical handover spec
- aligned the spec with the current `claw-studio`-first direction
- recorded persistence first version
- recorded `permissionMode` end-to-end wiring
- added explicit `Model Selection Policy`
- added explicit `Preferred Models`
- repaired the corrupted handover sections into readable markdown
- reflected collapsed rail and Project Memory overlay implementation progress
- recorded workspace-shell polish direction: minimal context strip, low-noise timeline, Project Memory still secondary
- recorded Project Memory v2 direction: subtle capture actions, pending review, accept/dismiss promotion flow
- recorded Project Memory hygiene direction: hidden empty sections, exact duplicate prevention, remove actions, clamp-first readability
- recorded Project Memory v3 direction: assistant/final-output suggestions stay heuristic, subtle, and review-gated via Pending Review
