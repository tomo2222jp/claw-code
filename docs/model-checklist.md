# OpenRouter Model Checklist

Date: 2026-04-09

## Purpose

This memo is for validating candidate OpenRouter models against the current active-model flow in the Rust runtime.

It is intentionally scoped to model selection and smoke-checking. It is not a provider-implementation task.

## What Is Already Confirmed

- `active_provider=openrouter` is accepted by config parsing.
- `active_model` is reflected in CLI `prompt` / `repl` startup.
- `[active-model]` trace logging is emitted on `stderr`.
- OpenRouter API access works through the existing OpenAI-compatible path.
- `selected_provider=openai` with `provider_intent=openrouter` is expected in the current implementation.

## What The Current 404 Means

The current failure with `google/gemma-3-27b-it:free` is not an active-model wiring problem.

What was confirmed already:

- config loading worked
- active-model default selection worked
- logging worked
- OpenRouter request routing worked

What failed:

- the chosen model/provider combination did not expose a tool-use-capable endpoint for the current `claw` request shape

So the current blocker is model capability and provider availability for tool use, not the active-model implementation itself.

## Current Known Result

### `google/gemma-3-27b-it:free`

- status: active-model wiring confirmed
- price tier: free
- tool use: blocked in current smoke run
- note: OpenRouter returned `404 No endpoints found that support tool use`
- conclusion: useful for proving config/log plumbing, not a good next candidate for `claw` runtime validation

## Comparison Criteria

For this repository and execution style, compare models with these fields:

- `model id`
  Use the exact OpenRouter model slug in `active_model`.
- `free / paid`
  Free is good for cheap smoke checks, but paid models are often more reliable for tool-use verification.
- `tool use readiness`
  Prefer models explicitly described by OpenRouter as supporting function calling, tool use, or agent workflows.
- `structured output fit`
  Prefer models described as supporting structured outputs, JSON mode, schema adherence, or OpenAI-compatible tool-use formats.
- `retry-check fit`
  Prefer models that are stable and likely to return a real model response first. Retry verification is a second pass; it is easier once a baseline success path exists.

## Recommended Free Candidates

These are ordered for the current `claw` runtime shape and limited to free OpenRouter options.

| Priority | Model ID | Free/Paid | Why try next | Tool use fit | Structured output fit | Retry-check fit |
|---|---|---:|---|---|---|---|
| 1 | `openai/gpt-oss-120b:free` | Free | Best current free candidate for this runtime shape. OpenRouter explicitly calls out native tool use, function calling, browsing, structured output generation, and agentic use. | High | High | High |
| 2 | `openrouter/free` | Free | Strong fallback for “just get a free tool-capable model path.” OpenRouter says this router filters for required features such as tool calling and structured outputs. | Medium | Medium | Medium |
| 3 | `mistralai/mistral-small-3.1-24b-instruct:free` | Free | OpenRouter explicitly mentions function calling and programming fit. Good comparison point after `gpt-oss-120b:free`. | High | Medium | Medium |
| 4 | `qwen/qwen3.6-plus:free` | Free | OpenRouter strongly emphasizes agentic coding and repository-scale problem solving. Tool-use wording is weaker than the top three, so keep it slightly lower. | Medium | Medium | Medium |
| 5 | `arcee-ai/trinity-large-preview:free` | Free | Usable as a later exploratory option, but weaker evidence for tool/function calling and still marked Preview. | Low | Low | Low |

## Why These Candidates

### `openai/gpt-oss-120b:free`

This is the current best free first try. OpenRouter explicitly describes it as supporting native tool use, function calling, browsing, structured output generation, and agentic workloads. That matches the current `claw` runtime requirements most closely.

### `openrouter/free`

This is the strongest free fallback when the goal is “find any free model path that satisfies the request shape.” OpenRouter says the router filters for features like tool calling and structured outputs, which makes it useful after a model-specific 404.

### `mistralai/mistral-small-3.1-24b-instruct:free`

This is a good free comparison target because OpenRouter explicitly mentions function calling and programming fit. It is a cleaner capability check than guessing from a generic chat model.

### `qwen/qwen3.6-plus:free`

This remains worth trying because the page language strongly emphasizes agentic coding and repository-scale problem solving. The main caveat is that the tool/function-calling language is less explicit than the top three choices.

### `arcee-ai/trinity-large-preview:free`

This is included only as a later exploratory option. The currently available page evidence is weaker for tool calling, and it is still labeled Preview.

## Suggested Validation Order

1. `openai/gpt-oss-120b:free`
2. `openrouter/free`
3. `mistralai/mistral-small-3.1-24b-instruct:free`
4. `qwen/qwen3.6-plus:free`
5. `arcee-ai/trinity-large-preview:free`

## Minimal Swap Procedure

The current implementation is set up so that testing another OpenRouter model only requires changing `active_model`.

Edit:

- `C:\temp\claw-code\.claw\settings.local.json`

Example:

```json
{
  "active_provider": "openrouter",
  "active_model": "openai/gpt-oss-120b:free",
  "retry_count": 2
}
```

Then run:

```powershell
$env:OPENAI_BASE_URL="https://openrouter.ai/api/v1"
.\rust\target\debug\claw.exe prompt "say hello briefly"
```

## What To Look For In The Result

### Success path

- `[active-model]` appears on `stderr`
- `provider_intent=openrouter`
- `selected_model=<the exact model id you put in settings.local.json>`
- request completes without the tool-use 404

### Capability failure

- active-model log still shows the correct model and retry count
- the request then fails with an OpenRouter or provider capability error
- in that case, treat it as a model/provider issue, not an active-model issue

### Retry validation later

Once one model succeeds normally, use that same model for a dedicated retry test. Do not mix “can the model handle tool use?” with “can we observe retries?” in the same first-pass check.

## Notes

- `selected_provider=openai` is still expected for OpenRouter-backed models in the current implementation.
- `provider_intent=openrouter` is the more meaningful indicator for this pass.
- Free chat models can still be useful for plumbing checks, but they are a weak baseline for tool-use validation.

## Source Notes

OpenRouter pages consulted for this memo:

- `google/gemma-3-27b-it:free`
- `openai/gpt-oss-120b:free`
- `openrouter/free`
- `mistralai/mistral-small-3.1-24b-instruct:free`
- `qwen/qwen3.6-plus:free`
- `arcee-ai/trinity-large-preview:free`
