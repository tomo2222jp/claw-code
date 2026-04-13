# Claw Handover Spec (English)

## Source Of Truth

- This file is the English companion to the Japanese handover spec
- Japanese primary: `docs/claw-handover-spec.md`
- New chats should read the primary spec first
- When updating the spec, update both JP and EN in the same work unit

---

## Purpose

This spec fixes the responsibility boundaries, provider/settings policy, and next entry points
for `claw-code` / `claw-ui` / `claw-studio`.

---

## Fixed Architecture

### Layering

1. UI Layer
   - `apps/claw-studio` = primary desktop workspace UI
   - `claw-ui/apps/web-ui` = verification web client
2. API Layer
   - `claw-ui/apps/local-api` = state owner / run coordinator
3. Engine Layer
   - `claw-code` = model routing / execution

---

## Fixed Boundaries

- `local-api` is the **truth owner** for run lifecycle, status, logs, final output, and settings
- execution adapter holds execution concerns only
- `claw-studio` is mirrored UI only — it must not own run truth
- `shared/contracts` is the shared boundary for run-related types

### Non-Goals

- Do not push provider resolution logic into `claw-studio`
- Do not infer provider from model family name
- Do not collapse UI and engine concerns
- Do not expose advanced settings in normal workspace view

---

## UI Policy

- Maintain chat-first / quiet workspace
- composer is the primary actor
- timeline is the primary scrolling axis
- Details panel holds deeper run output
- overlays are secondary, quiet surfaces

---

## Provider / Settings Policy

`local-api` is the **single source of truth** for all provider, model, and settings resolution.

### Cloud Provider Taxonomy (Fixed)

```
google
openrouter
openai
anthropic
```

- `provider` represents the routing / billing path
- Do not infer provider from model name
- `executionMode=local` is treated separately from cloud taxonomy

### Standard Mode (Default)

```ts
executionMode = "cloud"
provider      = "google"
modelId       = "gemini-2.5-flash"
```

- Standard resolves to Google direct Gemini
- This is the default for all new sessions

### Advanced Mode

- Explicit provider selection by user
- Supports all four fixed taxonomy providers
- Gemini direct (`provider=google`) and OpenRouter-via-Gemini (`provider=openrouter`) are separate paths

### Custom Provider (Planned — Phase 9C)

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

- OpenAI-compatible endpoints only (first version)
- Custom provider UI lives in the quiet Advanced surface only
- Preset provider taxonomy is not modified

### API Key Policy (Provisional)

- Held by `local-api`
- `claw-studio` handles input only
- Save is a merge-save: empty string retains existing value
- Future: planned migration to secret store

---

## Execution Architecture Summary

Two execution paths exist. Routing is determined by `enableTools`:

| Path           | Transport  | Tools | Target                          |
|----------------|------------|-------|---------------------------------|
| `tool-enabled` | CLI        | Yes   | GPT, Gemini, Claude             |
| `prompt-only`  | Direct API | No    | OpenRouter free models, lightweight |

```ts
enableTools === true  → tool-enabled
enableTools === false → prompt-only  (default)
```

Rules:
- `prompt-only` does not go through the CLI
- Does not send tool schema or `thinking` parameter
- `DirectApiEngineAdapter` routes between the two paths

---

## Current Phase

- **Phase 9.5** — Runtime / Execution UX Hardening (active)
- **Phase 9B** — Provider Taxonomy & Gemini Direct Routing (active, parallel)
- **Phase 9C** — Advanced Custom Provider (planned)

---

## Phase 9.5 — Runtime / Execution UX Hardening

Goals:
- Strengthen stop / cancel / abnormal exit reliability
- Maintain chat-first UX

Fixed conditions:
- `local-api` truth owner maintained
- `claw-studio` remains mirrored UI
- Runtime tuning values stay separate from model selection

---

## Phase 9B — Provider Taxonomy & Gemini Direct Routing

Goals:
- Resolve ambiguity between Gemini direct and OpenRouter-via-Gemini
- Make provider / billing path / endpoint path explicit in `local-api`

Policy:
- Cloud provider taxonomy fixed: `google / openrouter / openai / anthropic`
- `provider=google` = Google direct Gemini
- `provider=openrouter` + Gemini-family model = OpenRouter-routed Gemini
- Standard default resolves to Google direct Gemini

Done when:
- Taxonomy matches across spec / roadmap / `local-api` resolution
- Standard resolves to Google direct Gemini
- OpenRouter remains as explicit provider
- Legacy fallback is maintained

---

## Phase 9C — Advanced Custom Provider (Planned)

Goals:
- Add an Advanced-only entry point for OpenAI-compatible custom providers
- Keep fixed taxonomy intact

Scope:
- Introduce `provider=custom`
- Add optional `customProvider` settings object
- Fields: `providerId`, `displayName`, `baseUrl`, `apiKey`, `modelId`
- Preset providers unchanged

Rules:
- Preset and custom are explicitly separated
- Do not infer provider path from model name
- Custom provider is limited to OpenAI-compatible endpoints (first version)
- `local-api` is truth owner for endpoint and key resolution
- `claw-studio` handles input and display only

---

## Confirmed Decisions

- 3-layer architecture is fixed: UI / API / Engine
- `local-api` is the single truth owner for settings and run state
- `claw-studio` is UI-only — never a state owner
- Cloud provider taxonomy is fixed: `google / openrouter / openai / anthropic`
- Google direct and OpenRouter-via-Gemini are treated as separate paths
- Standard defaults to `provider=google` + `modelId=gemini-2.5-flash`
- Dual execution path (tool-enabled / prompt-only) is not to be overridden
- `prompt-only` is a first-class execution path, not a fallback

---

## Next Entry Points

1. Fix `local-api` provider resolution to align with fixed taxonomy
2. Lock Standard to Google direct Gemini (`provider=google`, `modelId=gemini-2.5-flash`)
3. Maintain legacy `activeProvider` / `activeModel` fallback
4. Continue Phase 9.5 runtime hardening
5. After taxonomy is stable — plan Phase 9C custom provider entry

---

## Work Rules

1. Read this file first
2. Record all spec changes here before implementing
3. Do not break `local-api` responsibility boundaries
4. Keep `claw-studio` as UI-only
5. Do not infer provider from model name
