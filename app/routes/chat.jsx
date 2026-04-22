/**
 * Chat API Route
 * Handles chat interactions with Claude API and tools
 */
import MCPClient from "../mcp-client";
import {
  saveMessage,
  getConversationHistory,
  updateMessageContent,
  storeCustomerAccountUrls,
  getCustomerAccountUrls as getCustomerAccountUrlsFromDb,
} from "../db.server";
import AppConfig from "../services/config.server";
import { createSseStream } from "../services/streaming.server";
import { createClaudeService } from "../services/claude.server";
import { createToolService } from "../services/tool.server";
import { extractProductsFromAssistantContent, enrichProductData, isPriceBad } from "../utils/product-card-utils";

// Configuration: Set to true to send tool_use events for debugging UI
const SEND_TOOL_USE_EVENTS = false;

/**
 * Rract Router loader function for handling GET requests
 */
export async function loader({ request }) {
  // Handle OPTIONS requests (CORS preflight)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }

  const url = new URL(request.url);

  // Handle history fetch requests - matches /chat?history=true&conversation_id=XYZ
  if (
    url.searchParams.has("history") &&
    url.searchParams.has("conversation_id")
  ) {
    return handleHistoryRequest(
      request,
      url.searchParams.get("conversation_id"),
    );
  }

  // Handle SSE requests
  if (
    !url.searchParams.has("history") &&
    request.headers.get("Accept") === "text/event-stream"
  ) {
    return handleChatRequest(request);
  }

  // API-only: reject all other requests
  return new Response(
    JSON.stringify({ error: AppConfig.errorMessages.apiUnsupported }),
    { status: 400, headers: getCorsHeaders(request) },
  );
}

/**
 * React Router action function for handling POST requests
 */
export async function action({ request }) {
  return handleChatRequest(request);
}

/**
 * Handle history fetch requests
 * @param {Request} request - The request object
 * @param {string} conversationId - The conversation ID
 * @returns {Response} JSON response with chat history
 */
async function handleHistoryRequest(request, conversationId) {
  const messages = await getConversationHistory(conversationId);

  return new Response(JSON.stringify({ messages }), {
    headers: getCorsHeaders(request),
  });
}

/**
 * Handle chat requests (both GET and POST)
 * @param {Request} request - The request object
 * @returns {Response} Server-sent events stream
 */
async function handleChatRequest(request) {
  try {
    // Get message data from request body
    const body = await request.json();
    const userMessage = body.message;

    // Validate required message
    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: AppConfig.errorMessages.missingMessage }),
        { status: 400, headers: getSseHeaders(request) },
      );
    }

    // Generate or use existing conversation ID
    const conversationId = body.conversation_id || Date.now().toString();
    const promptType = body.prompt_type || AppConfig.api.defaultPromptType;
    const pageContext = normalizePageContext(body.page_context);

    // Create a stream for the response
    const responseStream = createSseStream(async (stream) => {
      await handleChatSession({
        request,
        userMessage,
        conversationId,
        promptType,
        pageContext,
        stream,
      });
    });

    return new Response(responseStream, {
      headers: getSseHeaders(request),
    });
  } catch (error) {
    console.error("Error in chat request handler:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: getCorsHeaders(request),
    });
  }
}

/**
 * Truncates the content field of a tool_result block to avoid context overflow.
 * Keeps the tool_use_id intact so the conversation structure stays valid.
 */
function truncateToolResultBlock(block) {
  const max = AppConfig.tools.maxToolResultHistoryChars;
  if (typeof block.content === "string") {
    if (block.content.length <= max) return block;
    return { ...block, content: block.content.slice(0, max) + "\n...[truncated for context]" };
  }
  if (Array.isArray(block.content)) {
    const joined = block.content.map((c) => (typeof c === "string" ? c : c?.text ?? "")).join("");
    if (joined.length <= max) return block;
    return { ...block, content: joined.slice(0, max) + "\n...[truncated for context]" };
  }
  return block;
}

/**
 * Handle a complete chat session
 * @param {Object} params - Session parameters
 * @param {Request} params.request - The request object
 * @param {string} params.userMessage - The user's message
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.promptType - The prompt type
 * @param {Object} params.stream - Stream manager for sending responses
 */
