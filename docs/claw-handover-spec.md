# Claw Handover Spec

## Source Of Truth

- このファイルを日本語の handover spec の正本とする
- 英語 companion は `C:\temp\claw-code\docs\claw-handover-spec.en.md`
- 新しい chat は最初にこのファイルを読む
- spec を変えるときは JP / EN を同じ work unit で更新する

## 目的

この spec は `claw-code` / `claw-ui` / `claw-studio` の責務境界、現在地、次の入口を固定する。

## 固定アーキテクチャ

1. UI Layer
   - `apps/claw-studio` = primary desktop workspace UI
   - `claw-ui/apps/web-ui` = verification web client
2. App API Layer
   - `claw-ui/apps/local-api` = state owner
3. Engine Layer
   - `claw-code` = runtime / execution bridge

### 固定境界

- `local-api` が run lifecycle / run status / logs / final output / stop state の truth owner
- adapter は execution concern のみを持つ
- `claw-studio` は mirrored workspace UI のままにする
- `claw-studio` は run truth を持たない
- `shared/contracts` は run-related shared boundary

## UI 方針

- `claw-studio` は chat-first / quiet UI を維持する
- composer を主役にする
- timeline を主軸にする
- sessions / Project Memory は rail-triggered overlay
- overlay は排他
- run 情報は通常画面で主役にしない
- deeper details は `Details` に退避する

## Model / Settings 方針

- `local-api` が LLM settings の truth owner
- `claw-studio` は入力と表示のみ
- runtime tuning value と LLM selection settings は混ぜない
- `llmSettings` は少なくとも次を持つ
  - `executionMode`
  - `provider`
  - `modelId`

## Cloud Provider Taxonomy

cloud provider id は次で固定する。

- `google`
- `openrouter`
- `openai`
- `anthropic`

ルール:

- `executionMode=cloud` の `provider` は上記 taxonomy のいずれか
- `executionMode=local` は cloud provider taxonomy と混在させない
- `provider` は model family 名ではなく、実際の routing / billing path を表す
- 今後 provider を追加する場合も、taxonomy に明示追加して扱う

## Gemini Routing Policy

Gemini direct と OpenRouter 経由 Gemini は別経路として扱う。

固定ルール:

- `provider=google` = Google direct API / Google billing / Google endpoint
- `provider=openrouter` + Gemini-family `modelId` = OpenRouter routing / OpenRouter billing
- model family が Gemini でも、provider を暗黙に `google` へ寄せない
- OpenRouter-via-Gemini は valid な選択肢だが、Google direct と同一視しない

## Standard / Advanced 方針

### Standard

Standard は通常 UX 上の単一 default AI として扱う。

既定値:

- `executionMode=cloud`
- `provider=google`
- `modelId=gemini-2.5-flash`
- `profile=standard`

ルール:

- Standard は direct Gemini を既定にする
- Standard の実解決は `local-api` 側で行う
- `claw-studio` は `Standard` を表示できるが、実解決ロジックは持たない

### Advanced

Advanced は provider を明示設定するための経路とする。

ルール:

- provider 選択は Advanced で明示する
- OpenRouter を使う場合も `provider=openrouter` を保存する
- Gemini direct を使う場合は `provider=google` を保存する
- `claw-studio` は入力と表示のみ、解決は `local-api`

## Current Status

### `claw-studio`

- Phase 7G UI simplification 完了
- quiet workspace 化済み
- Project Memory v1a / v2 / hygiene / v3 完了
- minimal LLM selector 実装済み
- Advanced first version 実装済み

### `local-api`

- run / state truth owner を維持
- stop timeout configurable 済み
- `llmSettings` shape / resolution 導入済み
- legacy `activeProvider` / `activeModel` fallback 維持

## Confirmed Decisions

- `local-api` が provider / model 解決の truth owner を維持する
- cloud provider taxonomy は `google / openrouter / openai / anthropic` で固定する
- Gemini direct と OpenRouter 経由 Gemini は別経路として扱う
- Standard の既定値は direct Gemini
  - `executionMode=cloud`
  - `provider=google`
  - `modelId=gemini-2.5-flash`
- Advanced は provider 明示選択のための経路とする
- `claw-studio` は mirrored UI のまま、provider 解決ロジックを持たない

## Unresolved Items

- unknown cloud provider を route validation 時点で弾くか
- Standard 既定値を将来 remote-configurable にするか
- 通常 UI に provider path をどこまで見せるか
- `profile` を今後どこまで解決ロジックに使うか

## Next Entry Point

次の作業入口:

1. `local-api` で fixed taxonomy 前提の provider resolution を実装する
2. Standard を Google direct Gemini に正規化する
3. `llmSettings` 未指定または不正時は legacy fallback を維持する
4. Gemini direct と OpenRouter Gemini を明確に分離したまま進める

## Work Rules

次の chat では必ず以下を守る。

1. まずこのファイルを読む
2. spec が必要なら JP / EN を同時更新する
3. `local-api` truth owner を崩さない
4. `claw-studio` を mirrored UI のまま保つ
5. quiet UI を壊さない
## Advanced Custom Provider（first version / 2026-04-12）

### Confirmed Decisions

- built-in cloud taxonomy は引き続き次で固定する。
  - `google`
  - `openrouter`
  - `openai`
  - `anthropic`
