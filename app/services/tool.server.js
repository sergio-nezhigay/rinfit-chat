/**
 * Tool Service
 * Manages tool execution and processing
 */
import { saveMessage } from "../db.server";
import AppConfig from "./config.server";

/**
 * Creates a tool service instance
 * @returns {Object} Tool service with methods for managing tools
 */
export function createToolService() {
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
  const handleToolSuccess = async (toolUseResponse, toolName, toolUseId, conversationHistory, productsToDisplay, conversationId, toolArgs) => {
    // Check if this is a product search result
    if (toolName === AppConfig.tools.productSearchName) {
      productsToDisplay.push(...processProductSearchResult(toolUseResponse, toolArgs));
    }

    addToolResultToHistory(conversationHistory, toolUseId, toolUseResponse.content, conversationId);
  };

  /**
   * Processes product search results
   * @param {Object} toolUseResponse - The response from the tool
   * @returns {Array} Processed product data
   */
  const processProductSearchResult = (toolUseResponse, toolArgs) => {
    try {
      console.log("Processing product search result");
      let products = [];

      // Extract variant filters (e.g. [{ name: "Size", value: "14" }]) from MCP call args
      const variantFilters = (toolArgs?.filters || [])
        .filter((f) => f.variantOption)
        .map((f) => f.variantOption);

      if (toolUseResponse.content && toolUseResponse.content.length > 0) {
        const content = toolUseResponse.content[0].text;

        try {
          let responseData;
          if (typeof content === 'object') {
            responseData = content;
          } else if (typeof content === 'string') {
            responseData = JSON.parse(content);
          }

          if (responseData?.products && Array.isArray(responseData.products)) {
            products = filterAvailableProducts(responseData.products, variantFilters)
              .slice(0, AppConfig.tools.maxProductsToDisplay)
              .map(formatProductData);

            console.log(`Found ${products.length} products to display (after availability filter)`);
          }
        } catch (e) {
          console.error("Error parsing product data:", e);
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
    const price = product.price_range
      ? `${product.price_range.currency} ${product.price_range.min}`
      : (product.variants && product.variants.length > 0
        ? `${product.variants[0].currency} ${product.variants[0].price}`
        : 'Price not available');

    return {
      id: product.product_id || `product-${Math.random().toString(36).substring(7)}`,
      title: product.title || 'Product',
      price: price,
      image_url: product.image_url || '',
      description: product.description || '',
      url: product.url || ''
    };
  };

  /**
   * Adds a tool result to the conversation history
   * @param {Array} conversationHistory - The conversation history
   * @param {string} toolUseId - The ID of the tool use request
   * @param {string} content - The content of the tool result
   * @param {string} conversationId - The conversation ID
   */
  const addToolResultToHistory = async (conversationHistory, toolUseId, content, conversationId) => {
    const toolResultMessage = {
      role: 'user',
      content: [{
        type: "tool_result",
        tool_use_id: toolUseId,
        content: content
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