async function handleChatSession({
  request,
  userMessage,
  conversationId,
  promptType,
  pageContext,
  stream,
}) {
  // Initialize services
  const claudeService = createClaudeService();
  const toolService = createToolService();

  // Initialize MCP client
  const shopId = request.headers.get("X-Shopify-Shop-Id");
  const shopDomain = request.headers.get("Origin");
  const { mcpApiUrl } = await getCustomerAccountUrls(
    shopDomain,
    conversationId,
  );

  const mcpClient = new MCPClient(
    shopDomain,
    conversationId,
    shopId,
    mcpApiUrl,
  );

  // Send conversation ID to client
  stream.sendMessage({ type: "id", conversation_id: conversationId });

    // Connect to MCP servers and get available tools
    let storefrontMcpTools = [],
      customerMcpTools = [];

    try {
      storefrontMcpTools = await mcpClient.connectToStorefrontServer();
      customerMcpTools = await mcpClient.connectToCustomerServer();

      console.log(`Connected to MCP with ${storefrontMcpTools.length} tools`);
      console.log(
        `Connected to customer MCP with ${customerMcpTools.length} tools`,
      );
    } catch (error) {
      console.warn(
        "Failed to connect to MCP servers, continuing without tools:",
        error.message,
      );
    }

    // Prepare conversation state
    let conversationHistory = [];
    let productsToDisplay = [];
    let assistantFallbackProductMessages = [];
    // Synchronously collected from onMessage — no race condition with stream closing
    let fallbackProductsToDisplay = [];

    // Save user message to the database
    await saveMessage(conversationId, "user", userMessage);

    // Fetch all messages from the database for this conversation
    const dbMessages = await getConversationHistory(conversationId);

    // Format messages for Claude API
    const processedMessages = [];
    dbMessages.forEach((dbMessage) => {
      let content;
      try {
        content = JSON.parse(dbMessage.content);
      } catch (e) {
        content = dbMessage.content;
      }

      // 1. Filter out product_results blocks and truncate large tool_result content
      if (Array.isArray(content)) {
        content = content
          .filter((block) => block.type !== "product_results")
          .map((block) => {
            if (block.type !== "tool_result") return block;
            return truncateToolResultBlock(block);
          });
        // If message becomes empty after filtering, don't add it
        if (content.length === 0) return;
      }

      // 2. Handle role alternation and merging
      const lastMessage = processedMessages[processedMessages.length - 1];
      if (lastMessage && lastMessage.role === dbMessage.role) {
        // Merge consecutive messages with the same role
        if (Array.isArray(lastMessage.content) && Array.isArray(content)) {
          lastMessage.content = [...lastMessage.content, ...content];
        } else if (
          (typeof lastMessage.content === "string" || typeof lastMessage.content === "number") &&
          (typeof content === "string" || typeof content === "number")
        ) {
          lastMessage.content = String(lastMessage.content) + "\n" + String(content);
        } else {
          // Mixed types: convert to array of blocks
          const lastContent = Array.isArray(lastMessage.content)
            ? lastMessage.content
            : [{ type: "text", text: String(lastMessage.content) }];
          const currentContent = Array.isArray(content)
            ? content
            : [{ type: "text", text: String(content) }];
          lastMessage.content = [...lastContent, ...currentContent];
        }
      } else {
        processedMessages.push({
          role: dbMessage.role,
          content: Array.isArray(content) ? content : String(content),
        });
      }
    });

    // Claude requires the first message to be from 'user'
    if (processedMessages.length > 0 && processedMessages[0].role !== "user") {
      processedMessages.shift();
    }

    conversationHistory = processedMessages;

    // Execute the conversation stream
    let finalMessage = { role: "user", content: userMessage };

    while (finalMessage.stop_reason !== "end_turn") {
      finalMessage = await claudeService.streamConversation(
        {
          messages: conversationHistory,
          promptType,
          pageContext,
          tools: mcpClient.tools,
        },
        {
          // Handle text chunks
          onText: (textDelta) => {
            stream.sendMessage({
              type: "chunk",
              chunk: textDelta,
            });
          },

          // Handle complete messages
          onMessage: async (message) => {
            const extractedProducts =
              message.role === "assistant"
                ? extractProductsFromAssistantContent(message.content)
                : [];

            conversationHistory.push({
              role: message.role,
              content: message.content,
            });

            saveMessage(
              conversationId,
              message.role,
              JSON.stringify(message.content),
            )
              .then(async (savedMessage) => {
                if (extractedProducts.length === 0) return;

                const contentBlocks = Array.isArray(message.content)
                  ? message.content
                  : [
                      {
                        type: "text",
                        text: String(message.content),
                      },
                    ];

                assistantFallbackProductMessages.push({
                  messageId: savedMessage.id,
                  contentBlocks,
                  products: extractedProducts,
                });
              })
              .catch((error) => {
                console.error("Error saving message to database:", error);
              });

            // Send a completion message
            stream.sendMessage({ type: "message_complete" });

            // Collect fallback products synchronously — enrichment and sending
            // happens after end_turn so the stream is guaranteed to still be open
            if (extractedProducts.length > 0) {
              fallbackProductsToDisplay.push(...extractedProducts);
            }
          },

          // Handle tool use requests
          onToolUse: async (content) => {
            const toolName = content.name;
            const toolArgs = content.input;
            const toolUseId = content.id;

            if (SEND_TOOL_USE_EVENTS) {
              const toolUseMessage = `Calling tool: ${toolName} with arguments: ${JSON.stringify(toolArgs)}`;

              stream.sendMessage({
                type: "tool_use",
                tool_use_message: toolUseMessage,
              });
            }

            // Call the tool
            const toolUseResponse = await mcpClient.callTool(
              toolName,
              toolArgs,
            );

            // Handle tool response based on success/error
            if (toolUseResponse.error) {
              await toolService.handleToolError(
                toolUseResponse,
                toolName,
                toolUseId,
                conversationHistory,
                stream.sendMessage,
                conversationId,
              );
            } else {
              await toolService.handleToolSuccess(
                toolUseResponse,
                toolName,
                toolUseId,
                conversationHistory,
                productsToDisplay,
                conversationId,
                toolArgs,
                shopDomain,
              );
            }

            // Signal new message to client
            stream.sendMessage({ type: "new_message" });
          },

          // Handle content block completion
          onContentBlock: (contentBlock) => {
            if (contentBlock.type === "text") {
              stream.sendMessage({
                type: "content_block_complete",
                content_block: contentBlock,
              });
            }
          },
        },
      );
  }

  // Signal end of turn
  stream.sendMessage({ type: "end_turn" });

  if (fallbackProductsToDisplay.length > 0) {
    // Claude explicitly named specific products — enrich those and show them.
    // This is more relevant than the generic top-3 from the tool result.
    const enriched = await Promise.all(
      fallbackProductsToDisplay.map((p) =>
        isPriceBad(p.price) || p.image_url === ""
          ? enrichProductData(p, shopDomain)
          : p,
      ),
    );
    stream.sendMessage({ type: "product_results", products: enriched });

    // Persist: update the assistant message(s) that mentioned the products
    if (assistantFallbackProductMessages.length > 0) {
      await Promise.all(
        assistantFallbackProductMessages.map(({ messageId, contentBlocks }) =>
          updateMessageContent(
            messageId,
            JSON.stringify([...contentBlocks, { type: "product_results", products: enriched }]),
          ),
        ),
      ).catch((error) => {
        console.error("Error updating fallback product messages:", error);
      });
    } else {
      // saveMessage's .then() lost the race — save standalone
      saveMessage(
        conversationId,
        "assistant",
        JSON.stringify([{ type: "product_results", products: enriched }]),
      ).catch((error) => {
        console.error("Error saving fallback product results:", error);
      });
    }
  } else if (productsToDisplay.length > 0) {
    // Claude didn't name a specific product — show generic top tool results
    stream.sendMessage({ type: "product_results", products: productsToDisplay });
    saveMessage(
      conversationId,
      "assistant",
      JSON.stringify([{ type: "product_results", products: productsToDisplay }]),
    ).catch((error) => {
      console.error("Error saving product results to database:", error);
    });
  }

}

