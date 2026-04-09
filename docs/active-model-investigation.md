# Active Model Investigation

## Scope

- Target: canonical Rust implementation under `rust/`
- Goal: identify the smallest insertion points for a single active-model scheme
- Non-goals for this pass:
  - broad implementation
  - role-based model routing
  - agent loop rewrites
  - public-contract churn

## Executive Summary

- Runtime config loading is already centralized in `rust/crates/runtime/src/config.rs`.
- CLI model resolution is split today:
  - top-level REPL/one-shot model defaulting lives in `rust/crates/rusty-claude-cli/src/main.rs`
  - sub-agent execution and provider fallback chaining live in `rust/crates/tools/src/lib.rs`
- `qwen` is already supported through the OpenAI-compatible/DashScope path.
- `openrouter` can be accepted as active-model provider intent without adding a new provider implementation, because execution still rides the existing OpenAI-compatible client path.
- `gemini` is not currently wired in the Rust provider layer.
- The smallest viable design is:
  - keep existing `model` behavior for backward compatibility
  - add a new config view that resolves `active_model` first, then falls back to `model`
  - keep provider fallback logic near `ProviderRuntimeClient`
  - make sub-agents default to the same resolved active model when no explicit model is supplied

## 1. Config Loading Entry Points

### Primary config loader

- `rust/crates/runtime/src/config.rs:215`
  - `ConfigLoader` is the canonical loader.
- `rust/crates/runtime/src/config.rs:254`
  - user config: `~/.claw/settings.json`
- `rust/crates/runtime/src/config.rs:262`
  - project config: `.claw/settings.json`
- `rust/crates/runtime/src/config.rs:266`
  - local config: `.claw/settings.local.json`
- `rust/crates/runtime/src/config.rs:37`
  - `RuntimeConfig`
- `rust/crates/runtime/src/config.rs:56`
  - `RuntimeFeatureConfig`

### Parsing of current model-related fields

- `rust/crates/runtime/src/config.rs:736`
  - `parse_optional_model`
- `rust/crates/runtime/src/config.rs:890`
  - `parse_optional_provider_fallbacks`
- `rust/crates/runtime/src/config.rs:384`
  - `RuntimeConfig::model()`
- `rust/crates/runtime/src/config.rs:409`
  - `RuntimeConfig::provider_fallbacks()`
- `rust/crates/runtime/src/config.rs:453`
  - `RuntimeFeatureConfig::model()`
- `rust/crates/runtime/src/config.rs:478`
  - `RuntimeFeatureConfig::provider_fallbacks()`

### Config validation surface

- `rust/crates/runtime/src/config_validate.rs:149`
  - top-level `model` is validated here
- `rust/crates/runtime/src/config_validate.rs:176`
  - `providerFallbacks` is already an accepted top-level object

### Prompt loading also consumes merged config

- `rust/crates/runtime/src/prompt.rs:432`
  - `load_system_prompt`
- `rust/crates/runtime/src/prompt.rs:448`
  - runtime config is rendered into the system prompt via `config.as_json()`

This is useful because adding new config keys does not require extra prompt plumbing if they remain in the merged JSON.

## 2. Where Model Name / Provider Are Decided

### REPL and one-shot CLI default model resolution

- `rust/crates/rusty-claude-cli/src/main.rs:873`
  - `resolve_model_alias_with_config`
- `rust/crates/rusty-claude-cli/src/main.rs:962`
  - `config_model_for_current_dir`
- `rust/crates/rusty-claude-cli/src/main.rs:968`
  - `resolve_repl_model`

Current behavior:

- explicit `--model` wins
- otherwise `ANTHROPIC_MODEL` wins
- otherwise config `model` wins
- otherwise CLI default remains

### Interactive model switching

- `rust/crates/rusty-claude-cli/src/main.rs:3795`
  - `set_model`
- `rust/crates/rusty-claude-cli/src/main.rs:2244`
  - `/model` report

This is session-local runtime switching and should stay intact.

### Main provider dispatch

- `rust/crates/rusty-claude-cli/src/main.rs:6363`
  - `AnthropicRuntimeClient` (historical name, now multi-provider)
- `rust/crates/rusty-claude-cli/src/main.rs:6376`
  - constructor decides backend
- `rust/crates/rusty-claude-cli/src/main.rs:6469`
  - request streaming path

### Provider kind / model prefix routing

- `rust/crates/api/src/providers/mod.rs:32`
  - `ProviderKind` currently has `Anthropic`, `Xai`, `OpenAi`
- `rust/crates/api/src/providers/mod.rs:128`
  - `resolve_model_alias`
- `rust/crates/api/src/providers/mod.rs:154`
  - `metadata_for_model`
- `rust/crates/api/src/providers/mod.rs:189`
  - `qwen/` and `qwen-` route to the DashScope path
- `rust/crates/api/src/providers/mod.rs:201`
  - `detect_provider_kind`
- `rust/crates/api/src/client.rs:21`
  - `ProviderClient::from_model_with_anthropic_auth`

Observations:

