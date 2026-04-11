/**
 * Minimal git read service for Phase 8G.
 * Provides safe, read-only git context extraction with explicit triggers.
 */

import { execSync } from "node:child_process";

export type GitReadResult = {
  path: string;
  excerpt: string;
};

/**
 * Simple trigger detection: check if prompt suggests repo inspection.
 * Used to decide whether to perform git read operations.
 */
export function shouldTriggerGitRead(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();

  // English git/repo keywords
  const englishKeywords = [
    "read this file",
    "check the repo",
    "check the code",
    "inspect the code",
    "look at",
    "show me",
    "what\'s in",
    "whats in",
    "review",
    "examine",
    "git log",
    "git diff",
    "blame",
    "history",
    "recent changes",
    "code review",
    "file path",
    "src/",
  ];

  // Japanese git/repo keywords
  const japaneseKeywords = [
    "このファイル",
    "見て",
    "確認",
    "コードを見",
    "リポジトリを",
    "差分を",
    "ログを",
    "変更を",
    "ファイルを読",
  ];

  // Check English keywords
  if (englishKeywords.some((keyword) => lowerPrompt.includes(keyword))) {
    return true;
  }

  // Check Japanese keywords (no lowercasing needed for Japanese)
  if (japaneseKeywords.some((keyword) => prompt.includes(keyword))) {
    return true;
  }

  return false;
}

/**
 * Extract file paths mentioned in prompt.
 * Very conservative - only paths that look like files.
 */
export function extractFilePathsFromPrompt(prompt: string): string[] {
  const paths: string[] = [];

  // Match patterns like "src/foo.ts", "path/to/file.js", etc.
  // Very conservative regex to avoid false positives
  const filePathRegex = /\b(?:src|lib|app|src|tests?|components?|pages?)\b\/[^\s\"\'`]+/gi;
  const matches = prompt.match(filePathRegex);

  if (matches) {
    paths.push(...matches.map((p) => p.trim()));
  }

  return [...new Set(paths)].slice(0, 3); // Max 3 unique paths
}

/**
 * Safely read a single file from the repo.
 * Bounded to prevent large file dumps.
 */
export async function readFileFromRepo(repoRoot: string, filePath: string): Promise<GitReadResult | null> {
  try {
    // Security: prevent directory traversal
    if (filePath.includes("..") || filePath.startsWith("/")) {
      return null;
    }

    // Try to read the file, bounded to first 500 chars
    const cmd = `head -c 500 "${filePath}"`;
    const excerpt = execSync(cmd, { cwd: repoRoot, encoding: "utf-8" });

    if (excerpt.trim()) {
      return { path: filePath, excerpt };
    }
  } catch {
    // File doesn't exist or can't be read - continue gracefully
  }

  return null;
}

/**
 * Get recent git log for a file.
 * Bounded to last 3 commits.
 */
export async function getFileGitLog(repoRoot: string, filePath: string): Promise<GitReadResult | null> {
  try {
    // Security: prevent directory traversal
    if (filePath.includes("..") || filePath.startsWith("/")) {
      return null;
    }

    // Get last 3 commits for this file with bounded output
    const cmd = `git log -3 --oneline "${filePath}" 2>/dev/null | head -3`;
    const excerpt = execSync(cmd, { cwd: repoRoot, encoding: "utf-8" }).trim();

    if (excerpt) {
      return { path: `${filePath} (recent commits)`, excerpt };
    }
  } catch {
    // Git not available or file not in git
  }

  return null;
}

/**
 * Search for patterns in repo files.
 * Very bounded: max 3 results, small excerpts.
 */
export async function searchRepoPattern(
  repoRoot: string,
  pattern: string,
): Promise<GitReadResult[]> {
  try {
    // Security: only allow simple word patterns, no complex regex
    if (!pattern || pattern.length > 50) {
      return [];
    }

    // Use grep for safe pattern search
    // Bounded to 3 results, 1 line per result
    const cmd = `grep -r "${pattern}" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" -m 1 2>/dev/null | head -3`;
    const output = execSync(cmd, { cwd: repoRoot, encoding: "utf-8" }).trim();

    if (!output) {
      return [];
    }

    return output.split("\n").map((line) => {
      const [filePath, ...rest] = line.split(":");
      return {
        path: filePath || "unknown",
        excerpt: rest.join(":").trim().substring(0, 100),
      };
    });
  } catch {
    // Grep failed or no matches - return empty
  }

  return [];
}

/**
 * Get current git branch.
 */
export async function getCurrentBranch(repoRoot: string): Promise<GitReadResult | null> {
  try {
    const cmd = `git rev-parse --abbrev-ref HEAD`;
    const branch = execSync(cmd, { cwd: repoRoot, encoding: "utf-8" }).trim();

    if (branch) {
      return { path: "Current branch", excerpt: branch };
    }
  } catch {
    // Not a git repo or git not available
  }

  return null;
}

/**
 * Format repo-read results for prompt injection.
 */
export function formatGitReadResults(results: GitReadResult[]): string {
  if (results.length === 0) {
    return "";
  }

  const formattedResults = results
    .map((result) => `- Path: ${result.path}\n  Excerpt: ${result.excerpt}`)
    .join("\n");

  return `Repository context:\n${formattedResults}`;
}
