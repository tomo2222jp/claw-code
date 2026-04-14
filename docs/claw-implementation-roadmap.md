# Claw Implementation Roadmap

## 目的

この roadmap は `claw-code` / `claw-ui` / `claw-studio` の実装フェーズ、現在地、次の入口を整理する。

---

## システム構造

1. UI Layer
   - `apps/claw-studio` = primary desktop workspace UI
   - `claw-ui/apps/web-ui` = verification web client
2. API Layer
   - `claw-ui/apps/local-api` = state owner / run coordinator
3. Engine Layer
   - `claw-code` = model routing / execution

---

## 完了済みフェーズ

- **Phase 7G**: UI simplification
  - chat-first / quiet workspace
  - overlay rail UX
  - low-noise timeline
  - composer 主役化

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
  - `stopping` / `abnormal_exit` 状態導入
  - stop timeout fallback
  - lifecycle guard
  - composer quieting
  - local readiness hint

- **Phase 9B**: Provider Taxonomy & Gemini Direct Routing
  - cloud provider taxonomy 固定（`google / openrouter / openai / anthropic`）
  - Gemini direct と OpenRouter 経由 Gemini を別経路として扱う
  - `provider=google` = Google direct、`provider=openrouter` + Gemini = OpenRouter 経由

- **Phase 9C**: Advanced Custom Provider（first version）
  - `provider=custom` 導入
  - OpenAI-compatible endpoint を Advanced 専用で指定可能に
  - `customProvider` settings 追加

---

## Phase 9.8 — Execution Path Stabilization（Completed）

### Goals

- OpenRouter free models 対応
- CLI 依存の解消
- 実行安定性確保

### Implemented

- dual execution path 分離
  - `tool-enabled`（CLI 経由）
  - `prompt-only`（Direct API fetch）
- `DirectApiEngineAdapter` 導入
- CLI stdin hang 解消（Thinking 固着）
- safe JSON parsing（`response.text()` → `JSON.parse` + try/catch）
- API key overwrite 防止（空文字保存時は既存値を保持）
- 識別ログ追加（`[engine]` / `[direct-api]`）
- MODEL_OPTIONS 刷新（DeepSeek V3.2追加、廃止モデル差し替え）

### Result

- DeepSeek V3.2 安定動作確認
- Llama 3.3 70B / Hermes 405B 使用可能（制約あり）
- Thinking 固着解消

---

## 現在フェーズ

- **Phase 9.9** — Provider & Settings Stabilization（進行中）
- **Phase 10** — Model & Usability Layer（並行）

---

## Phase 9.9 — Provider & Settings Stabilization（Current）

### Goals

- settings UI を完成させる
- provider 切替を安定化する
- API key 管理を統一する

### Tasks

- API key 入力 UI（Settings 画面）
- settings merge 保存（studio 側が apiKey を消さないように）
- provider selection UI 修正
- env fallback 整理（`OPENROUTER_API_KEY` / `OPENAI_API_KEY`）
- OpenCode-inspired settings alignment
  - OpenCode の provider / model / options デザインパターンを採用
  - providerOptions, customProvider, baseUrl の settings shape を定義
  - 現在の settings から OpenCode-inspired shape への移行経路を計画
  - 移行全体で `local-api` truth ownership を維持

### 完了条件

- ユーザーが UI から全設定を完結できる
- モデル切り替え時に apiKey が消えない

---

## Phase 10 — Model & Usability Layer（Current / 並行）

### Focus

- model selection UI 安定化
- API key 設定 UI
- model capability 表示

### In Progress

- DeepSeek を既定モデル化
- provider 別挙動整理
- エラー表示改善

### Next

- prompt 最適化
- tool-enabled path 再安定化
- provider 別チューニング

---

## 次フェーズ候補（将来）

### Packaging

- desktop distribution
- installer
- userData handling

### Controlled Git Write

- planned only
- explicit confirmation
- diff preview
- branch-only write

---

## Next Entry Point

1. **Phase 9.9**: API key 入力 UI を Settings に追加する
2. **Phase 9.9**: settings 保存時の apiKey overwrite を完全防止する
3. **Phase 9.9**: provider selection UI を安定化する
4. **Phase 9.9**: OpenCode-inspired settings shape を定義する（providerOptions, customProvider, baseUrl）
5. **Phase 10**: model capability labeling を追加する
6. **Phase 10**: エラー表示を provider 別に改善する
7. **Phase 10**: OpenCode-inspired settings normalization を `local-api` に実装する

---

## 固定ルール

- `local-api` truth owner を維持する
- `claw-studio` は mirrored UI のまま保つ
- quiet UI / chat-first を崩さない
- provider 解決ロジックを `claw-studio` に持たせない
- model family 名から provider を暗黙推定しない
