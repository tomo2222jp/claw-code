# Claw Implementation Roadmap

## 目的

この roadmap は `claw-code` / `claw-ui` / `claw-studio` の実装フェーズ、現在地、次の入口を整理する。

## システム構造

1. UI Layer
   - `apps/claw-studio` = primary desktop workspace UI
   - `claw-ui/apps/web-ui` = verification web client
2. API Layer
   - `claw-ui/apps/local-api` = state owner / run coordinator
3. Engine Layer
   - `claw-code` = model routing / execution

## 完了済み

- Phase 7G: UI simplification
  - chat-first / quiet workspace
  - overlay rail UX
  - low-noise timeline
  - composer 主役化
- Phase 8A-8G
  - memory injection
  - attachment awareness
  - model selection
  - role-based modes
  - memory prioritization
  - web search
  - git read
- Phase 9A
  - minimal tool abstraction
- Phase 9.5 initial runtime hardening
  - `stopping`
  - `abnormal_exit`
  - stop timeout fallback
  - lifecycle guard

## 現在フェーズ

- Phase 9.5: Runtime / Execution UX Hardening
- 並行して provider / settings の設計整理を進める

## Phase 9.5 継続

目的:

- runtime reliability を強化する
- stop / cancel / abnormal exit の扱いを安定化する
- chat-first UX を崩さない

固定条件:

- `local-api` truth owner を維持
- `claw-studio` mirrored UI を維持
- runtime tuning value と model selection を混ぜない

## Phase 9B 継続: provider taxonomy と Gemini direct routing

目的:

- Gemini direct と OpenRouter 経由 Gemini の曖昧さを解消する
- provider / billing path / endpoint path を `local-api` で明示化する

方針:

- cloud provider taxonomy を固定する
  - `google`
  - `openrouter`
  - `openai`
  - `anthropic`
- `executionMode=local` は cloud taxonomy と別扱い
- `provider=google` は Gemini direct
- `provider=openrouter` + Gemini-family model は OpenRouter 経由 Gemini
- Standard の既定値は direct Gemini
  - `executionMode=cloud`
  - `provider=google`
  - `modelId=gemini-2.5-flash`
- Advanced は explicit provider selection のための面とする

非スコープ:

- provider 解決ロジックを `claw-studio` に持たせない
- model family 名から provider を暗黙推定しない
- Google direct と OpenRouter Gemini を同じ経路として扱わない

完了条件:

- taxonomy が spec / roadmap / `local-api` resolution で一致する
- Standard が Google direct Gemini に解決される
- OpenRouter は explicit provider として残る
- legacy fallback が維持される

## 次フェーズ候補

### Packaging

- desktop distribution
- installer
- userData handling

### Controlled Git Write

- planned only
- explicit confirmation
- diff preview
- branch-only write

## Next Entry Point

1. `local-api` の provider resolution を fixed taxonomy に寄せる
2. Standard を Google direct Gemini に固定する
3. `llmSettings` absent / invalid 時の legacy fallback を維持する
4. その後に runtime hardening を継続する
## Phase 9C: Advanced Custom Provider（planned）

目的:

- fixed taxonomy を崩さずに、Advanced 専用で OpenAI-compatible provider を試せる入口を追加する

スコープ:

- `provider=custom` を導入する
- optional な `customProvider` settings を追加する
- first version の項目は次に固定する
  - `providerId`
  - `displayName`
  - `baseUrl`
  - `apiKey`
  - `modelId`
- preset provider はそのまま維持する
  - `google`
  - `openrouter`
  - `openai`
  - `anthropic`

ルール:

- preset / custom は明示的に分離する
- `modelId` から provider path を推測しない
- custom provider の first version は OpenAI-compatible endpoint のみに限定する
- endpoint / key の解決は `local-api` が truth owner として扱う
- `claw-studio` は入力と表示のみを担当する
- custom provider の UI は quiet な Advanced surface の中だけに置く

非スコープ:

- provider plugin framework は入れない
- OpenAI-compatible 以外の custom transport はまだ扱わない
- 通常画面へ advanced settings を広げない
- model family 名からの自動 provider 推測は入れない

ステータス:

- Planned

## Updated Next Entry Point

1. `shared/contracts` と `local-api` settings に optional `customProvider` を追加する
2. preset provider の fixed taxonomy semantics は変えない
3. `local-api` で `provider=custom` を OpenAI-compatible endpoint 限定で解決する
4. custom fields を編集できる最小の quiet Advanced UI を追加する
5. legacy fallback と Standard / Local の挙動は維持する

## Recent UI Polish Status

`claw-studio` で完了済みの小さな polish:

- composer の主操作を single Run/Stop button に統合
- run active 中だけ出る軽い `Thinking...` 表示を追加
- Permission / AI selection を compact composer popover に移動
- 通常 timeline では `running` / `completed` / `stopping` status row を主フローから外す
- local abnormal-exit 後だけ出る軽い local readiness hint を追加

これらは次の固定境界を維持する:

- `local-api` が truth owner
- `claw-studio` は mirrored UI のみ
- 通常 workspace UX は chat-first / low-noise を維持する