- `qwen` is already first-class in routing.
- `gemini` does not appear in the current provider enum or metadata routing.
- Supporting `gemini` is not just a config change; it requires provider-layer work in `api`.

## 3. classify / plan / retry Equivalent Assembly Points

## classify

There is no obvious LLM-based "classification prompt" in the Rust implementation right now.

Closest current classify-equivalent logic:

- `rust/crates/commands/src/lib.rs:2325`
  - `classify_skills_slash_command`
  - local command classification only; no model dispatch
- `rust/crates/tools/src/lib.rs:3712`
  - `classify_lane_failure`
  - error/failure classification only; no model dispatch

Conclusion:

- there is no separate classify-model path to merge yet
- if future classify work is added, it should resolve through the same active-model accessor rather than introducing a parallel selector

## plan

Current plan-related surfaces are mostly command/report plumbing, not separate model execution:

- `rust/crates/rusty-claude-cli/src/main.rs:4305`
  - `run_ultraplan`
- `rust/crates/rusty-claude-cli/src/main.rs:5295`
  - `format_ultraplan_report`
- `rust/crates/rusty-claude-cli/src/main.rs:3698`
  - `/plan` is registered but currently prints `Command registered but not yet implemented.`

The real model-executing plan-like path today is the sub-agent runtime:

- `rust/crates/tools/src/lib.rs:3290`
  - `execute_agent_with_spawn`
- `rust/crates/tools/src/lib.rs:3406`
  - `build_agent_runtime`
- `rust/crates/tools/src/lib.rs:3428`
  - `build_agent_system_prompt`
- `rust/crates/tools/src/lib.rs:3443`
  - `resolve_agent_model`

Conclusion:

- if "plan should use the same active model" is required, the meaningful insertion point is sub-agent model resolution in `tools`, not `/plan` slash output formatting

## retry

There are two retry-like behaviors already:

### Provider fallback / retryable provider errors

- `rust/crates/tools/src/lib.rs:3753`
  - `ProviderRuntimeClient`
- `rust/crates/tools/src/lib.rs:3767`
  - `new_with_fallback_config`
- `rust/crates/tools/src/lib.rs:3796`
  - `build_provider_entry`
- `rust/crates/tools/src/lib.rs:3805`
  - `load_provider_fallback_config`
- `rust/crates/tools/src/lib.rs:3814`
  - `impl ApiClient for ProviderRuntimeClient`

This is the strongest existing insertion point for `fallback_provider`, `fallback_model`, and `retry_count`.

### Post-tool continuation retry

- `rust/crates/rusty-claude-cli/src/main.rs:6469`
  - `AnthropicRuntimeClient::stream`

This includes a one-time post-tool continuation retry for a stall case.

Conclusion:

- "retry uses the same active model" is already mostly true for the main runtime because it retries within the current runtime client
- explicit retry-count configurability would be easiest near provider clients, not in the conversation loop

## 4. Minimal Change Proposal

## Recommended direction

Use a single resolved-model accessor and keep the agent loop untouched.

### Proposed config additions

- `active_provider`
- `active_model`
- `fallback_provider`
- `fallback_model`
- `retry_count`

### Compatibility rule

Preserve existing behavior in this order:

1. explicit CLI `/model` or `--model`
2. `active_model`
3. legacy `model`
4. current built-in default flow

That avoids breaking `USAGE.md`, which currently teaches `--model ...` and config `model`.

## Smallest insertion points

### A. Config parsing and validation

Primary file:

- `rust/crates/runtime/src/config.rs`

Why:

- this is already the single merge point for settings
- it already owns `model` and `providerFallbacks`

Suggested minimal shape:

- add a new parsed config view for active/fallback model selection
- do not remove `model`
- optionally keep `providerFallbacks` working and map it internally onto the new structure when new keys are absent

Concrete low-risk options:

1. Extend `ProviderFallbackConfig`
   - pros: smallest diff in existing fallback consumer
   - cons: name becomes semantically awkward once `active_*` fields are added
2. Add a new `ActiveModelConfig`
   - pros: clearer future shape
   - cons: one extra accessor and small call-site churn

For this repository, option 2 is cleaner, but option 1 is the absolute smallest diff.

Also update:

- `rust/crates/runtime/src/config_validate.rs`
  - allow the five new keys and validate types

### B. Top-level CLI default model resolution

Primary file:

- `rust/crates/rusty-claude-cli/src/main.rs`

Touch points:

- `config_model_for_current_dir`
- `resolve_repl_model`

Minimal adjustment:

- replace direct `config.model()` lookup with `config.active_model_or_legacy_model()`
- keep `ANTHROPIC_MODEL` and explicit `--model` precedence unchanged for now to avoid public-contract churn

Note:

- if you want `active_provider` to influence startup even when the model string is generic, this is where that policy should be resolved for the main REPL runtime

### C. Sub-agent and planning-equivalent runtime

Primary file:

- `rust/crates/tools/src/lib.rs`

Touch points:

- `resolve_agent_model`
- `build_agent_runtime`
- `ProviderRuntimeClient::new_with_fallback_config`
- `load_provider_fallback_config`

Minimal adjustment:

