# Claw Handover Spec

## Source Of Truth

- このファイルを日本語の handover spec の正本とする
- 英語 companion は `docs/claw-handover-spec.en.md`
- 新しい chat は最初にこのファイルを読む
- spec を変えるときは JP / EN を同じ work unit で更新する

---

## 目的

この spec は `claw-code` / `claw-ui` / `claw-studio` の責務境界、現在地、次の入口を固定する。

---

## 固定アーキテクチャ

### Layering

1. UI Layer
   - `apps/claw-studio` = primary desktop workspace UI
   - `claw-ui/apps/web-ui` = verification web client

2. API Layer
   - `claw-ui/apps/local-api` = state owner / run coordinator

3. Engine Layer
   - `claw-code` = execution engine

---

## 固定境界

- `local-api` が run lifecycle / status / logs / final output の **truth owner**
- execution adapter は execution concern のみ
- `claw-studio` は mirrored UI のみ
- `claw-studio` は run truth を持たない
- `shared/contracts` は run-related shared boundary

---

## UI 方針

- chat-first / quiet UI を維持
- composer 主役
- timeline 主軸
- 詳細は Details に退避

---

## Model / Settings 方針

- `local-api` が settings の truth owner
- `claw-studio` は入力と表示のみ
- runtime tuning と model selection は分離

---

## OpenCode-inspired Settings Alignment

### 目的
OpenCode の provider / model / options デザインパターンを採用しつつ、claw の truth ownership アーキテクチャを維持する。

### 基本方針
- アーキテクチャは不変: `local-api` が execution resolution の truth owner
- UI は OpenCode 的な設定入力面を持ってもよいが、normalize は `local-api` が担当
- provider taxonomy は固定: `google`, `openrouter`, `openai`, `anthropic`
- `provider=custom` は Advanced 専用
- settings shape は OpenCode-inspired な整理に従う

### そのまま採用する概念
- provider 単位の `options` フィールド
- `baseUrl` を正規フィールドとして扱う
- `model` と `smallModel` の区別（将来対応用）
- config merge / precedence 階層
- 暗黙推定ではなく明示的 provider selection

### claw 用に変形して採用する概念
- `provider_id` / `model_id` 的な整理
- custom provider shape（`customProvider` フィールド）
- secret / API key の扱い（暫定方針）
- provider ごとの model capability 表示
- project / session / default の優先順位設計

### 採用しない概念
- UI truth ownership
- UI 主導の provider resolution
- run lifecycle ownership の移譲
- settings だけで execution path が曖昧になる設計

### Settings Shape（将来）
```ts
{
  provider: "google" | "openrouter" | "openai" | "anthropic" | "custom",
  modelId: string,
  smallModelId?: string,
  baseUrl?: string,
  providerOptions?: Record<string, unknown>,
  customProvider?: {
    label: string,
    baseUrl: string,
    apiKey?: string,
    // ... provider 別フィールド
  }
}
```

### 解決順序
1. `local-api` がすべての設定入力を normalize する
2. UI は OpenCode 的な設定入力面を提供する（入力のみ）
3. 最終的な execution resolution は `local-api` が保持
4. Standard 既定値は維持:
   - `executionMode=cloud`
   - `provider=google`
   - `modelId=gemini-2.5-flash`

---

## Cloud Provider Taxonomy（固定）

- `google`
- `openrouter`
- `openai`
- `anthropic`

ルール:

- provider は routing / billing path を表す
- model 名から provider を推測しない
- `executionMode=local` は別扱い

---

## 🚨 Execution Architecture（NEW）

### 背景

従来は CLI + tool 前提の単一路線だったが、

- OpenRouter free models が tool 非対応
- CLI stdin hang（Thinking 固着）
- context 過多による failure

が発生

---

### 決定

**実行経路を2つに分離**

---

### Execution Paths

#### 1. tool-enabled（従来）

- CLI経由
- tool使用あり
- 対象:
  - GPT
  - Gemini
  - Claude

---

#### 2. prompt-only（新）

- Direct API（fetch）
- tool無し
- 最小payload（model + messages）

対象:

- OpenRouter free models
- 軽量 / 安価モデル

---

### Routing

```ts
enableTools === true  → tool-enabled
enableTools === false → prompt-only（default）
```

---

### 重要ルール

- prompt-only は CLI を通さない
- tool schema を送らない
- thinking パラメータを送らない

---

### 効果

- CLI hang 解消
- OpenRouter free 対応
- シンプルな実行経路確立

---

## Current Model Strategy

### Primary

```
deepseek/deepseek-v3.2
```

理由:

- 安定動作確認済み
- コーディング性能良好
- コスト効率高

---

### Secondary

```
meta-llama/llama-3.3-70b-instruct:free
nousresearch/hermes-3-llama-3.1-405b:free
```

※ 不安定（429 / provider 制約あり）

---

## API Key 方針（暫定）

- `local-api` が保持
- `claw-studio` は入力のみ
- 保存時 overwrite を防止済み（空文字は既存値を保持）
- 将来 secret store 分離予定

---

## Current Status

### claw-studio

- UI 完成（quiet workspace）
- model selection 実装済み
- prompt-only 対応済み

---

### local-api

- execution split 実装済み
- `DirectApiEngineAdapter` 導入済み
- safe JSON parsing 実装済み
- API key overwrite 防止済み

---

## Confirmed Decisions

- execution path は dual structure とする
- prompt-only を正式経路として扱う
- OpenRouter free は prompt-only 前提
- `local-api` truth owner 維持
- `claw-studio` は UI 専用に保つ
- cloud provider taxonomy は `google / openrouter / openai / anthropic` で固定
- Gemini direct と OpenRouter 経由 Gemini は別経路として扱う

---

## Next Entry Point

1. model selection UI 安定化
2. API key UI 整備
3. model capability labeling
4. prompt optimization

---

## Work Rules

1. このファイルを最初に読む
2. spec 変更は必ず記録
3. `local-api` の責務を崩さない
4. `claw-studio` は UI 専用に保つ

---

## Phase 9.8 — Execution Path Stabilization（Completed）

### Goals

- OpenRouter free models 対応
- CLI 依存の解消
- 実行安定性確保

---

### Implemented

- dual execution path
  - `tool-enabled`（CLI）
  - `prompt-only`（Direct API）
- `DirectApiEngineAdapter` 導入
- CLI stdin hang 解消
- safe JSON parsing
- API key overwrite 防止
- 識別ログ追加（`[engine]` / `[direct-api]`）

---

### Result

- DeepSeek V3.2 安定動作
- Llama / Hermes 使用可能（制約あり）
- Thinking 固着解消

---

## Phase 10 — Model & Usability Layer（Current）

### Focus

- model selection UI 安定化
- API key 設定 UI
- model capability 表示

---

### In Progress

- DeepSeek を既定モデル化
- provider 別挙動整理
- エラー表示改善

---

### Next

- prompt 最適化
- tool-enabled path 再安定化
- provider 別チューニング
