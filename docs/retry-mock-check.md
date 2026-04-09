# Retry Mock Check

Date: 2026-04-09

## Goal

Observe:

```text
retries_used > 0
```

for the active-model implementation in a deterministic way.

The target path is the tools runtime:

- `ProviderRuntimeClient::stream(...)`
- same selected active model
- same configured `retry_count`
- retry triggered by a retryable provider error

## What Needs To Be Proven

The last unverified item is not model selection anymore.

Already confirmed separately:

- `prompt` log
- `cli-turn` log
- `kind=subagent:<type>` log
- `kind=tools-runtime` log
- same active model across main CLI, sub-agent, and tools runtime

What remains:

- at least one tools-runtime request must fail with a retryable error
- the same selected model must be retried
- the next attempt must succeed
- the final tools-runtime trace must show `retries_used=1` or higher

## Recommended Approach

Use a local OpenAI-compatible mock server and target the tools runtime directly.

This is the most deterministic method because it avoids two sources of noise:

- real provider rate-limit timing
- the main model having to decide whether to call the `Agent` tool first

## Why Direct Tools Runtime Is Better Than Full CLI For This Check

If you run the full CLI against a mock, the mock has to simulate:

1. the main prompt turn
2. an `Agent` tool call
3. the sub-agent tools-runtime turn

That is possible, but it is more work and less deterministic.

If the only goal is `retries_used > 0`, the smallest target is:

- one `ProviderRuntimeClient`
- one OpenAI-compatible `/chat/completions` mock
- first response retryable
- second response successful

## Mock Contract

The current OpenAI-compatible client sends:

- `POST <OPENAI_BASE_URL>/chat/completions`
- JSON request body
- `Authorization: Bearer ...`
- streaming mode enabled

The mock only needs to implement that single endpoint.

## Required Mock Behavior

### Request 1

Return a retryable HTTP status.

Recommended choices:

- `503 Service Unavailable`
- or `500 Internal Server Error`
- or `429 Too Many Requests`

Example:

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{"error":{"message":"planned retryable failure"}}
```

### Request 2

Return a valid OpenAI-style streaming response.

The smallest useful success case is plain text, not a tool call.

Example SSE body:

```text
data: {"id":"cmpl-retry-2","model":"openai/gpt-oss-120b:free","choices":[{"delta":{"content":"retry observed"}}]}

data: {"id":"cmpl-retry-2","model":"openai/gpt-oss-120b:free","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}

data: [DONE]
```

Headers:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Connection: close
```

That is enough for the OpenAI-compatible parser to finish the streamed response.

## Best Execution Shape

### Recommended

A tiny focused harness inside the Rust workspace that:

1. sets `OPENAI_BASE_URL` to the local mock
2. sets `OPENAI_API_KEY` to any non-empty dummy value
3. constructs a `ProviderRuntimeClient`
4. sends one request through `ProviderRuntimeClient::stream(...)`
5. captures `stderr`

Why this is best:

- it directly exercises the code that increments `retries_used`
- it does not depend on the model choosing a tool
- it does not require mocking the full main CLI orchestration

### Less deterministic alternative

Use the current successful CLI model and ask it to invoke the `Agent` tool while `OPENAI_BASE_URL` points to a mock that simulates both:

- the main turn
- the sub-agent turn

This is possible, but not recommended for the first retry verification because it is more moving parts than necessary.

## Minimal Claw-Side Steps

These steps describe the recommended direct-tools-runtime path.

### 1. Keep active-model config as-is

- `active_provider=openrouter`
- `active_model=<working OpenRouter/OpenAI-compatible model id>`
- `retry_count=2`

The exact model string still matters because it is what should appear in the final log.

### 2. Start the local mock

Bind a local server, for example:

- `http://127.0.0.1:8787`

and implement:

- `POST /chat/completions`

with the two-response plan above.

### 3. Point the OpenAI-compatible client to the mock

Set:

```powershell
$env:OPENAI_API_KEY="dummy"
$env:OPENAI_BASE_URL="http://127.0.0.1:8787"
```

### 4. Run the focused tools-runtime harness

Recommended future command shape:

```powershell
cargo test -p tools <focused-retry-test-name> -- --nocapture
```

or an equivalent tiny debug harness that calls `ProviderRuntimeClient::stream(...)` directly.

## Expected Log Shape

During the retry, you should see a retry message similar to:

```text
provider openai/gpt-oss-120b:free failed with retryable error, retrying active model attempt 1/3: ...
```

and then the final tools-runtime summary:

```text
[active-model] kind=tools-runtime selected_provider=openai selected_model=openai/gpt-oss-120b:free retry_count=2 retries_used=1
```

If the first two attempts fail and the third succeeds, then:

```text
[active-model] kind=tools-runtime ... retries_used=2
```

## Success Criteria

The retry verification is complete when all of these are true:

- the selected model matches the configured active model
- the selected provider stays stable across retries
- `retry_count` matches config
- `retries_used` is greater than zero
- success happens without falling back to a different provider/model chain

## What Not To Change

This check does not require:

- changing the agent loop
- changing provider routing
- adding a real provider implementation
- changing fallback-provider semantics

The point is to validate the current retry behavior, not redesign it.

## Recommended Next Implementation Step

If you want this to become one-command reproducible, the smallest useful code addition would be:

- one focused test in `rust/crates/tools/src/lib.rs`
- reuse the existing lightweight `TestServer` pattern already present in that file
- return `503` once, then SSE success
- assert the request succeeds
- run with `-- --nocapture` so the `[active-model] kind=tools-runtime ... retries_used=1` line is visible

That would be the lowest-risk path to turning this from a documented plan into a deterministic regression check.
