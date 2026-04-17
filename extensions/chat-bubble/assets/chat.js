/**
 * Shop AI Chat - Client-side implementation
 *
 * This module handles the chat interface for the Shopify AI Chat application.
 * It manages the UI interactions, API communication, and message rendering.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Scripted FAQ flow data
  // ---------------------------------------------------------------------------

  const FAQ_STARTERS = [
    { label: "Shipping & Delivery", nodeId: "shipping" },
    { label: "Sizing & Fit",        nodeId: "sizing" },
    { label: "Returns & Warranty",  nodeId: "returns" },
    { label: "Ring Care & Info",    nodeId: "ring_info" },
  ];

  const FAQ_FLOW = {
    // --- SHIPPING ---
    shipping: {
      message: "Our orders are shipped from Boston, MA. Shipping within the US is usually around $4 and takes 3–7 business days via USPS.",
      quickReplies: [
        { label: "Track my order",      nextId: "shipping_track" },
        { label: "International shipping?", nextId: "shipping_intl" },
        { label: "Shipping costs",      nextId: "shipping_cost" },
        { label: "Order not arrived",   nextId: "shipping_delay" },
        { label: "Back to main topics", nextId: "__restart" },
      ],
    },
    shipping_track: {
      message: "Once your order ships, you'll receive a confirmation email with a tracking number linked to the carrier.",
      quickReplies: [
        { label: "Order not arrived",   nextId: "shipping_delay" },
        { label: "Back to shipping",     nextId: "shipping" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    shipping_intl: {
      message: "As a small family business, unfortunately at the moment we can only ship within the US. International shipping is not available.",
      quickReplies: [
        { label: "Back to shipping",     nextId: "shipping" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    shipping_cost: {
      message: "Shipping costs vary based on destination, carrier, and weight. The final cost is shown at checkout (usually about $4 within the US).",
      quickReplies: [
        { label: "Back to shipping",     nextId: "shipping" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    shipping_delay: {
      message: "If your tracking hasn't updated or your order is delayed, please contact us at **support@rinfit.com** with your order number.",
      quickReplies: [
        { label: "Ask the AI assistant", nextId: null },
        { label: "Back to shipping",     nextId: "shipping" },
        { label: "__restart",            nextId: "__restart" },
      ],
    },

    // --- SIZING ---
    sizing: {
      message: "Rinfit rings follow standard US sizing. Since silicone is flexible, choosing the right fit is easy!",
      quickReplies: [
        { label: "True to size?",        nextId: "sizing_true" },
        { label: "I am a half size",     nextId: "sizing_half" },
        { label: "Size doesn't fit",     nextId: "sizing_wrong" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    sizing_true: {
      message: "Yes! Rinfit silicone rings are true to size and follow the same US measurement standards as traditional metal rings. [Learn more about defining your size accurately here](https://www.rinfit.com/blogs/news/how-to-define-the-ring-size-accurately).",
      quickReplies: [
        { label: "I am a half size",     nextId: "sizing_half" },
        { label: "Size doesn't fit",     nextId: "sizing_wrong" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    sizing_half: {
      message: "Our rings don't come in half sizes because silicone naturally stretches. If you're between sizes, we recommend **sizing down**. View our [complete Ring Size Guide](https://www.rinfit.com/pages/ring-size-guide) for more details.",
      quickReplies: [
        { label: "Size chart",           nextId: "sizing_true" },
        { label: "Back to sizing",       nextId: "sizing" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    sizing_wrong: {
      message: "We offer a one-time size exchange within 30 days of delivery. Please contact **support@rinfit.com** to start an exchange. See our [Warranty page](https://www.rinfit.com/pages/warranty) for more info.",
      quickReplies: [
        { label: "Returns policy",       nextId: "returns" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },

    // --- RETURNS & WARRANTY ---
    returns: {
      message: "We accept returns within 30 days for unused items in original packaging. We also offer a one-time warranty for damage. [View our detailed policy here](https://www.rinfit.com/pages/warranty).",
      quickReplies: [
        { label: "How to start a return", nextId: "returns_start" },
        { label: "Damaged ring",         nextId: "returns_damaged" },
        { label: "Refund timeline",      nextId: "returns_refund" },
        { label: "Return shipping cost", nextId: "returns_cost" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    returns_start: {
      message: "To start a return, please contact **support@rinfit.com** first to receive instructions. Valid proof of purchase is required. [Full return instructions here](https://www.rinfit.com/pages/warranty).",
      quickReplies: [
        { label: "Return shipping cost", nextId: "returns_cost" },
        { label: "Back to returns",      nextId: "returns" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    returns_damaged: {
      message: "We offer a **one-time warranty replacement** for breakage or tears. Email **support@rinfit.com** with a photo of the damage. [Full warranty details](https://www.rinfit.com/pages/warranty).",
      quickReplies: [
        { label: "Back to returns",      nextId: "returns" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    returns_refund: {
      message: "Once your return is approved, the refund is processed to your original payment method. Bank processing times may vary.",
      quickReplies: [
        { label: "Back to returns",      nextId: "returns" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    returns_cost: {
      message: "Return shipping costs are the responsibility of the customer and are non-refundable.",
      quickReplies: [
        { label: "Back to returns",      nextId: "returns" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },

    // --- RING CARE & INFO ---
    ring_info: {
      message: "Rinfit rings are designed for active lifestyles. They are comfortable, flexible, and safe for any activity.",
      quickReplies: [
        { label: "Why silicone?",        nextId: "info_why" },
        { label: "How to clean",         nextId: "info_clean" },
        { label: "Ring rash/Allergies",  nextId: "info_rash" },
        { label: "Custom/Wholesale",     nextId: "info_custom" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    info_why: {
      message: "Silicone bands offer safety and flexibility that metal rings can't. They're perfect for workouts, sports, and hands-on work.",
      quickReplies: [
        { label: "How to clean",         nextId: "info_clean" },
        { label: "Back to ring care",     nextId: "ring_info" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    info_clean: {
      message: "Clean your ring with warm water and mild soap. Ensure it is fully dry before wearing it again to prevent irritation. [Learn more on ring maintenance](https://www.rinfit.com/blogs/news/how-to-clean-silicone-rings).",
      quickReplies: [
        { label: "Ring rash info",       nextId: "info_rash" },
        { label: "Back to ring care",     nextId: "ring_info" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    info_rash: {
      message: "Silicone is hypoallergenic, but moisture or soap trapped under the ring can cause 'ring rash'. Try removing it while sleeping or showering.",
      quickReplies: [
        { label: "How to clean",         nextId: "info_clean" },
        { label: "Back to ring care",     nextId: "ring_info" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    info_custom: {
      message: "For custom style/color combinations or wholesale inquiries, please reach out to **support@rinfit.com**.",
      quickReplies: [
        { label: "Back to ring care",     nextId: "ring_info" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
  };

  // ---------------------------------------------------------------------------

  /**
   * Application namespace to prevent global scope pollution
   */
  const ShopAIChat = {
    /**
     * UI-related elements and functionality
     */
    UI: {
      elements: {},
      isMobile: false,

      /**
       * Initialize UI elements and event listeners
       * @param {HTMLElement} container - The main container element
       */
      init: function (container) {
        if (!container) return;

        // Cache DOM elements
        this.elements = {
          container: container,
          chatBubble: container.querySelector(".shop-ai-chat-bubble"),
          chatWindow: container.querySelector(".shop-ai-chat-window"),
          closeButton: container.querySelector(".shop-ai-chat-close"),
          chatInput: container.querySelector(".shop-ai-chat-input input"),
          imageIcon: container.querySelector(".shop-ai-image-icon"),
          sendButton: container.querySelector(".shop-ai-chat-send"),
          backButton: container.querySelector(".shop-ai-chat-back"),
          messagesContainer: container.querySelector(".shop-ai-chat-messages"),
          scrollBottomBtn: container.querySelector(".shop-ai-scroll-bottom"),
        };

        // Detect mobile device
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        // Set up event listeners
        this.setupEventListeners();

        // Set up scroll-to-bottom button
        this.setupScrollListener();

        // Fix for iOS Safari viewport height issues
        if (this.isMobile) {
          this.setupMobileViewport();
        }
      },

      /**
       * Set up all event listeners for UI interactions
       */
      setupEventListeners: function () {
        const {
          chatBubble,
          closeButton,
          chatInput,
          imageIcon,
          sendButton,
          backButton,
          messagesContainer,
        } = this.elements;

        // Toggle chat window visibility
        chatBubble.addEventListener("click", () => this.toggleChatWindow());

        // Close chat window
        closeButton.addEventListener("click", () => this.closeChatWindow());

        // Back to home button
        backButton.addEventListener("click", () => this.resetToHome());

        // Send message when pressing Enter in input
        chatInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter" && chatInput.value.trim() !== "") {
            ShopAIChat.Flow.endFlow();
            ShopAIChat.Message.send(chatInput, messagesContainer);

            // Hide send button and show image icon after sending
            sendButton.style.display = "none";
            imageIcon.style.display = "flex";

            // On mobile, handle keyboard
            if (this.isMobile) {
              chatInput.blur();
              setTimeout(() => chatInput.focus(), 300);
            }
          }
        });

        // Send message when clicking send button
        sendButton.addEventListener("click", () => {
          if (chatInput.value.trim() !== "") {
            ShopAIChat.Flow.endFlow();
            ShopAIChat.Message.send(chatInput, messagesContainer);

            // Hide send button and show image icon after sending
            sendButton.style.display = "none";
            imageIcon.style.display = "flex";

            // On mobile, focus input after sending
            if (this.isMobile) {
              setTimeout(() => chatInput.focus(), 300);
            }
          }
        });

        // Toggle icons based on input content
        chatInput.addEventListener("input", () => {
          if (chatInput.value.trim() !== "") {
            imageIcon.style.display = "none";
            sendButton.style.display = "flex";
          } else {
            imageIcon.style.display = "flex";
            sendButton.style.display = "none";
          }
        });

        // Handle window resize to adjust scrolling
        window.addEventListener("resize", () => this.scrollToBottom());

        // Add global click handler for auth links
        document.addEventListener("click", function (event) {
          if (
            event.target &&
            event.target.classList.contains("shop-auth-trigger")
          ) {
            event.preventDefault();
            if (window.shopAuthUrl) {
              ShopAIChat.Auth.openAuthPopup(window.shopAuthUrl);
            }
          }
        });
      },

      /**
       * Setup mobile-specific viewport adjustments
       */
      setupMobileViewport: function () {
        const setViewportHeight = () => {
          document.documentElement.style.setProperty(
            "--viewport-height",
            `${window.innerHeight}px`,
          );
        };
        window.addEventListener("resize", setViewportHeight);
        setViewportHeight();
      },

      /**
       * Toggle chat window visibility
       */
      toggleChatWindow: function () {
        const { chatWindow, chatInput, chatBubble } = this.elements;

        chatWindow.classList.toggle("active");

        if (chatWindow.classList.contains("active")) {
          // Hide bubble when window is active
          if (chatBubble) chatBubble.classList.add("hidden");
          
          // On mobile, prevent body scrolling and delay focus
          if (this.isMobile) {
            document.body.classList.add("shop-ai-chat-open");
            setTimeout(() => chatInput.focus(), 500);
          } else {
            chatInput.focus();
          }
          // Always scroll messages to bottom when opening
          this.scrollToBottom();
        } else {
          // Show bubble when window is hidden
          if (chatBubble) chatBubble.classList.remove("hidden");
          
          // Remove body class when closing
          document.body.classList.remove("shop-ai-chat-open");
        }
      },

      /**
       * Close chat window
       */
      closeChatWindow: function () {
        const { chatWindow, chatInput, chatBubble } = this.elements;

        chatWindow.classList.remove("active");
        if (chatBubble) chatBubble.classList.remove("hidden");

        // On mobile, blur input to hide keyboard and enable body scrolling
        if (this.isMobile) {
          chatInput.blur();
          document.body.classList.remove("shop-ai-chat-open");
        }
      },

      /**
       * Setup scroll-to-bottom button visibility based on scroll position
       */
      setupScrollListener: function () {
        const { messagesContainer, scrollBottomBtn } = this.elements;
        if (!messagesContainer || !scrollBottomBtn) return;

        messagesContainer.addEventListener("scroll", () => {
          const threshold = 80;
          const distanceFromBottom =
            messagesContainer.scrollHeight -
            messagesContainer.scrollTop -
            messagesContainer.clientHeight;

          if (distanceFromBottom > threshold) {
            scrollBottomBtn.classList.add("visible");
          } else {
            scrollBottomBtn.classList.remove("visible");
          }
        });

        scrollBottomBtn.addEventListener("click", () => {
          this.scrollToBottom(true);
          scrollBottomBtn.classList.remove("visible");
        });
      },

      /**
       * Scroll messages container to bottom
       */
      scrollToBottom: function (smooth) {
        const { messagesContainer } = this.elements;
        setTimeout(() => {
          if (smooth) {
            messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: "smooth" });
          } else {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }, 100);
      },

      /**
       * Show typing indicator in the chat
       */
      showTypingIndicator: function () {
        const { messagesContainer } = this.elements;

        const typingIndicator = document.createElement("div");
        typingIndicator.classList.add("shop-ai-typing-indicator");
        typingIndicator.innerHTML = "<span></span><span></span><span></span>";
        messagesContainer.appendChild(typingIndicator);
        this.scrollToBottom();
      },

      /**
       * Remove typing indicator from the chat
       */
      removeTypingIndicator: function () {
        const { messagesContainer } = this.elements;

        const typingIndicator = messagesContainer.querySelector(
          ".shop-ai-typing-indicator",
        );
        if (typingIndicator) {
          typingIndicator.remove();
        }
      },

      /**
       * Display product results in the chat
       * @param {Array} products - Array of product data objects
       */
      displayProductResults: function (products) {
        const { messagesContainer } = this.elements;

        // Create a wrapper for the product section
        const productSection = document.createElement("div");
        productSection.classList.add("shop-ai-product-section");
        messagesContainer.appendChild(productSection);

        // Add a header for the product results
        const header = document.createElement("div");
        header.classList.add("shop-ai-product-header");
        header.innerHTML = "<h4>Top Matching Products</h4>";
        productSection.appendChild(header);

        // Create the product grid container
        const productsContainer = document.createElement("div");
        productsContainer.classList.add("shop-ai-product-grid");
        productSection.appendChild(productsContainer);

        if (!products || !Array.isArray(products) || products.length === 0) {
          const noProductsMessage = document.createElement("p");
          noProductsMessage.textContent = "No products found";
          noProductsMessage.style.padding = "10px";
          productsContainer.appendChild(noProductsMessage);
        } else {
          products.forEach((product) => {
            const productCard = ShopAIChat.Product.createCard(product);
            productsContainer.appendChild(productCard);
          });
        }

        this.scrollToBottom();
      },

      /**
       * Mark that interaction has started (removes blue initial background)
       */
      markInteractionStarted: function () {
        const { chatWindow } = this.elements;
        if (chatWindow) {
          chatWindow.classList.remove("initial-state");
        }
      },

      /**
       * Reset chat to initial home state
       */
      resetToHome: function () {
        const { chatWindow, messagesContainer } = this.elements;

        // Reset UI state
        if (chatWindow) {
          chatWindow.classList.add("initial-state");
        }

        // Clear messages
        if (messagesContainer) {
          messagesContainer.innerHTML = "";
        }

        // End any active flow
        ShopAIChat.Flow.endFlow();

        // Clear conversation storage
        sessionStorage.removeItem("shopAiConversationId");
        sessionStorage.removeItem("shopAiLastMessage");

        // Re-initialize with welcome message and starters
        const welcomeMessage =
          window.shopChatConfig?.welcomeMessage ||
          "👋 Hi there! How can I help you today?";
        ShopAIChat.Message.add(
          welcomeMessage,
          "assistant",
          messagesContainer,
        );
        ShopAIChat.Flow.showStarters();
      },
    },

    /**
     * Message handling and display functionality
     */
    Message: {
      /**
       * Send a message to the API
       * @param {HTMLInputElement} chatInput - The input element
       * @param {HTMLElement} messagesContainer - The messages container
       */
      send: async function (chatInput, messagesContainer) {
        const userMessage = chatInput.value.trim();
        const conversationId = sessionStorage.getItem("shopAiConversationId");

        // Mark interaction started to change background color
        ShopAIChat.UI.markInteractionStarted();

        // Add user message to chat
        this.add(userMessage, "user", messagesContainer);

        // Clear input
        chatInput.value = "";

        // Show typing indicator
        ShopAIChat.UI.showTypingIndicator();

        try {
          ShopAIChat.API.streamResponse(
            userMessage,
            conversationId,
            messagesContainer,
          );
        } catch (error) {
          console.error("Error communicating with Claude API:", error);
          ShopAIChat.UI.removeTypingIndicator();
          this.add(
            "Sorry, I couldn't process your request at the moment. Please try again later.",
            "assistant",
            messagesContainer,
          );
        }
      },

      /**
       * Add a message to the chat
       * @param {string} text - Message content
       * @param {string} sender - Message sender ('user' or 'assistant')
       * @param {HTMLElement} messagesContainer - The messages container
       * @returns {HTMLElement} The created message element
       */
      add: function (text, sender, messagesContainer) {
        const container = messagesContainer || ShopAIChat.UI.elements.messagesContainer;
        const messageElement = document.createElement("div");
        messageElement.classList.add("shop-ai-message", sender);

        if (sender === "assistant") {
          messageElement.dataset.rawText = text;
          ShopAIChat.Formatting.formatMessageContent(messageElement);
        } else {
          messageElement.textContent = text;
        }

        container.appendChild(messageElement);
        ShopAIChat.UI.scrollToBottom();

        return messageElement;
      },

      /**
       * Tool use debugging UI - hidden from end users
       * Uncomment to re-enable for debugging
       */
      // addToolUse: function(toolMessage, messagesContainer) {
      //   // Parse the tool message to extract tool name and arguments
      //   const match = toolMessage.match(/Calling tool: (\w+) with arguments: (.+)/);
      //   if (!match) {
      //     // Fallback for unexpected format
      //     const toolUseElement = document.createElement('div');
      //     toolUseElement.classList.add('shop-ai-message', 'tool-use');
      //     toolUseElement.textContent = toolMessage;
      //     messagesContainer.appendChild(toolUseElement);
      //     ShopAIChat.UI.scrollToBottom();
      //     return;
      //   }
      //
      //   const toolName = match[1];
      //   const argsString = match[2];
      //
      //   // Create the main tool use element
      //   const toolUseElement = document.createElement('div');
      //   toolUseElement.classList.add('shop-ai-message', 'tool-use');
      //
      //   // Create the header (always visible)
      //   const headerElement = document.createElement('div');
      //   headerElement.classList.add('shop-ai-tool-header');
      //
      //   const toolText = document.createElement('span');
      //   toolText.classList.add('shop-ai-tool-text');
      //   toolText.textContent = `Calling tool: ${toolName}`;
      //
      //   const toggleElement = document.createElement('span');
      //   toggleElement.classList.add('shop-ai-tool-toggle');
      //   toggleElement.textContent = '[+]';
      //
      //   headerElement.appendChild(toolText);
      //   headerElement.appendChild(toggleElement);
      //
      //   // Create the arguments section (initially hidden)
      //   const argsElement = document.createElement('div');
      //   argsElement.classList.add('shop-ai-tool-args');
      //
      //   try {
      //     // Try to format JSON arguments nicely
      //     const parsedArgs = JSON.parse(argsString);
      //     argsElement.textContent = JSON.stringify(parsedArgs, null, 2);
      //   } catch (e) {
      //     // If not valid JSON, just show as-is
      //     argsElement.textContent = argsString;
      //   }
      //
      //   // Add click handler to toggle arguments visibility
      //   headerElement.addEventListener('click', function() {
      //     const isExpanded = argsElement.classList.contains('expanded');
      //     if (isExpanded) {
      //       argsElement.classList.remove('expanded');
      //       toggleElement.textContent = '[+]';
      //     } else {
      //       argsElement.classList.add('expanded');
      //       toggleElement.textContent = '[-]';
      //     }
      //   });
      //
      //   // Assemble the complete element
      //   toolUseElement.appendChild(headerElement);
      //   toolUseElement.appendChild(argsElement);
      //
      //   messagesContainer.appendChild(toolUseElement);
      //   ShopAIChat.UI.scrollToBottom();
      // }
    },

    /**
     * Text formatting and markdown handling
     */
    Formatting: {
      /**
       * Format message content with markdown and links
       * @param {HTMLElement} element - The element to format
       */
      formatMessageContent: function (element) {
        if (!element || !element.dataset.rawText) return;

        const rawText = element.dataset.rawText;

        // Process the text with various Markdown features
        let processedText = rawText;

        // Process Markdown links
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        processedText = processedText.replace(
          markdownLinkRegex,
          (match, text, url) => {
            // Check if it's an auth URL
            if (
              url.includes("shopify.com/authentication") &&
              (url.includes("oauth/authorize") ||
                url.includes("authentication"))
            ) {
              // Store the auth URL in a global variable for later use - this avoids issues with onclick handlers
              window.shopAuthUrl = url;
              // Just return normal link that will be handled by the document click handler
              return (
                '<a href="#auth" class="shop-auth-trigger">' + text + "</a>"
              );
            }
            // If it's a checkout link, replace the text
            else if (url.includes("/cart") || url.includes("checkout")) {
              return (
                '<a href="' +
                url +
                '" target="_blank" rel="noopener noreferrer">click here to proceed to checkout</a>'
              );
            } else {
              // For normal links, preserve the original text
              return (
                '<a href="' +
                url +
                '" target="_blank" rel="noopener noreferrer">' +
                text +
                "</a>"
              );
            }
          },
        );

        // Convert text to HTML with proper list handling
        processedText = this.convertMarkdownToHtml(processedText);

        // Apply the formatted HTML
        element.innerHTML = processedText;
      },

      /**
       * Convert Markdown text to HTML with list support
       * @param {string} text - Markdown text to convert
       * @returns {string} HTML content
       */
      convertMarkdownToHtml: function (text) {
        text = text.replace(/(\*\*|__)(.*?)\1/g, "<strong>$2</strong>");
        const lines = text.split("\n");
        let currentList = null;
        let listItems = [];
        let htmlContent = "";
        let startNumber = 1;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const unorderedMatch = line.match(/^\s*([-*])\s+(.*)/);
          const orderedMatch = line.match(/^\s*(\d+)[\.)]\s+(.*)/);

          if (unorderedMatch) {
            if (currentList !== "ul") {
              if (currentList === "ol") {
                htmlContent +=
                  `<ol start="${startNumber}">` + listItems.join("") + "</ol>";
                listItems = [];
              }
              currentList = "ul";
            }
            listItems.push("<li>" + unorderedMatch[2] + "</li>");
          } else if (orderedMatch) {
            if (currentList !== "ol") {
              if (currentList === "ul") {
                htmlContent += "<ul>" + listItems.join("") + "</ul>";
                listItems = [];
              }
              currentList = "ol";
              startNumber = parseInt(orderedMatch[1], 10);
            }
            listItems.push("<li>" + orderedMatch[2] + "</li>");
          } else {
            if (currentList) {
              htmlContent +=
                currentList === "ul"
                  ? "<ul>" + listItems.join("") + "</ul>"
                  : `<ol start="${startNumber}">` +
                    listItems.join("") +
                    "</ol>";
              listItems = [];
              currentList = null;
            }

            if (line.trim() === "") {
              htmlContent += "<br>";
            } else {
              htmlContent += "<p>" + line + "</p>";
            }
          }
        }

        if (currentList) {
          htmlContent +=
            currentList === "ul"
              ? "<ul>" + listItems.join("") + "</ul>"
              : `<ol start="${startNumber}">` + listItems.join("") + "</ol>";
        }

        htmlContent = htmlContent.replace(/<\/p><p>/g, "</p>\n<p>");
        return htmlContent;
      },
    },

    /**
     * API communication and data handling
     */
    API: {
      /**
       * Stream a response from the API
       * @param {string} userMessage - User's message text
       * @param {string} conversationId - Conversation ID for context
       * @param {HTMLElement} messagesContainer - The messages container
       */
      streamResponse: async function (
        userMessage,
        conversationId,
        messagesContainer,
      ) {
        // Accumulate text silently — no visible streaming
        let accumulatedText = "";

        try {
          const promptType =
            window.shopChatConfig?.promptType || "standardAssistant";
          const requestBody = JSON.stringify({
            message: userMessage,
            conversation_id: conversationId,
            prompt_type: promptType,
          });

          const streamUrl = (window.shopChatConfig?.appUrl || "") + "/chat";
          const shopId = window.shopId;

          const response = await fetch(streamUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              "X-Shopify-Shop-Id": shopId,
            },
            body: requestBody,
          });

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          // Shared state object so handleStreamEvent can read/write accumulatedText
          const streamState = { accumulatedText: "" };

          // Process the stream
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  this.handleStreamEvent(
                    data,
                    streamState,
                    messagesContainer,
                    userMessage,
                  );
                } catch (e) {
                  console.error("Error parsing event data:", e, line);
                }
              }
            }
          }
        } catch (error) {
          console.error("Error in streaming:", error);
          ShopAIChat.UI.removeTypingIndicator();
          ShopAIChat.Message.add(
            "Sorry, I couldn't process your request. Please try again later.",
            "assistant",
            messagesContainer,
          );
        }
      },

      /**
       * Handle stream events from the API
       * @param {Object} data - Event data
       * @param {HTMLElement} currentMessageElement - Current message element being updated
       * @param {HTMLElement} messagesContainer - The messages container
       * @param {string} userMessage - The original user message
       * @param {Function} updateCurrentElement - Callback to update the current element reference
       */
      /**
       * Handle stream events from the API
       * @param {Object} data - Event data
       * @param {Object} streamState - Shared state with accumulatedText property
       * @param {HTMLElement} messagesContainer - The messages container
       * @param {string} userMessage - The original user message
       */
      handleStreamEvent: function (
        data,
        streamState,
        messagesContainer,
        userMessage,
      ) {
        switch (data.type) {
          case "id":
            if (data.conversation_id) {
              sessionStorage.setItem(
                "shopAiConversationId",
                data.conversation_id,
              );
            }
            break;

          case "chunk":
            // Silently accumulate text — no DOM update
            streamState.accumulatedText += data.chunk;
            break;

          case "message_complete":
            // Display the fully formatted message all at once
            ShopAIChat.UI.removeTypingIndicator();
            if (streamState.accumulatedText) {
              const msgEl = ShopAIChat.Message.add(
                streamState.accumulatedText,
                "assistant",
                messagesContainer,
              );
              msgEl.classList.add("shop-ai-fade-in");
              streamState.accumulatedText = "";   // clear so new_message won't re-render it
            }
            break;

          case "end_turn":
            ShopAIChat.UI.removeTypingIndicator();
            break;

          case "error":
            console.error("Stream error:", data.error);
            ShopAIChat.UI.removeTypingIndicator();
            ShopAIChat.Message.add(
              "Sorry, I couldn't process your request. Please try again later.",
              "assistant",
              messagesContainer,
            );
            break;

          case "rate_limit_exceeded":
            console.error("Rate limit exceeded:", data.error);
            ShopAIChat.UI.removeTypingIndicator();
            ShopAIChat.Message.add(
              "Sorry, our servers are currently busy. Please try again later.",
              "assistant",
              messagesContainer,
            );
            break;

          case "auth_required":
            // Save the last user message for resuming after authentication
            sessionStorage.setItem("shopAiLastMessage", userMessage || "");
            break;

          case "product_results":
            ShopAIChat.UI.displayProductResults(data.products);
            break;

          case "new_message":
            // Finalize the current accumulated message
            ShopAIChat.UI.removeTypingIndicator();
            if (streamState.accumulatedText) {
              const msgEl = ShopAIChat.Message.add(
                streamState.accumulatedText,
                "assistant",
                messagesContainer,
              );
              msgEl.classList.add("shop-ai-fade-in");
            }
            // Reset accumulator for the next response turn
            streamState.accumulatedText = "";
            ShopAIChat.UI.showTypingIndicator();
            break;

          case "content_block_complete":
            // Keep typing indicator visible during tool processing
            ShopAIChat.UI.showTypingIndicator();
            break;
        }
      },

      /**
       * Fetch chat history from the server
       * @param {string} conversationId - Conversation ID
       * @param {HTMLElement} messagesContainer - The messages container
       */
      fetchChatHistory: async function (conversationId, messagesContainer) {
        try {
          // Show a loading message
          const loadingMessage = document.createElement("div");
          loadingMessage.classList.add("shop-ai-message", "assistant");
          loadingMessage.textContent = "Loading conversation history...";
          messagesContainer.appendChild(loadingMessage);

          // Fetch history from the server
          const historyUrl = `${window.shopChatConfig?.appUrl || ""}/chat?history=true&conversation_id=${encodeURIComponent(conversationId)}`;
          console.log("Fetching history from:", historyUrl);

          const response = await fetch(historyUrl, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            mode: "cors",
          });

          if (!response.ok) {
            console.error(
              "History fetch failed:",
              response.status,
              response.statusText,
            );
            throw new Error("Failed to fetch chat history: " + response.status);
          }

          const data = await response.json();

          // Remove loading message
          messagesContainer.removeChild(loadingMessage);

          // No messages, show welcome message
          if (!data.messages || data.messages.length === 0) {
            const welcomeMessage =
              window.shopChatConfig?.welcomeMessage ||
              "👋 Hi there! How can I help you today?";
            ShopAIChat.Message.add(
              welcomeMessage,
              "assistant",
              messagesContainer,
            );
            return;
          }

          // Mark interaction started if history exists
          ShopAIChat.UI.markInteractionStarted();

          // Add messages to the UI - filter out tool results
          data.messages.forEach((message) => {
            try {
              const messageContents = JSON.parse(message.content);
              for (const contentBlock of messageContents) {
                if (contentBlock.type === "text") {
                  ShopAIChat.Message.add(
                    contentBlock.text,
                    message.role,
                    messagesContainer,
                  );
                } else if (contentBlock.type === "product_results") {
                  ShopAIChat.UI.displayProductResults(contentBlock.products);
                }
              }
            } catch (e) {
              ShopAIChat.Message.add(
                message.content,
                message.role,
                messagesContainer,
              );
            }
          });

          // Scroll to bottom
          ShopAIChat.UI.scrollToBottom();
        } catch (error) {
          console.error("Error fetching chat history:", error);

          // Remove loading message if it exists
          const loadingMessage = messagesContainer.querySelector(
            ".shop-ai-message.assistant",
          );
          if (
            loadingMessage &&
            loadingMessage.textContent === "Loading conversation history..."
          ) {
            messagesContainer.removeChild(loadingMessage);
          }

          // Show error and welcome message
          const welcomeMessage =
            window.shopChatConfig?.welcomeMessage ||
            "👋 Hi there! How can I help you today?";
          ShopAIChat.Message.add(
            welcomeMessage,
            "assistant",
            messagesContainer,
          );

          // Clear the conversation ID since we couldn't fetch this conversation
          sessionStorage.removeItem("shopAiConversationId");
        }
      },
    },

    /**
     * Authentication-related functionality
     */
    Auth: {
      /**
       * Opens an authentication popup window
       * @param {string|HTMLElement} authUrlOrElement - The auth URL or link element that was clicked
       */
      openAuthPopup: function (authUrlOrElement) {
        let authUrl;
        if (typeof authUrlOrElement === "string") {
          // If a string URL was passed directly
          authUrl = authUrlOrElement;
        } else {
          // If an element was passed
          authUrl = authUrlOrElement.getAttribute("data-auth-url");
          if (!authUrl) {
            console.error("No auth URL found in element");
            return;
          }
        }

        // Open the popup window centered in the screen
        const width = 600;
        const height = 700;
        const left = (window.innerWidth - width) / 2 + window.screenX;
        const top = (window.innerHeight - height) / 2 + window.screenY;

        const popup = window.open(
          authUrl,
          "ShopifyAuth",
          `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
        );

        // Focus the popup window
        if (popup) {
          popup.focus();
        } else {
          // If popup was blocked, show a message
          alert(
            "Please allow popups for this site to authenticate with Shopify.",
          );
        }

        // Start polling for token availability
        const conversationId = sessionStorage.getItem("shopAiConversationId");
        if (conversationId) {
          const messagesContainer = document.querySelector(
            ".shop-ai-chat-messages",
          );

          // Add a message to indicate authentication is in progress
          ShopAIChat.Message.add(
            "Authentication in progress. Please complete the process in the popup window.",
            "assistant",
            messagesContainer,
          );

          this.startTokenPolling(conversationId, messagesContainer);
        }
      },

      /**
       * Start polling for token availability
       * @param {string} conversationId - Conversation ID
       * @param {HTMLElement} messagesContainer - The messages container
       */
      startTokenPolling: function (conversationId, messagesContainer) {
        if (!conversationId) return;

        console.log("Starting token polling for conversation:", conversationId);
        const pollingId = "polling_" + Date.now();
        sessionStorage.setItem("shopAiTokenPollingId", pollingId);

        let attemptCount = 0;
        const maxAttempts = 30;

        const poll = async () => {
          if (sessionStorage.getItem("shopAiTokenPollingId") !== pollingId) {
            console.log(
              "Another polling session has started, stopping this one",
            );
            return;
          }

          if (attemptCount >= maxAttempts) {
            console.log("Max polling attempts reached, stopping");
            return;
          }

          attemptCount++;

          try {
            const tokenUrl =
              (window.shopChatConfig?.appUrl || "") +
              "/auth/token-status?conversation_id=" +
              encodeURIComponent(conversationId);
            const response = await fetch(tokenUrl);

            if (!response.ok) {
              throw new Error("Token status check failed: " + response.status);
            }

            const data = await response.json();

            if (data.status === "authorized") {
              console.log("Token available, resuming conversation");
              const message = sessionStorage.getItem("shopAiLastMessage");

              if (message) {
                sessionStorage.removeItem("shopAiLastMessage");
                setTimeout(() => {
                  ShopAIChat.Message.add(
                    "Authorization successful! I'm now continuing with your request.",
                    "assistant",
                    messagesContainer,
                  );
                  ShopAIChat.API.streamResponse(
                    message,
                    conversationId,
                    messagesContainer,
                  );
                  ShopAIChat.UI.showTypingIndicator();
                }, 500);
              }

              sessionStorage.removeItem("shopAiTokenPollingId");
              return;
            }

            console.log("Token not available yet, polling again in 10s");
            setTimeout(poll, 10000);
          } catch (error) {
            console.error("Error polling for token status:", error);
            setTimeout(poll, 10000);
          }
        };

        setTimeout(poll, 2000);
      },
    },

    /**
     * Product-related functionality
     */
    Product: {
      /**
       * Create a product card element
       * @param {Object} product - Product data
       * @returns {HTMLElement} Product card element
       */
      createCard: function (product) {
        const card = document.createElement("div");
        card.classList.add("shop-ai-product-card");

        // Create image container
        const imageContainer = document.createElement("div");
        imageContainer.classList.add("shop-ai-product-image");

        // Add product image or placeholder
        const image = document.createElement("img");
        image.src =
          product.image_url ||
          "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png";
        image.alt = product.title;
        image.onerror = function () {
          // If image fails to load, use a fallback placeholder
          this.src =
            "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png";
        };
        imageContainer.appendChild(image);
        card.appendChild(imageContainer);

        // Add product info
        const info = document.createElement("div");
        info.classList.add("shop-ai-product-info");

        // Add product title
        const title = document.createElement("h3");
        title.classList.add("shop-ai-product-title");
        title.textContent = product.title;

        // If product has a URL, make the title a link
        if (product.url) {
          const titleLink = document.createElement("a");
          titleLink.href = product.url;
          titleLink.target = "_blank";
          titleLink.textContent = product.title;
          title.textContent = "";
          title.appendChild(titleLink);
        }

        info.appendChild(title);

        // Add product price
        const price = document.createElement("p");
        price.classList.add("shop-ai-product-price");
        price.textContent = product.price;
        info.appendChild(price);

        // Add add-to-cart button
        const button = document.createElement("button");
        button.classList.add("shop-ai-add-to-cart");
        button.textContent = "Add to Cart";
        button.dataset.productId = product.id;

        // Add click handler for the button
        button.addEventListener("click", function () {
          // Send message to add this product to cart
          const input = document.querySelector(".shop-ai-chat-input input");
          if (input) {
            input.value = `Add ${product.title} to my cart`;
            // Trigger a click on the send button
            const sendButton = document.querySelector(".shop-ai-chat-send");
            if (sendButton) {
              sendButton.click();
            }
          }
        });

        info.appendChild(button);
        card.appendChild(info);

        return card;
      },
    },

    /**
     * Scripted FAQ flow — purely client-side, no AI calls
     */
    Flow: {
      _active: false,

      /** Render vertical column of starter pills into the messages container */
      showStarters: function () {
        const mc = ShopAIChat.UI.elements.messagesContainer;
        const wrapper = document.createElement("div");
        wrapper.classList.add("shop-ai-flow-starters");
        FAQ_STARTERS.forEach(function (starter) {
          const btn = document.createElement("button");
          btn.classList.add("shop-ai-flow-starter-btn");
          btn.textContent = starter.label;
          btn.addEventListener("click", function () {
            ShopAIChat.Flow.handleStarterClick(starter.nodeId, starter.label);
          });
          wrapper.appendChild(btn);
        });
        mc.appendChild(wrapper);
        ShopAIChat.UI.scrollToBottom();
        this._active = true;
      },

      /** Remove the starters container from the DOM */
      hideStarters: function () {
        const mc = ShopAIChat.UI.elements.messagesContainer;
        const el = mc.querySelector(".shop-ai-flow-starters");
        if (el) el.remove();
      },

      /** Handle a starter pill click: hide starters → user bubble → 400 ms → showNode */
      handleStarterClick: function (nodeId, label) {
        this.hideStarters();
        ShopAIChat.UI.markInteractionStarted();
        ShopAIChat.Message.add(label, "user");
        setTimeout(function () {
          ShopAIChat.Flow.showNode(nodeId);
        }, 400);
      },

      /** Render a flow node: remove old replies → assistant bubble → quick replies */
      showNode: function (nodeId) {
        this._removeQuickReplies();
        const node = FAQ_FLOW[nodeId];
        if (!node) return;
        ShopAIChat.Message.add(node.message, "assistant");
        if (node.quickReplies && node.quickReplies.length > 0) {
          this.showQuickReplies(node.quickReplies);
        }
      },

      /** Append a row of quick-reply pill buttons below the latest assistant message */
      showQuickReplies: function (replies) {
        const mc = ShopAIChat.UI.elements.messagesContainer;
        const wrapper = document.createElement("div");
        wrapper.classList.add("shop-ai-flow-replies");
        replies.forEach(function (reply) {
          const btn = document.createElement("button");
          btn.classList.add("shop-ai-flow-reply-btn");
          if (reply.nextId === null) {
            btn.classList.add("shop-ai-flow-reply-btn--escape");
          }
          btn.textContent = reply.label;
          btn.addEventListener("click", function () {
            ShopAIChat.Flow.handleQuickReply(reply.label, reply.nextId);
          });
          wrapper.appendChild(btn);
        });
        mc.appendChild(wrapper);
        ShopAIChat.UI.scrollToBottom();
      },

      /**
       * Handle a quick-reply click.
       * nextId === null        → end flow, invite AI typing
       * nextId === '__restart' → show starters again (no user bubble)
       * nextId === '<id>'     → user bubble → 400 ms → next node
       */
      handleQuickReply: function (label, nextId) {
        this._removeQuickReplies();
        ShopAIChat.UI.markInteractionStarted();
        if (nextId === null) {
          ShopAIChat.Message.add(label, "user");
          ShopAIChat.Message.add(
            "Feel free to type your question below!",
            "assistant",
          );
          this.endFlow();
        } else if (nextId === "__restart") {
          this._active = false;
          this.showStarters();
        } else {
          ShopAIChat.Message.add(label, "user");
          const nid = nextId;
          setTimeout(function () {
            ShopAIChat.Flow.showNode(nid);
          }, 400);
        }
      },

      /** Deactivate the flow and remove all flow UI from the DOM */
      endFlow: function () {
        this._active = false;
        this.hideStarters();
        this._removeQuickReplies();
      },

      /** Remove quick-reply row from the DOM */
      _removeQuickReplies: function () {
        const mc = ShopAIChat.UI.elements.messagesContainer;
        const el = mc.querySelector(".shop-ai-flow-replies");
        if (el) el.remove();
      },
    },

    /**
     * Initialize the chat application
     */
    init: function () {
      // Initialize UI
      const container = document.querySelector(".shop-ai-chat-container");
      if (!container) return;

      this.UI.init(container);

      // Check for existing conversation
      const conversationId = sessionStorage.getItem("shopAiConversationId");

      if (conversationId) {
        // Fetch conversation history
        this.API.fetchChatHistory(
          conversationId,
          this.UI.elements.messagesContainer,
        );
      } else {
        // Set initial state (blue background)
        const { chatWindow } = this.UI.elements;
        if (chatWindow) {
          chatWindow.classList.add("initial-state");
        }

        // No previous conversation, show welcome message
        const welcomeMessage =
          window.shopChatConfig?.welcomeMessage ||
          "👋 Hi there! How can I help you today?";
        this.Message.add(
          welcomeMessage,
          "assistant",
          this.UI.elements.messagesContainer,
        );
        this.Flow.showStarters();
      }
    },
  };

  // Initialize the application when DOM is ready
  document.addEventListener("DOMContentLoaded", function () {
    ShopAIChat.init();
  });
})();
