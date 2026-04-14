import type { GitReadResult, WebResult } from "../../../../shared/contracts/index.js";

import { shouldTriggerWebSearch, performWebSearch } from "./web-search-service.js";
import { shouldTriggerGitRead, readRepoContext } from "./git-read-service.js";

export type ToolContextResult =
  | { kind: "web"; items: WebResult[] }
  | { kind: "git"; items: GitReadResult[] };

export type CollectToolContextOptions = {
  webApiKey?: string;
  webMaxResults?: number;
};

/**
 * Phase 9A: Tool Abstraction (v1, minimal)
 *
 * Collects read-only external context tool outputs behind a shared shape.
 * This intentionally preserves existing behavior:
 * - tools run only on explicit trigger
 * - result sizes remain bounded
 * - injection order is handled in the adapter (memory -> web -> git -> attachments -> role -> user)
 */
export async function collectToolContext(
  prompt: string,
  options: CollectToolContextOptions = {},
): Promise<ToolContextResult[]> {
  const { webApiKey, webMaxResults = 3 } = options;

  const results: ToolContextResult[] = [];

  if (shouldTriggerWebSearch(prompt)) {
    const items = await performWebSearch(prompt, {
      maxResults: webMaxResults,
      apiKey: webApiKey,
    });
    results.push({ kind: "web", items });
  }

  if (shouldTriggerGitRead(prompt)) {
    const items = await readRepoContext(prompt);
    results.push({ kind: "git", items });
  }

  return results;
}

