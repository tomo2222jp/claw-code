# Sub-Agent / Tools Smoke Check

Date: 2026-04-09

## Purpose

This note captures the current status of active-model verification beyond the main CLI turn:

- sub-agent startup tracing
- tools-runtime tracing
- how to reproduce those paths with the current `claw` setup
- how to plan a deterministic `retries_used > 0` check

This is a smoke-check memo. It is not a large implementation task.

## What Was Already Confirmed Before This Pass

- `active_provider=openrouter`
- `active_model=openai/gpt-oss-120b:free`
- main `prompt` path emits `[active-model]`
- main `cli-turn` path emits `[active-model]`
- OpenRouter request path succeeds for at least one turn

## Code Paths That Emit The Logs

### `kind=subagent:<type>`

Emission point:

- [lib.rs](C:\temp\claw-code\rust\crates\tools\src\lib.rs): `build_agent_runtime(...)`

Relevant flow:

1. `Agent` tool invocation reaches `run_agent(...)`
2. `run_agent(...)` calls `execute_agent(...)`
3. `execute_agent(...)` creates an `AgentJob`
4. `run_agent_job(...)` builds the sub-agent runtime
5. `build_agent_runtime(...)` emits:

```text
[active-model] kind=subagent:<type> ...
```

This is the earliest proof that the sub-agent runtime picked up the active model.

### `kind=tools-runtime`

Emission point:

- [lib.rs](C:\temp\claw-code\rust\crates\tools\src\lib.rs): `impl ApiClient for ProviderRuntimeClient`

Relevant flow:

1. sub-agent runtime uses `ProviderRuntimeClient`
2. `ProviderRuntimeClient::stream(...)` sends the OpenRouter-backed request
3. success, non-retryable failure, or exhausted retry path emits:

```text
[active-model] kind=tools-runtime ...
```

This is the proof point for:

- the model actually used by the sub-agent/tool runtime
- the configured `retry_count`
- the observed `retries_used`

## Live Smoke Run

### Current config

- [settings.local.json](C:\temp\claw-code\.claw\settings.local.json)

```json
{
  "active_provider": "openrouter",
  "active_model": "openai/gpt-oss-120b:free",
  "retry_count": 2
}
```

### Command used

```powershell
$env:OPENAI_BASE_URL="https://openrouter.ai/api/v1"
.\rust\target\debug\claw.exe prompt "Use the Agent tool exactly once. Spawn an Explore sub-agent to inspect README.md and return a one-sentence summary. Then tell me only the final summary." --dangerously-skip-permissions
```

### Observed active-model logs

```text
[active-model] kind=prompt selected_provider=openai selected_model=openai/gpt-oss-120b:free retry_count=2 retries_used=0 provider_intent=openrouter
[active-model] kind=cli-turn selected_provider=openai selected_model=openai/gpt-oss-120b:free retry_count=2 retries_used=0
[active-model] kind=subagent:Explore selected_provider=openai selected_model=openai/gpt-oss-120b:free retry_count=2 retries_used=0 provider_intent=openrouter
[active-model] kind=tools-runtime selected_provider=openai selected_model=openai/gpt-oss-120b:free retry_count=2 retries_used=0
```

### What this confirms

- the model selected for the main prompt path matches the active-model config
- the model selected for the sub-agent path also matches the active-model config
- `provider_intent=openrouter` remains visible at sub-agent startup
- the tools runtime itself is using the same selected model
- `retry_count=2` is visible in both sub-agent-related traces

## Practical Minimal Reproduction

If you want to reproduce the sub-agent/tools path again, use this same pattern:

1. keep `active_provider=openrouter`
2. keep a working OpenRouter-backed `active_model`
3. run a prompt that strongly instructs the model to call the `Agent` tool exactly once

Recommended wording:

```text
Use the Agent tool exactly once. Spawn an Explore sub-agent to inspect README.md and return a one-sentence summary. Then tell me only the final summary.
```

This is not perfectly deterministic, because the model still decides tool usage, but with the current `gpt-oss-120b:free` setup it successfully triggered both `subagent:Explore` and `tools-runtime`.

## retries_used > 0

### Current status

Not yet live-observed.

### Why it was not observed here

The current successful OpenRouter path completed without a retryable provider error, so:

- `retry_count=2` was present
- `retries_used` remained `0`

This is expected for a normal first-pass success path.

### Deterministic way to observe it

The smallest reliable reproduction is:

1. keep `active_model` configured
2. keep `providerFallbacks` out of the path
3. point the OpenAI-compatible client at a local mock server
4. make the first tools-runtime request return a retryable error such as `429`, `500`, or `503`
5. make the second request succeed

Expected result:

```text
[active-model] kind=tools-runtime ... retries_used=1
```

### Why this is the best method

`ProviderRuntimeClient::stream(...)` increments `retries_used` only when it encounters a retryable provider error on the same selected model.

That means the cleanest check is not “hope a real provider rate-limits us,” but:

- one controlled retryable failure
- then one success

### Minimal mock requirements

The mock only needs to behave like an OpenAI-compatible chat/completions endpoint well enough for the tools runtime request:

- first response: retryable HTTP status
- second response: valid completion/stream response

No agent-loop change is required for this check.

## Confirmed vs Unconfirmed

### Confirmed

- `kind=subagent:Explore` can be emitted in a real run
- `kind=tools-runtime` can be emitted in a real run
- both paths use the configured active model
- both paths carry `retry_count`

### Not yet confirmed

- `retries_used > 0` in a live run
- a deterministic CLI-only reproduction that forces sub-agent invocation without relying on model behavior

## Recommended Next Step

For the next verification task, do not change the main runtime.

Instead:

1. keep the current working OpenRouter model
2. build a tiny OpenAI-compatible mock or reuse an existing local mock harness
3. target only the tools-runtime retry path
4. record one trace line where `retries_used=1`

That will complete the active-model retry observation without mixing it with broader model-comparison work.
