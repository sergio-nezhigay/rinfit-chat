/**
 * Tool Service
 * Manages tool execution and processing
 */
import { saveMessage } from "../db.server";
import AppConfig from "./config.server";
import {
  collectRawProducts,
  enrichProductData,
  extractProductsFromAssistantContent,
  isPriceBad,
  normalizeProductData,
} from "../utils/product-card-utils";

const CART_MUTATION_TOOL_NAMES = new Set([
  "add_to_cart", "clear_cart", "empty_cart",
  "remove_cart", "remove_from_cart", "set_cart", "update_cart",
]);

const isCartMutationTool = (toolName) => {
  const n = (toolName || "").toLowerCase();
  if (!n || n === "get_cart") return false;
  if (CART_MUTATION_TOOL_NAMES.has(n)) return true;
  return n.includes("cart") && !n.includes("get_cart");
};

/**
 * Creates a tool service instance
 * @returns {Object} Tool service with methods for managing tools
 */
export function createToolService() {
  const MAX_TOOL_CONTENT_CHARS = AppConfig.tools.maxToolResultHistoryChars;

  function truncateToolContent(toolUseId, content) {
    if (typeof content === 'string') {
      if (content.length <= MAX_TOOL_CONTENT_CHARS) return content;
      return content.slice(0, MAX_TOOL_CONTENT_CHARS) + '\n...[truncated]';
    }
    if (Array.isArray(content)) {
      const joined = content.map(c => (typeof c === 'string' ? c : c?.text ?? '')).join('');
      if (joined.length <= MAX_TOOL_CONTENT_CHARS) return content;
      return joined.slice(0, MAX_TOOL_CONTENT_CHARS) + '\n...[truncated]';
    }
    return content;
  }

  /**
   * Handles a tool error response
   * @param {Object} toolUseResponse - The error response from the tool
   * @param {string} toolName - The name of the tool
   * @param {string} toolUseId - The ID of the tool use request
   * @param {Array} conversationHistory - The conversation history
   * @param {Function} sendMessage - Function to send messages to the client
   * @param {string} conversationId - The conversation ID
   */
  const handleToolError = async (toolUseResponse, toolName, toolUseId, conversationHistory, sendMessage, conversationId) => {
    if (toolUseResponse.error.type === "auth_required") {
      console.log("Auth required for tool:", toolName);
      await addToolResultToHistory(conversationHistory, toolUseId, toolUseResponse.error.data, conversationId);
      sendMessage({ type: 'auth_required' });
    } else {
      console.log("Tool use error", toolUseResponse.error);
      await addToolResultToHistory(conversationHistory, toolUseId, toolUseResponse.error.data, conversationId);
    }
  };

  /**
   * Handles a successful tool response
   * @param {Object} toolUseResponse - The response from the tool
   * @param {string} toolName - The name of the tool
   * @param {string} toolUseId - The ID of the tool use request
   * @param {Array} conversationHistory - The conversation history
   * @param {Array} productsToDisplay - Array to add product results to
   * @param {string} conversationId - The conversation ID
   */
  const handleToolSuccess = async (toolUseResponse, toolName, toolUseId, conversationHistory, productsToDisplay, conversationId, toolArgs, shopDomain) => {
    // Check if this is a product search result
    if (toolName === AppConfig.tools.productSearchName) {
      productsToDisplay.push(...await processProductSearchResult(toolUseResponse, toolArgs, shopDomain));
    }

    addToolResultToHistory(conversationHistory, toolUseId, toolUseResponse.content, conversationId);

    return isCartMutationTool(toolName);
  };

  /**
   * Processes product search results
   * @param {Object} toolUseResponse - The response from the tool
   * @returns {Array} Processed product data
   */
  const processProductSearchResult = async (toolUseResponse, toolArgs, shopDomain) => {
    try {
      console.log("Processing product search result");
      let products = [];

      // Extract variant filters (e.g. [{ name: "Size", value: "14" }]) from MCP call args
      const variantFilters = (toolArgs?.filters || [])
        .filter((f) => f.variantOption)
        .map((f) => f.variantOption);

      const rawProducts = collectRawProducts(toolUseResponse);

      if (rawProducts.length > 0) {
        products = filterAvailableProducts(rawProducts, variantFilters)
          .slice(0, AppConfig.tools.maxProductsToDisplay)
          .map(formatProductData);

        console.log(`Found ${products.length} products to display (after availability filter)`);

        if (shopDomain) {
          products = await Promise.all(
            products.map((p) =>
              isPriceBad(p.price) || p.image_url === ""
                ? enrichProductData(p, shopDomain)
                : p,
            ),
          );
        }
      }

      return products;
    } catch (error) {
      console.error("Error processing product search results:", error);
      return [];
    }
  };

  /**
   * Filters out products where no variants are available for sale
   * @param {Array} products - Raw products array from MCP response
   * @returns {Array} Products with at least one available variant
   */
  const filterAvailableProducts = (products, variantFilters = []) => {
    if (variantFilters.length > 0) {
      console.log(`[availability-filter] checking ${products.length} products with variant filters:`, JSON.stringify(variantFilters));
    } else {
      console.log(`[availability-filter] checking ${products.length} products (no variant filters)`);
    }

    return products.filter((product) => {
      const name = product.title || product.product_id || '(unknown)';

      // Schema B: availabilityMatrix present
      if (Array.isArray(product.availabilityMatrix)) {
        if (product.availabilityMatrix.length === 0) {
          console.log(`[availability-filter] product="${name}" keep=false (empty matrix)`);
          return false;
        }

        if (typeof product.availabilityMatrix[0] === 'string') {
          // String schema: each entry is an available combo like "Black/Size 14"
          // If variant filters were passed, require at least one matrix entry to match
          // every requested filter value (e.g. both "14" and "Black" must appear).
          if (variantFilters.length > 0) {
            const keep = variantFilters.every((filter) =>
              product.availabilityMatrix.some((entry) =>
                entry.toLowerCase().includes(filter.value.toLowerCase())
              )
            );
            const matchedEntries = keep
              ? product.availabilityMatrix.filter((entry) =>
                  variantFilters.every((f) => entry.toLowerCase().includes(f.value.toLowerCase()))
                )
              : [];
            console.log(
              `[availability-filter] product="${name}" keep=${keep}`,
              keep ? `matched=${JSON.stringify(matchedEntries.slice(0, 3))}` : `no matrix entry matches filters`
            );
            return keep;
          }
          // No filters: non-empty matrix means product has available variants
          console.log(`[availability-filter] product="${name}" keep=true (non-empty matrix, no filters)`);
          return true;
        }

        // Object schema: check explicit boolean flag
        const keep = product.availabilityMatrix.some(
          (entry) => entry.available === true || entry.availableForSale === true
        );
        console.log(`[availability-filter] product="${name}" keep=${keep} (object matrix)`);
        return keep;
      }

      // Schema A: variants array present — keep if any variant is available for sale
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        const keep = product.variants.some((v) => v.availableForSale !== false);
        console.log(`[availability-filter] product="${name}" keep=${keep} (variants schema)`);
        return keep;
      }

      // No availability data — keep the product (benefit of the doubt)
      console.log(`[availability-filter] product="${name}" keep=true (no availability data)`);
      return true;
    });
  };

  /**
   * Formats a product data object
   * @param {Object} product - Raw product data
   * @returns {Object} Formatted product data
   */
  const formatProductData = (product) => {
    return normalizeProductData(product);
  };

  /**
   * Adds a tool result to the conversation history
   * @param {Array} conversationHistory - The conversation history
   * @param {string} toolUseId - The ID of the tool use request
   * @param {string} content - The content of the tool result
   * @param {string} conversationId - The conversation ID
   */
  const addToolResultToHistory = async (conversationHistory, toolUseId, content, conversationId) => {
    const truncatedContent = truncateToolContent(toolUseId, content);

    const toolResultMessage = {
      role: 'user',
      content: [{
        type: "tool_result",
        tool_use_id: toolUseId,
        content: truncatedContent
      }]
    };

    // Add to in-memory history
    conversationHistory.push(toolResultMessage);

    // Save to database with special format to indicate tool result
    if (conversationId) {
      try {
        await saveMessage(conversationId, 'user', JSON.stringify(toolResultMessage.content));
      } catch (error) {
        console.error('Error saving tool result to database:', error);
      }
    }
  };

  return {
    handleToolError,
    handleToolSuccess,
    processProductSearchResult,
    addToolResultToHistory
  };
}

export default {
  createToolService
};

export {
  extractProductsFromAssistantContent,
  normalizeProductData,
};
