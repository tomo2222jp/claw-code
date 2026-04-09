# Active Model Smoke Check

Date: 2026-04-09

## Scope

This note records a smoke check of the initial active-model flow in the Rust implementation.

Goals for this pass:

- confirm that `active_provider` / `active_model` are picked up in normal CLI paths
- confirm that `[active-model] ...` trace lines appear on `stderr`
- confirm that `retry_count` is reflected in logs
- confirm that unsupported `gemini` config fails explicitly
- separate confirmed behavior from environment-blocked or still-unverified behavior

This was not a provider implementation pass. `gemini` remains unsupported in the Rust runtime.

Note for the next config iteration:

- `openrouter` should be treated as the preferred `active_provider` value
- the runtime still executes it through the existing OpenAI-compatible client path
- logs will therefore read naturally as `selected_provider=openai ... provider_intent=openrouter`

## Environment

- workspace: `C:\temp\claw-code`
- binary used for smoke checks: `C:\temp\claw-code\rust\target\debug\claw.exe`
- build command:

```powershell
cmd /c "call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat >nul && set PATH=C:\Users\mana_\.cargo\bin;%PATH% && cargo build -p rusty-claude-cli"
```

Build completed successfully for `rusty-claude-cli`.

## Minimal Smoke Configs

### qwen

File: `C:\temp\claw-code\smoke\qwen\.claw\settings.local.json`

```json
{
  "active_provider": "qwen",
  "active_model": "qwen/qwen-max",
  "fallback_provider": "openai",
  "fallback_model": "gpt-4.1",
  "retry_count": 2
}
```

### gemini

File: `C:\temp\claw-code\smoke\gemini\.claw\settings.local.json`

```json
{
  "active_provider": "gemini",
  "active_model": "gemini/gemini-2.5-pro",
  "retry_count": 1
}
```

## Minimal Correction Applied During Smoke Check

One small inconsistency was found while validating the CLI path:

- `repl` already used config-backed active-model resolution
- `prompt` still used the legacy default model when `--model` was omitted

To keep smoke behavior aligned with the intended active-model flow, `prompt` was updated to resolve the default model through the same helper before emitting the trace log and creating `LiveCli`.

Changed file:

- `C:\temp\claw-code\rust\crates\rusty-claude-cli\src\main.rs`

## Commands Run

### qwen prompt

```powershell
$env:HOME='C:\Users\mana_'
$env:USERPROFILE='C:\Users\mana_'
Remove-Item Env:DASHSCOPE_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:DASHSCOPE_BASE_URL -ErrorAction SilentlyContinue
& 'C:\temp\claw-code\rust\target\debug\claw.exe' prompt 'smoke check' --dangerously-skip-permissions
```

Working directory:

`C:\temp\claw-code\smoke\qwen`

### qwen repl startup

```powershell
$env:HOME='C:\Users\mana_'
$env:USERPROFILE='C:\Users\mana_'
$env:DASHSCOPE_API_KEY='dummy'
$env:DASHSCOPE_BASE_URL='http://127.0.0.1:1'
cmd /c "echo /exit| C:\temp\claw-code\rust\target\debug\claw.exe"
```

Working directory:

`C:\temp\claw-code\smoke\qwen`

### gemini prompt

```powershell
$env:HOME='C:\Users\mana_'
$env:USERPROFILE='C:\Users\mana_'
& 'C:\temp\claw-code\rust\target\debug\claw.exe' prompt 'smoke check' --dangerously-skip-permissions
```

Working directory:

`C:\temp\claw-code\smoke\gemini`

## Observed Logs

### qwen prompt

Observed `stderr`:

```text
[active-model] kind=prompt selected_provider=openai selected_model=qwen/qwen-max retry_count=2 retries_used=0 provider_intent=qwen
error: missing DashScope credentials; export DASHSCOPE_API_KEY before calling the DashScope API
```

What this confirms:

- `active_model` was used as the CLI default for prompt-mode execution
- `selected_model` matched `qwen/qwen-max`
- `selected_provider` resolved to `openai`
- `provider_intent` preserved `qwen`
- `retry_count=2` was reflected in the trace line

