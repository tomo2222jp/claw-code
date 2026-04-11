/**
 * Minimal web search service for Phase 8F.
 * Provides simple search capability with explicit trigger conditions.
 */

export type WebResult = {
  title: string;
  snippet: string;
  url: string;
};

export type WebSearchOptions = {
  maxResults?: number;
  apiKey?: string;
  timeout?: number;
};

/**
 * Simple trigger detection: check if prompt suggests a search is needed.
 * Used to decide whether to perform web search.
 */
export function shouldTriggerWebSearch(prompt: string): boolean {
  // Normalize to lowercase for matching
  const lowerPrompt = prompt.toLowerCase();

  // English search keywords
  const englishKeywords = [
    "search",
    "latest",
    "news",
    "current",
    "today",
    "recent",
    "what\'s new",
    "whats new",
    "find out",
    "look up",
    "web search",
    "google",
    "check online",
  ];

  // Japanese search keywords
  const japaneseKeywords = [
    "検索",
    "探して",
    "調べて",
    "最新",
    "ニュース",
    "今日",
    "最近",
    "オンライン",
    "ウェブで",
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
 * Perform a web search using a configurable API.
 * For MVP, returns empty array if API is not configured.
 * In production, integrate with Serper, Tavily, or equivalent.
 */
export async function performWebSearch(
  query: string,
  options: WebSearchOptions = {},
): Promise<WebResult[]> {
  const { maxResults = 3, apiKey } = options;

  // If no API key is configured, return empty results
  // In production, this would call an actual web search API
  if (!apiKey) {
    // Placeholder: return mock results for demonstration
    // In real implementation, use environment variable or config
    return [];
  }

  try {
    // Example integration point for Serper or Tavily API
    // This is a placeholder showing the expected structure
    const results = await fetchSearchResults(query, apiKey, maxResults);
    return results;
  } catch (error) {
    // Gracefully handle search errors - don't break the run
    console.error("Web search error:", error);
    return [];
  }
}

/**
 * Placeholder for actual API call implementation.
 * Replace with real API integration (Serper, Tavily, etc.)
 */
async function fetchSearchResults(
  query: string,
  apiKey: string,
  maxResults: number,
): Promise<WebResult[]> {
  // This is where actual API integration would go
  // For now, return empty array to show graceful fallback
  return [];
}

/**
 * Format web results for prompt injection.
 */
export function formatWebResults(results: WebResult[]): string {
  if (results.length === 0) {
    return "";
  }

  const formattedResults = results
    .map(
      (result) =>
        `- Title: ${result.title}\n  Snippet: ${result.snippet}\n  URL: ${result.url}`,
    )
    .join("\n");

  return `Web search results:\n${formattedResults}`;
}
