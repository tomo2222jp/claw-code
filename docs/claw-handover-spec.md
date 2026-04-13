# Claw Handover Spec

## Source Of Truth

- このファイルを日本語の handover spec の正本とする
- 英語 companion は `docs/claw-handover-spec.en.md`
- 新しい chat は最初にこのファイルを読む
- spec を変えるときは JP / EN を同じ work unit で更新する

---

## 目的

この spec は `claw-code` / `claw-ui` / `claw-studio` の責務境界、provider/settings 方針、次の入口を固定する。

---

## 固定アーキテクチャ

### Layering

1. UI Layer
   - `apps/claw-studio` = primary desktop workspace UI
   - `claw-ui/apps/web-ui` = verification web client
2. API Layer
   - `claw-ui/apps/local-api` = state owner / run coordinator
3. Engine Layer
   - `claw-code` = model routing / execution

---

## 固定境界

- `local-api` が run lifecycle / status / logs / final output / settings の **truth owner**
- execution adapter は execution concern のみ
- `claw-studio` は mirrored UI のみ — run truth を持たない
- `shared/contracts` は run-related shared boundary

### 非スコープ

- provider 解決ロジックを `claw-studio` に持たせない
- model family 名から provider を暗黙推定しない
- UI と engine concern を混在させない
- advanced settings を通常 workspace 画面に露出しない

---

## UI 方針

- chat-first / quiet workspace を維持
- composer 主役
- timeline 主軸
- 詳細は Details に退避
- overlay は補助・静かな面

---

## Provider / Settings 方針

`local-api` が provider / model / settings 解決の **single source of truth**。

### Cloud Provider Taxonomy（固定）

```
google
openrouter
openai
anthropic
```

- `provider` は routing / billing path を表す
- model 名から provider を推測しない
- `executionMode=local` は cloud taxonomy と別扱い

### Standard モード（既定）

```ts
executionMode = "cloud"
provider      = "google"
modelId       = "gemini-2.5-flash"
```

- Standard は Google direct Gemini に解決する
- 新規セッションの既定値

### Advanced モード

- ユーザーによる explicit provider 選択
- 4つの固定 taxonomy すべてをサポート
- Gemini direct（`provider=google`）と OpenRouter 経由 Gemini（`provider=openrouter`）は別経路

### Custom Provider（Planned — Phase 9C）

```ts
provider       = "custom"
customProvider = {
  providerId:   string
  displayName:  string
  baseUrl:      string
  apiKey:       string
  modelId:      string
}
```

- first version は OpenAI-compatible endpoint のみ
- custom provider UI は quiet Advanced 面のみに置く
- preset provider taxonomy は変更しない

### API Key 方針（暫定）

- `local-api` が保持
- `claw-studio` は入力のみ
- 保存は merge-save：空文字は既存値を保持
- 将来 secret store 分離予定

---

## Execution Architecture サマリ

実行経路は2つ。`enableTools` によってルーティングを決定する：

| Path           | Transport  | Tools | 対象                              |
|----------------|------------|-------|-----------------------------------|
| `tool-enabled` | CLI        | あり  | GPT、Gemini、Claude               |
| `prompt-only`  | Direct API | なし  | OpenRouter free models、軽量モデル |

```ts
enableTools === true  → tool-enabled
enableTools === false → prompt-only（既定）
```

ルール：
- `prompt-only` は CLI を通さない
- tool schema / `thinking` パラメータを送らない
- `DirectApiEngineAdapter` が2つの経路をルーティングする

---

## 現在フェーズ

- **Phase 9.5** — Runtime / Execution UX Hardening（進行中）
- **Phase 9B** — Provider Taxonomy & Gemini Direct Routing（進行中・並行）
- **Phase 9C** — Advanced Custom Provider（Planned）

---

## Phase 9.5 — Runtime / Execution UX Hardening

目的：
- stop / cancel / abnormal exit の信頼性を強化する
- chat-first UX を維持する

固定条件：
- `local-api` truth owner 維持
- `claw-studio` mirrored UI 維持
- runtime tuning value と model selection を混ぜない

---

## Phase 9B — Provider Taxonomy & Gemini Direct Routing

目的：
- Gemini direct と OpenRouter 経由 Gemini の曖昧さを解消する
- `local-api` で provider / billing path / endpoint path を明示化する

方針：
- cloud provider taxonomy を固定：`google / openrouter / openai / anthropic`
- `provider=google` = Google direct Gemini
- `provider=openrouter` + Gemini-family model = OpenRouter 経由 Gemini
- Standard の既定は Google direct Gemini に解決する

完了条件：
- taxonomy が spec / roadmap / `local-api` resolution で一致する
- Standard が Google direct Gemini に解決される
- OpenRouter は explicit provider として残る
- legacy fallback が維持される

---

## Phase 9C — Advanced Custom Provider（Planned）

目的：
- fixed taxonomy を崩さずに Advanced 専用で OpenAI-compatible custom provider を追加する

スコープ：
- `provider=custom` を導入する
- optional `customProvider` settings object を追加する
- フィールド：`providerId`、`displayName`、`baseUrl`、`apiKey`、`modelId`
- preset provider は変更しない

ルール：
- preset と custom は明示的に分離する
- model 名から provider path を推測しない
- first version は OpenAI-compatible endpoint のみ
- endpoint / key の解決は `local-api` が truth owner
- `claw-studio` は入力と表示のみ

---

## Confirmed Decisions

- 3-layer architecture は固定：UI / API / Engine
- `local-api` は settings と run state の single truth owner
- `claw-studio` は UI 専用 — state owner にしない
- cloud provider taxonomy は固定：`google / openrouter / openai / anthropic`
- Gemini direct と OpenRouter 経由 Gemini は別経路として扱う
- Standard の既定は `provider=google` + `modelId=gemini-2.5-flash`
- dual execution path（tool-enabled / prompt-only）は変更しない
- `prompt-only` は fallback ではなく正式経路

---

## Next Entry Point

1. `local-api` の provider resolution を fixed taxonomy に寄せる
2. Standard を Google direct Gemini に固定する（`provider=google`、`modelId=gemini-2.5-flash`）
3. legacy `activeProvider` / `activeModel` fallback を維持する
4. Phase 9.5 runtime hardening を継続する
5. taxonomy が安定したら Phase 9C custom provider の入口を計画する

---

## Work Rules

1. このファイルを最初に読む
2. spec 変更はすべてここに記録してから実装する
3. `local-api` の責務を崩さない
4. `claw-studio` は UI 専用に保つ
5. model 名から provider を推測しない