Notes:

- `selected_provider=openai` is expected from the current provider-kind routing layer
- runtime credentials for the qwen path are currently reported as DashScope credentials

### qwen repl startup

Observed `stderr` / startup output:

```text
[active-model] kind=repl selected_provider=openai selected_model=qwen/qwen-max retry_count=2 retries_used=0 provider_intent=qwen
Connected: qwen/qwen-max via openai
```

What this confirms:

- `repl` startup picked the same active model
- the active-model trace line is emitted before interactive use
- the connected-line matches the same selected model and provider

### gemini unsupported config

Observed `stderr`:

```text
error: merged settings.active_provider: provider gemini is not yet supported in the Rust runtime
```

What this confirms:

- `gemini` fails explicitly
- the error is not ambiguous about current support status

## Confirmation Matrix

### Confirmed

- `active_provider` / `active_model` with qwen are reflected in CLI prompt logs
- `active_provider` / `active_model` with qwen are reflected in CLI repl-start logs
- `[active-model]` trace lines are emitted on `stderr`
- `retry_count` is included in the trace line
- `gemini` produces an explicit unsupported-provider error

### Partially confirmed

- `retries_used` is present in logs and observed as `0`
- this confirms field presence and default reporting
- this does not yet confirm a non-zero retry path

### Not confirmed in this pass

- `kind=cli-turn` trace on a successful model turn
- non-zero `retries_used` after an actual retryable provider failure
- `tools` / sub-agent runtime `[active-model]` traces from a live spawned sub-agent path

## Why Some Items Remain Unverified

### Successful CLI turn

The current smoke run used intentionally missing or invalid credentials so that provider selection could be observed without needing real upstream access. That was enough to confirm startup/default-model selection, but not enough to produce a successful streamed turn and its end-of-turn `kind=cli-turn` log.

### Non-zero retries

`retry_count` is wired and visible, but observing `retries_used > 0` would require a controlled retryable provider failure path such as a local OpenAI-compatible mock or a real provider returning a retryable error. That harness was out of scope for this smoke pass.

### tools / sub-agent runtime

The `tools` crate contains the trace hooks:

- `kind=subagent:<type>` at sub-agent runtime construction
- `kind=tools-runtime` inside `ProviderRuntimeClient::stream`

However, this smoke pass did not execute a direct CLI path that deterministically spawns a sub-agent without also relying on a successful model-driven tool-selection flow or adding a dedicated harness. Because this pass was limited to minimal execution verification, the `tools` runtime logs remain code-confirmed but not live-observed.

## Minimal qwen Recheck Procedure

To re-run the current smoke check:

1. Create `C:\temp\claw-code\smoke\qwen\.claw\settings.local.json` with the qwen sample above.
2. Build `rusty-claude-cli`.
3. From `C:\temp\claw-code\smoke\qwen`, run:

```powershell
$env:HOME='C:\Users\mana_'
$env:USERPROFILE='C:\Users\mana_'
& 'C:\temp\claw-code\rust\target\debug\claw.exe' prompt 'smoke check' --dangerously-skip-permissions
```

Expected trace prefix:

```text
[active-model] kind=prompt selected_provider=openai selected_model=qwen/qwen-max retry_count=2 retries_used=0 provider_intent=qwen
```

## Current Conclusion

The active-model initial pass is live on the CLI startup paths:

- `prompt` now resolves through the active-model default path
- `repl` resolves through the same active model
- qwen config produces traceable selected-provider / selected-model output
- gemini fails clearly as unsupported

For the OpenRouter-aligned follow-up, the recommended interpretation is:

- set `active_provider=openrouter`
- set `active_model` to the OpenRouter model ID you want to send
- expect `provider_intent=openrouter` in traces
- expect `selected_provider=openai` until a distinct OpenRouter provider label is introduced in the provider-routing layer

The remaining gap for a fuller smoke check is not config resolution itself, but runtime verification of:

- successful streamed turns
- retry consumption with `retries_used > 0`
- live `tools` / sub-agent trace emission
