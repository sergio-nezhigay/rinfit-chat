/**
 * Configuration Service
 * Centralizes all configuration values for the chat service
 */

export const AppConfig = {
  // API Configuration
  api: {
    defaultModel: 'claude-haiku-4-5-20251001',
    maxTokens: 2000,
    defaultPromptType: 'standardAssistant',
  },

  // Error Message Templates
  errorMessages: {
    missingMessage: "Message is required",
    apiUnsupported: "This endpoint only supports server-sent events (SSE) requests or history requests.",
    authFailed: "Authentication failed with Claude API",
    apiKeyError: "Please check your API key in environment variables",
    rateLimitExceeded: "Rate limit exceeded",
    rateLimitDetails: "Please try again later",
    genericError: "Failed to get response from Claude"
  },

  // Tool Configuration
  tools: {
    productSearchName: "search_catalog",
    maxProductsToDisplay: 3,
    // Max chars of tool_result content sent to Claude (both current turn and history replay).
    // Prevents context overflow from large MCP product search responses (~835KB raw).
    // 20000 chars ≈ 5000 tokens — enough for Claude to see ~5-10 products.
    maxToolResultHistoryChars: 20000,
  }
};

export default AppConfig;