/**
 * Get the customer MCP API URL for a shop
 * @param {string} shopDomain - The shop domain
 * @param {string} conversationId - The conversation ID
 * @returns {string} The customer MCP API URL
 */
async function getCustomerAccountUrls(shopDomain, conversationId) {
  try {
    // Check if the customer account URL exists in the DB
    const existingUrls = await getCustomerAccountUrlsFromDb(conversationId);

    // If URL exists, return early with the MCP API URL
    if (existingUrls) return existingUrls;

    // If not, query for it from the Shopify API
    const { hostname } = new URL(shopDomain);

    const urls = await Promise.all([
      fetch(`https://${hostname}/.well-known/customer-account-api`).then(
        (res) => res.json(),
      ),
      fetch(`https://${hostname}/.well-known/openid-configuration`).then(
        (res) => res.json(),
      ),
    ]).then(async ([mcpResponse, openidResponse]) => {
      const response = {
        mcpApiUrl: mcpResponse.mcp_api,
        authorizationUrl: openidResponse.authorization_endpoint,
        tokenUrl: openidResponse.token_endpoint,
      };

      await storeCustomerAccountUrls({
        conversationId,
        mcpApiUrl: mcpResponse.mcp_api,
        authorizationUrl: openidResponse.authorization_endpoint,
        tokenUrl: openidResponse.token_endpoint,
      });

      return response;
    });

    return urls;
  } catch (error) {
    console.error("Error getting customer MCP API URL:", error);
    return null;
  }
}

/**
 * Gets CORS headers for the response
 * @param {Request} request - The request object
 * @returns {Object} CORS headers object
 */
function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  const requestHeaders =
    request.headers.get("Access-Control-Request-Headers") ||
    "Content-Type, Accept";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": requestHeaders,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
}

/**
 * Get SSE headers for the response
 * @param {Request} request - The request object
 * @returns {Object} SSE headers object
 */
function getSseHeaders(request) {
  const origin = request.headers.get("Origin") || "*";

  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
    "Access-Control-Allow-Headers":
      "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
  };
}

function normalizePageContext(pageContext) {
  if (!pageContext || typeof pageContext !== "object") return null;
  const url = typeof pageContext.url === "string" ? pageContext.url.trim() : "";
  const pathname = typeof pageContext.pathname === "string" ? pageContext.pathname.trim() : "";
  const title = typeof pageContext.title === "string" ? pageContext.title.trim() : "";
  const pageType = typeof pageContext.page_type === "string" ? pageContext.page_type.trim() : "";
  if (!url && !pathname && !title && !pageType) return null;
  return {
    ...(url ? { url } : {}),
    ...(pathname ? { pathname } : {}),
    ...(title ? { title } : {}),
    ...(pageType ? { page_type: pageType } : {}),
  };
}

