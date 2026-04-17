/**
 * Claude Service
 * Manages interactions with the Claude API
 */
import { Anthropic } from "@anthropic-ai/sdk";
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";
import { ringSizingGuide } from "../prompts/knowledge/ring-sizing-standard";
import { faqKnowledgeBase } from "../prompts/knowledge/faq";

const ringSizingVariants = {
  standard: ringSizingGuide,
};

/**
 * Creates a Claude service instance
 * @param {string} apiKey - Claude API key
 * @returns {Object} Claude service with methods for interacting with Claude API
 */
export function createClaudeService(apiKey = process.env.CLAUDE_API_KEY) {
  console.log('[claude.server] API key present:', !!apiKey, 'length:', apiKey?.length ?? 0);

  // Initialize Claude client
  const anthropic = new Anthropic({ apiKey });

  /**
   * Streams a conversation with Claude
   * @param {Object} params - Stream parameters
   * @param {Array} params.messages - Conversation history
   * @param {string} params.promptType - The type of system prompt to use
   * @param {Array} params.tools - Available tools for Claude
   * @param {Object} streamHandlers - Stream event handlers
   * @param {Function} streamHandlers.onText - Handles text chunks
   * @param {Function} streamHandlers.onMessage - Handles complete messages
   * @param {Function} streamHandlers.onToolUse - Handles tool use requests
   * @returns {Promise<Object>} The final message
   */
  const streamConversation = async ({
    messages,
    promptType = AppConfig.api.defaultPromptType,
    pageContext,
    tools
  }, streamHandlers) => {
    // Get system prompt from configuration or use default
    const systemInstruction = getSystemPrompt(promptType, pageContext);

    // Create stream
    const stream = await anthropic.messages.stream({
      model: AppConfig.api.defaultModel,
      max_tokens: AppConfig.api.maxTokens,
      system: systemInstruction,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      cache_control: { type: "ephemeral" }
    });

    // Set up event handlers
    if (streamHandlers.onText) {
      stream.on('text', streamHandlers.onText);
    }

    if (streamHandlers.onMessage) {
      stream.on('message', streamHandlers.onMessage);
    }

    if (streamHandlers.onContentBlock) {
      stream.on('contentBlock', streamHandlers.onContentBlock);
    }

    // Wait for final message
    const finalMessage = await stream.finalMessage();
    console.log('[claude] cache usage:', JSON.stringify(finalMessage.usage));

    // Process tool use requests
    if (streamHandlers.onToolUse && finalMessage.content) {
      for (const content of finalMessage.content) {
        if (content.type === "tool_use") {
          await streamHandlers.onToolUse(content);
        }
      }
    }

    return finalMessage;
  };

  /**
   * Gets the system prompt content for a given prompt type
   * @param {string} promptType - The prompt type to retrieve
   * @returns {string} The system prompt content
   */
  const getSystemPrompt = (promptType, pageContext) => {
    const config = systemPrompts.systemPrompts[promptType] ||
      systemPrompts.systemPrompts[AppConfig.api.defaultPromptType];

    const variables = {
      persona: config.persona,
      behavioralRules: config.behavioralRules ?? "",
      examples: config.examples ?? "",
      formattingGuidelines: config.formattingGuidelines,
      ringSizingGuide: ringSizingVariants.standard,
      faqKnowledgeBase,
    };

    const text = config.template.replace(/\$\{(\w+)\}/g, (_, key) => variables[key] ?? "");

    const systemPrompt = [
      {
        type: "text",
        text,
        cache_control: { type: "ephemeral" }
      }
    ];

    if (pageContext) {
      systemPrompt.push({
        type: "text",
        text: `<page_context>
The customer is currently viewing this storefront page.
- URL: ${pageContext.url || ""}
- Pathname: ${pageContext.pathname || ""}
- Title: ${pageContext.title || ""}
- Page type: ${pageContext.page_type || ""}

Use this context to resolve questions about what the customer is looking at. If the page context is sufficient to answer, do not ask what page they are on; answer directly and stay grounded in the current page.
</page_context>`,
      });
    }

    return systemPrompt;
  };

  return {
    streamConversation,
    getSystemPrompt
  };
}

export default {
  createClaudeService
};