- if `input.model` is absent, sub-agents should resolve from the same active-model config as the main CLI runtime
- fallback chain construction should read:
  - active model
  - fallback model
  - retry count

This is the key place to make classify/plan/retry converge without changing `ConversationRuntime`.

### D. Provider-layer support for gemini

Primary files if actual Gemini support is required:

- `rust/crates/api/src/providers/mod.rs`
- `rust/crates/api/src/client.rs`
- possibly `rust/crates/api/src/providers/openai_compat.rs` or a new provider module

Why:

- current provider enum has no Gemini variant
- current metadata routing has no `gemini` prefix or env/base-url mapping

Minimal conclusion for this investigation:

- qwen support can participate in active-model routing immediately
- gemini support is a separate prerequisite and should be tracked as a follow-up, not folded into the minimal config-only change

## 5. Candidate File List

## Must-change for the minimal active-model design

- `rust/crates/runtime/src/config.rs`
- `rust/crates/runtime/src/config_validate.rs`
- `rust/crates/rusty-claude-cli/src/main.rs`
- `rust/crates/tools/src/lib.rs`

## Maybe-change depending on compatibility/documentation choice

- `USAGE.md`
  - only if you decide to document new keys now
- `rust/README.md`
  - only if you add user-facing examples there too

## Needed only if Gemini provider support is part of the same implementation

- `rust/crates/api/src/providers/mod.rs`
- `rust/crates/api/src/client.rs`
- `rust/crates/api/src/providers/openai_compat.rs` or a new Gemini-specific provider module

## 6. Suggested Minimal Implementation Plan

1. Add config fields and validation only.
2. Add a single accessor that resolves:
   - explicit model if present
   - else `active_model`
   - else legacy `model`
3. Use that accessor in:
   - REPL startup model resolution
   - sub-agent default model resolution
4. Keep provider fallback construction local to `ProviderRuntimeClient`.
5. Add `retry_count` only to provider-client fallback/retry behavior.
6. Do not modify `ConversationRuntime` or the core agent loop.

## Recommended Internal API Shape

One low-churn option would be:

- `RuntimeConfig::active_model() -> Option<&str>`
- `RuntimeConfig::resolved_default_model() -> Option<&str>`
- `RuntimeConfig::active_model_config() -> &...`

Then:

- CLI startup uses `resolved_default_model()`
- sub-agent fallback path uses `active_model_config()`

This keeps the decision surface centralized and avoids duplicating precedence logic in `rusty-claude-cli` and `tools`.

## Risks / Constraints

- `USAGE.md` currently assumes `model` and explicit `--model` flows. Removing or silently redefining them would be contract churn.
- Gemini is not available in the current provider abstraction, so adding `active_provider = "gemini"` without provider-layer work would create a config surface that cannot execute.
- There are currently two model-resolution stacks:
  - main CLI runtime in `rusty-claude-cli`
  - sub-agent runtime in `tools`
  These should be unified behind one accessor, otherwise "single active model" will drift.

## Final Recommendation

For the first implementation pass:

- support `active_model` as the new canonical internal default
- treat legacy `model` as a backward-compatible alias
- keep explicit `--model` and `/model` behavior unchanged
- wire sub-agents to the same resolved active model
- keep fallback/retry logic localized to `ProviderRuntimeClient`
- defer Gemini provider support to a separate provider-layer task

This gives the smallest diff while still meeting the intent of "classify / plan / retry eventually use the same active model."

## Implementation Note

The minimal implementation has now been applied in the following shape:

- `active_provider`, `active_model`, `fallback_provider`, `fallback_model`, and `retry_count` are parsed from top-level config.
- `resolved_model()` in `runtime::config` now centralizes model precedence:
  - `active_model`
  - legacy `model`
- `resolved_model()` is intentionally narrow in scope:
  - it does not decide explicit CLI override precedence
  - it does not perform provider routing
  - it does not decide fallback-chain selection
- `main.rs` REPL startup now reads that centralized resolved model instead of legacy `model` only.
- `tools/src/lib.rs` sub-agent default model resolution also reads the same centralized resolved model.
- `retry_count` is applied in `ProviderRuntimeClient` as same-model retry attempts against the resolved active model before any legacy fallback-chain step.
- `active_provider` is currently a validated and stored declaration of provider intent. In this pass it does not override model-string-based provider routing by itself.
- `openrouter` is now a valid `active_provider` value for the preferred OpenRouter configuration path. This is still provider intent only:
  - use an OpenRouter model ID in `active_model`
  - keep `OPENAI_API_KEY` / `OPENAI_BASE_URL=https://openrouter.ai/api/v1` in the environment
  - expect `selected_provider` logs to remain `openai` while `provider_intent=openrouter`
- `fallback_provider` and `fallback_model` are stored but intentionally unused in the execution flow for now.
- `gemini` is rejected explicitly during config parsing with a `not yet supported in the Rust runtime` error.

Known limitation in this environment:

- full `cargo test` verification is blocked by existing Windows-specific compile issues in unrelated runtime test code and intermittent dependency download failures outside the touched logic.
