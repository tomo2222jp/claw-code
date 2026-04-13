# Claw Handover Spec (English)

## Source Of Truth

- This file is the English companion to the Japanese handover spec
- Japanese primary: `docs/claw-handover-spec.md`
- New chats should read the primary spec first
- When updating the spec, update both JP and EN in the same work unit

---

## Purpose

This spec fixes the responsibility boundaries, current state, and next entry points for `claw-code` / `claw-ui` / `claw-studio`.

---

## Fixed Architecture

### Layering

1. UI Layer
   - `apps/claw-studio` = primary desktop workspace UI
   - `claw-ui/apps/web-ui` = verification web client

2. API Layer
   - `claw-ui/apps/local-api` = state owner / run coordinator

3. Engine Layer
   - `claw-code` = execution engine

---

## Fixed Boundaries

- `local-api` is the **truth owner** for run lifecycle / status / logs / final output
- execution adapter holds execution concerns only
- `claw-studio` is mirrored UI only
- `claw-studio` does not own run truth
- `shared/contracts` is the run-related shared boundary

---

## UI Policy

- Maintain chat-first / quiet UI
- composer is the primary actor
- timeline is the primary axis
- Details panel for deeper information

---

## Model / Settings Policy

- `local-api` is the truth owner for settings
- `claw-studio` handles input and display only
- Separate runtime tuning from model selection

---

## Cloud Provider Taxonomy (Fixed)

- `google`
- `openrouter`
- `openai`
- `anthropic`

Rules:

- provider represents routing / billing path
- Do not infer provider from model name
- `executionMode=local` is treated separately

---

## 🚨 Execution Architecture (NEW)

### Background

The previous architecture used a single path based on CLI + tool, which caused:

- OpenRouter free models do not support tools
- CLI stdin hang (Thinking fixation)
- Failures due to excessive context

---

### Decision

**Split execution into two separate paths**

---

### Execution Paths

#### 1. tool-enabled (legacy)

- Via CLI
- Tool usage enabled
- Targets:
  - GPT
  - Gemini
  - Claude

---

#### 2. prompt-only (new)

- Direct API (fetch)
- No tools
- Minimal payload (model + messages only)

Targets:

- OpenRouter free models
- Lightweight / low-cost models

---

### Routing

```ts
enableTools === true  → tool-enabled
enableTools === false → prompt-only (default)
```

---

### Key Rules

- prompt-only does not go through the CLI
- Does not send tool schema
- Does not send thinking parameter

---

### Effects

- CLI hang resolved
- OpenRouter free model support
- Simplified execution path established

---

## Current Model Strategy

### Primary

```
deepseek/deepseek-v3.2
```

Reasons:

- Stable operation confirmed
- Strong coding performance
- High cost efficiency

---

### Secondary

```
meta-llama/llama-3.3-70b-instruct:free
nousresearch/hermes-3-llama-3.1-405b:free
```

※ Unstable (429 / provider constraints)

---

## API Key Policy (Provisional)

- Held by `local-api`
- `claw-studio` handles input only
- Overwrite on save is prevented (empty string retains existing value)
- Future: planned migration to secret store

---

## Current Status

### claw-studio

- UI complete (quiet workspace)
- Model selection implemented
- prompt-only support in place

---

### local-api

- Execution split implemented
- `DirectApiEngineAdapter` introduced
- Safe JSON parsing implemented
- API key overwrite prevention implemented

---

## Confirmed Decisions

- execution path is dual structure — not to be overridden
- prompt-only is treated as a first-class execution path
- OpenRouter free models use prompt-only exclusively
- `local-api` truth owner maintained
- `claw-studio` kept as UI-only
- Cloud provider taxonomy fixed: `google / openrouter / openai / anthropic`
- Google direct and OpenRouter-via-Gemini are treated as separate paths

---

## Next Entry Points

1. Stabilize model selection UI
2. Improve API key settings UI
3. Model capability labeling
4. Prompt optimization

---

## Work Rules

1. Read this file first
2. Record all spec changes
3. Do not break `local-api` responsibility boundaries
4. Keep `claw-studio` as UI-only

---

## Phase 9.8 — Execution Path Stabilization (Completed)

### Goals

- OpenRouter free model support
- Reduce CLI dependency
- Establish execution stability

---

### Implemented

- Dual execution path
  - `tool-enabled` (CLI)
  - `prompt-only` (Direct API)
- `DirectApiEngineAdapter` introduced
- CLI stdin hang resolved
- Safe JSON parsing
- API key overwrite prevention
- Identification logging added (`[engine]` / `[direct-api]`)

---

### Result

- DeepSeek V3.2 stable operation
- Llama / Hermes usable (with constraints)
- Thinking fixation resolved

---

## Phase 10 — Model & Usability Layer (Current)

### Focus

- Model selection UI stabilization
- API key settings UI
- Model capability display

---

### In Progress

- Establishing DeepSeek as default model
- Organizing provider-specific behavior
- Improving error display

---

### Next

- Prompt optimization
- tool-enabled path re-stabilization
- Per-provider tuning