- Advanced では追加の明示経路として `provider=custom` を導入してよい。
- `provider=custom` は fixed taxonomy の置き換えではなく、Advanced 専用の escape hatch として扱う。
- first version の custom provider は OpenAI-compatible endpoint のみ対象とする。
- provider routing は常に明示する。
  - preset provider は fixed taxonomy id を使う
  - custom provider は `provider=custom` と `customProvider` を併用する
- model family 名から provider path を推測しない。
- `local-api` が provider resolution / endpoint resolution / secret を含む settings の truth owner を持つ。
- `claw-studio` は入力と表示のみを担当し、provider 解決を持たない。

### 型定義方針

- `llmSettings` の top-level は維持する。
  - `executionMode`
  - `provider`
  - `modelId`
  - optional `fallbackProvider`
  - optional `fallbackModelId`
  - optional `profile`
- `provider=custom` のときだけ、`llmSettings.customProvider` を追加できる形にする。
  - `customProvider.providerId`
  - `customProvider.displayName`
  - `customProvider.baseUrl`
  - `customProvider.apiKey`
  - `customProvider.modelId`
- 互換性のため `llmSettings.modelId` 自体は残す。
- `provider=custom` の場合、top-level `modelId` は `customProvider.modelId` を mirror する扱いにする。

### preset / custom の境界

- preset provider は、製品として既知の routing / billing path を持つ固定経路。
- custom provider は、fixed taxonomy に載せない OpenAI-compatible endpoint を明示利用するための経路。
- preset provider の意味は固定する。
  - `google` = Google direct contract / endpoint / billing path
  - `openrouter` = OpenRouter contract / endpoint / billing path
  - `openai` = OpenAI direct contract / endpoint / billing path
  - `anthropic` = Anthropic direct contract / endpoint / billing path
- `custom` は preset provider の別名として使わない。
- Qwen などを OpenAI-compatible endpoint で使う場合は `provider=custom` として保存し、`openai` や `openrouter` を流用しない。

### Advanced UI 方針

- 通常 workspace は quiet UI を維持する。
- Standard / Local は引き続き簡便入口とする。
- Advanced は explicit provider selection の面として維持する。
- custom provider の詳細項目は composer toolbar に常時展開しない。
- first version では Advanced 内で `Custom` を選んだときだけ最小項目を表示する。
  - provider id
  - display name
  - base URL
  - API key
  - model id
- Save は `local-api` settings へ保存する。
- Cancel は draft を破棄する。
- Reset to Standard は `llmSettings` を外し、legacy/default resolution に戻す。

### API key 保存方針（暫定）

- custom provider の API key は `local-api` 所有の settings data として扱う。
- `claw-studio` は入力して送信できるが、truth owner にはならない。
- first version では互換性とスコープ優先で、既存の local settings 保存経路に乗せてもよい。
- ただしこれは暫定運用であり、最終的な secret management 設計ではない。
- 将来 slice で、Advanced UX を変えずに secret store 分離へ移行してよい。

### Unresolved Items

- `provider=custom` で `baseUrl` を shape validation のみで受けるか、allow / deny ルールを入れるか
- `customProvider.providerId` をグローバル一意にすべきか、ローカル識別子で十分か
- preset provider の key と custom provider の key を将来 dedicated secret store に移すか
- 保存後の quiet summary に active endpoint path をどこまで見せるか

### Next Entry Point

1. `shared/contracts` と `local-api` settings shape に optional `customProvider` を追加する
2. fixed taxonomy の意味を変えずに `provider=custom` を追加する
3. `local-api` resolution で custom provider は nested endpoint / key のみを使うようにする
4. 通常 workspace chrome を増やさない最小 Advanced UI で custom fields を編集可能にする

## Composer Quieting Update（2026-04-12）

### Confirmed Decisions

- composer の主操作は single Run/Stop button に統合済み。
- main action の切替は mirrored API state のみで行う。
  - idle / stoppable でない -> `Run`
  - active / stoppable -> `Stop`
- 軽い `Thinking...` 表示を、run active 中だけ出す。
- `Thinking...` は stop / completed / failed / abnormal exit 後に消す。
- Permission と AI の選択は compact な composer popover に退避済み。
- Role は到達性を残しつつ、toolbar 全体は以前の segmented-control 常設より静かに保つ。
- composer は主役のままだが、重い control strip にはしない。

### Current UI Behavior

- 通常画面では説明的な `Running` / `Completed` 表示を主シグナルにしない。
- 通常画面での runtime フィードバックは次を優先する。
  - single Run/Stop action
  - 一時的な `Thinking...`
  - 深掘り時の `Details`
- timeline では `running` / `completed` / `stopping` の status row を通常フローから外す。
- ただし `failed` / `abnormal_exit` / `stopped` は、必要時に見える形を維持してよい。

### Unresolved Items

- Role control も将来同じ compact popover pattern に寄せるか
- `Thinking...` を queueing と model-processing で将来分けるか
- main action を将来 icon-first にするか

### Next Entry Point

1. composer を quiet かつ迷わず使える状態で維持する
2. always-visible segmented toolbar control を再導入しない
3. action switching は API truth 駆動のまま維持する

## Local Readiness Hint Update（2026-04-12）

### Confirmed Decisions

- local readiness hint は次の条件でのみ出してよい。
  - `llmSettings.executionMode=local`
  - 直近 relevant run が local abnormal-exit pattern で終わっている
- 現在の hint category は次。
  - Ollama unreachable
  - local model missing
  - local provider timeout
- この hint は advisory UI のみで、実行フローや truth ownership は変えない。

### Unresolved Items

- 将来 one-click recovery を付けるか
- hint 判定を string matching から structured API error code に移すか
