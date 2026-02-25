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
    { label: "Shipping & Fulfilment time", nodeId: "shipping" },
    { label: "Return and Exchange Policy", nodeId: "returns" },
    { label: "Ring Size Guide",            nodeId: "ring_size" },
    { label: "Gemstone Quiz",              nodeId: "gemstone_quiz" },
    { label: "Order Assistance",           nodeId: "order_assistance" },
  ];

  const FAQ_FLOW = {
    shipping: {
      message: "**Shipping & Fulfilment**\n\nWe aim to dispatch all orders within 1–3 business days. Standard delivery takes 5–10 business days; express options are available at checkout.\n\nWhat would you like to know more about?",
      quickReplies: [
        { label: "Track my order",        nextId: "shipping_track" },
        { label: "International shipping", nextId: "shipping_intl" },
        { label: "Shipping delays",        nextId: "shipping_delay" },
        { label: "Back to main topics",    nextId: "__restart" },
      ],
    },
    shipping_track: {
      message: "**Tracking Your Order**\n\nOnce your order ships you'll receive a confirmation email with a tracking link. Tracking updates may take up to 24 hours to appear after dispatch.\n\nFor real-time order status, our AI assistant can look up your order directly!",
      quickReplies: [
        { label: "Ask the AI assistant", nextId: null },
        { label: "Back to shipping",     nextId: "shipping" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    shipping_intl: {
      message: "**International Shipping**\n\nWe ship to most countries worldwide. International delivery typically takes 10–20 business days depending on your location.\n\nPlease note:\n- Customs duties and import taxes are the buyer's responsibility\n- Some remote areas may have extended delivery times\n- We provide tracking on all international orders",
      quickReplies: [
        { label: "Track my order",      nextId: "shipping_track" },
        { label: "Shipping delays",     nextId: "shipping_delay" },
        { label: "Back to main topics", nextId: "__restart" },
      ],
    },
    shipping_delay: {
      message: "**Shipping Delays**\n\nIf your order hasn't arrived within the expected timeframe, here's what to do:\n\n- Check your tracking link for the latest status\n- Allow an extra 3–5 business days during busy periods\n- Contact us if your order is more than 7 days overdue\n\nOur AI assistant can help you check your order status right now!",
      quickReplies: [
        { label: "Ask the AI assistant", nextId: null },
        { label: "Track my order",       nextId: "shipping_track" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },

    returns: {
      message: "**Return & Exchange Policy**\n\nWe accept returns within 30 days of delivery for most items in their original, unworn condition.\n\nWhat would you like to know?",
      quickReplies: [
        { label: "How to start a return", nextId: "returns_process" },
        { label: "Refund timeline",       nextId: "returns_refund" },
        { label: "Exchange an item",      nextId: "returns_exchange" },
        { label: "Back to main topics",   nextId: "__restart" },
      ],
    },
    returns_process: {
      message: "**Starting a Return**\n\nTo initiate a return:\n\n1. Contact us within 30 days of delivery\n2. Provide your order number and reason for return\n3. We'll email you a prepaid return label\n4. Pack the item securely in its original packaging\n5. Drop off at your nearest post office\n\nCustomised or engraved items cannot be returned unless faulty.",
      quickReplies: [
        { label: "Refund timeline",      nextId: "returns_refund" },
        { label: "Ask the AI assistant", nextId: null },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    returns_refund: {
      message: "**Refund Timeline**\n\nOnce we receive your returned item:\n\n- Inspection takes 1–3 business days\n- Refunds are issued to your original payment method\n- Allow 5–10 business days for the funds to appear\n\nYou'll receive an email confirmation when your refund is processed.",
      quickReplies: [
        { label: "Exchange an item",      nextId: "returns_exchange" },
        { label: "How to start a return", nextId: "returns_process" },
        { label: "Back to main topics",   nextId: "__restart" },
      ],
    },
    returns_exchange: {
      message: "**Exchanging an Item**\n\nWe're happy to exchange items for a different size or style.\n\nTo request an exchange:\n- Contact us within 30 days of delivery\n- Let us know your order number and the item you'd like instead\n- We'll hold your new item while we process the return\n\nIf the new item costs more, we'll send a payment link for the difference.",
      quickReplies: [
        { label: "How to start a return", nextId: "returns_process" },
        { label: "Ask the AI assistant",  nextId: null },
        { label: "Back to main topics",   nextId: "__restart" },
      ],
    },

    ring_size: {
      message: "**Ring Size Guide**\n\nFinding your perfect ring size is important! What would you like help with?",
      quickReplies: [
        { label: "Size chart",             nextId: "ring_size_chart" },
        { label: "How to measure my finger", nextId: "ring_size_tips" },
        { label: "I'm between two sizes",  nextId: "ring_size_between" },
        { label: "Back to main topics",    nextId: "__restart" },
      ],
    },
    ring_size_chart: {
      message: "**Ring Size Chart (Inner Circumference)**\n\n- Size 5 — 49.3 mm\n- Size 6 — 51.9 mm\n- Size 7 — 54.4 mm\n- Size 8 — 57.0 mm\n- Size 9 — 59.5 mm\n- Size 10 — 62.1 mm\n- Size 11 — 64.6 mm\n- Size 12 — 67.2 mm\n\nMeasure the inner circumference of a ring that fits well, or wrap a thin strip of paper around your finger.",
      quickReplies: [
        { label: "How to measure my finger", nextId: "ring_size_tips" },
        { label: "I'm between two sizes",    nextId: "ring_size_between" },
        { label: "Back to main topics",      nextId: "__restart" },
      ],
    },
    ring_size_tips: {
      message: "**How to Measure Your Finger**\n\n- Measure at the end of the day when fingers are slightly larger\n- Avoid measuring when fingers are cold or swollen\n- Wrap a thin strip of paper around the base of your finger\n- Mark where it overlaps and measure the length in millimetres\n- Compare to our size chart\n\n**Tip:** If your knuckle is larger than the base of your finger, size up and use a ring adjuster.",
      quickReplies: [
        { label: "Size chart",             nextId: "ring_size_chart" },
        { label: "I'm between two sizes",  nextId: "ring_size_between" },
        { label: "Back to main topics",    nextId: "__restart" },
      ],
    },
    ring_size_between: {
      message: "**Between Two Sizes?**\n\nIf you're between sizes, here's our advice:\n\n- For slim bands (under 4 mm): choose the smaller size\n- For wide bands (6 mm or more): choose the larger size\n- For everyday rings: size up for comfort\n\nStill unsure? Our AI assistant can help you find the right fit for a specific style!",
      quickReplies: [
        { label: "Ask the AI assistant", nextId: null },
        { label: "Size chart",           nextId: "ring_size_chart" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },

    gemstone_quiz: {
      message: "**Gemstone Quiz**\n\nLet's find your perfect gemstone! What's the main occasion for the piece?",
      quickReplies: [
        { label: "Everyday wear",         nextId: "gem_everyday" },
        { label: "Special occasion",      nextId: "gem_special" },
        { label: "Engagement or wedding", nextId: "gem_engagement" },
        { label: "Just browsing",         nextId: "gem_all" },
      ],
    },
    gem_everyday: {
      message: "**Everyday Gemstones**\n\nFor daily wear, durability is key. Top picks:\n\n- **Moissanite** — Brilliant sparkle, near-diamond hardness, great value\n- **Sapphire** — Exceptional hardness, vivid colours, timeless\n- **Lab Diamond** — Classic beauty, maximum durability\n\nWhich would you like to know more about?",
      quickReplies: [
        { label: "Moissanite",          nextId: "gem_moissanite" },
        { label: "Sapphire",            nextId: "gem_sapphire" },
        { label: "Lab Diamond",         nextId: "gem_lab_diamond" },
        { label: "Back to main topics", nextId: "__restart" },
      ],
    },
    gem_special: {
      message: "**Special Occasion Gemstones**\n\nFor a show-stopping piece, consider:\n\n- **Ruby** — Bold red, symbol of passion and elegance\n- **Sapphire** — Royal blue or fancy colours, stunning centrepieces\n- **Lab Diamond** — Unmatched brilliance and fire\n\nWhich interests you most?",
      quickReplies: [
        { label: "Ruby",                nextId: "gem_ruby" },
        { label: "Sapphire",            nextId: "gem_sapphire" },
        { label: "Lab Diamond",         nextId: "gem_lab_diamond" },
        { label: "Back to main topics", nextId: "__restart" },
      ],
    },
    gem_engagement: {
      message: "**Engagement & Wedding Gemstones**\n\nA piece for a lifetime deserves careful thought:\n\n- **Lab Diamond** — Traditional brilliance, ethically sourced\n- **Moissanite** — Near-identical to diamond, exceptional fire, budget-friendly\n- **Sapphire** — Royal choice, extremely durable, a true heirloom\n\nWhich would you like to explore?",
      quickReplies: [
        { label: "Lab Diamond",         nextId: "gem_lab_diamond" },
        { label: "Moissanite",          nextId: "gem_moissanite" },
        { label: "Sapphire",            nextId: "gem_sapphire" },
        { label: "Back to main topics", nextId: "__restart" },
      ],
    },
    gem_all: {
      message: "**All Our Gemstones**\n\nWe work with a curated selection of beautiful stones. Which would you like to explore?",
      quickReplies: [
        { label: "Sapphire",    nextId: "gem_sapphire" },
        { label: "Moissanite",  nextId: "gem_moissanite" },
        { label: "Ruby",        nextId: "gem_ruby" },
        { label: "Lab Diamond", nextId: "gem_lab_diamond" },
      ],
    },
    gem_sapphire: {
      message: "**Sapphire**\n\nSapphires are one of the world's most prized gemstones.\n\n- **Hardness:** 9/10 — excellent for everyday wear\n- **Colours:** Classic blue, pink, yellow, white, padparadscha\n- **Symbolism:** Loyalty, wisdom, and nobility\n- **Care:** Clean with warm soapy water; safe for ultrasonic cleaning\n\nOur AI assistant can help you find a sapphire piece that matches your style!",
      quickReplies: [
        { label: "Ask the AI assistant",  nextId: null },
        { label: "Back to gemstone quiz", nextId: "gemstone_quiz" },
        { label: "Back to main topics",   nextId: "__restart" },
      ],
    },
    gem_moissanite: {
      message: "**Moissanite**\n\nOriginally discovered in a meteorite, moissanite is nature's most brilliant gem.\n\n- **Hardness:** 9.25/10 — nearly as hard as diamond\n- **Brilliance:** Higher refractive index than diamond — stunning fire\n- **Ethics:** Lab-created, conflict-free\n- **Value:** Exceptional quality at a fraction of the diamond price",
      quickReplies: [
        { label: "Ask the AI assistant",  nextId: null },
        { label: "Back to gemstone quiz", nextId: "gemstone_quiz" },
        { label: "Back to main topics",   nextId: "__restart" },
      ],
    },
    gem_ruby: {
      message: "**Ruby**\n\nRubies are the gemstone of passion and vitality.\n\n- **Hardness:** 9/10 — excellent durability\n- **Colour:** Rich red to pinkish-red; the finest are \"pigeon blood\" red\n- **Symbolism:** Love, courage, and protection\n- **Care:** Avoid harsh chemicals; clean with warm soapy water",
      quickReplies: [
        { label: "Ask the AI assistant",  nextId: null },
        { label: "Back to gemstone quiz", nextId: "gemstone_quiz" },
        { label: "Back to main topics",   nextId: "__restart" },
      ],
    },
    gem_lab_diamond: {
      message: "**Lab-Grown Diamond**\n\nIdentical to mined diamonds in every way, just created sustainably.\n\n- **Hardness:** 10/10 — the hardest natural substance\n- **Appearance:** Chemically, physically, and optically identical to mined diamonds\n- **Ethics:** No mining, minimal environmental impact\n- **Value:** Typically 50–70% less than equivalent mined diamonds",
      quickReplies: [
        { label: "Ask the AI assistant",  nextId: null },
        { label: "Back to gemstone quiz", nextId: "gemstone_quiz" },
        { label: "Back to main topics",   nextId: "__restart" },
      ],
    },

    order_assistance: {
      message: "**Order Assistance**\n\nHow can we help with your order?",
      quickReplies: [
        { label: "Check order status",        nextId: "order_status" },
        { label: "Change or cancel an order", nextId: "order_change" },
        { label: "Received the wrong item",   nextId: "order_wrong_item" },
        { label: "Item arrived damaged",      nextId: "order_damaged" },
      ],
    },
    order_status: {
      message: "**Check Order Status**\n\nOur AI assistant can look up your order status in real time! Just ask:\n\n\"What's the status of my order?\"\n\nYou may need to log in so we can securely access your order information.",
      quickReplies: [
        { label: "Ask the AI assistant", nextId: null },
        { label: "Back to order help",   nextId: "order_assistance" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    order_change: {
      message: "**Change or Cancel an Order**\n\nWe can make changes to your order within **1 hour** of placing it.\n\nAfter that, your order may already be in production or dispatched.\n\nOur AI assistant can check your order details and advise what's possible right now.",
      quickReplies: [
        { label: "Ask the AI assistant", nextId: null },
        { label: "Back to order help",   nextId: "order_assistance" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    order_wrong_item: {
      message: "**Received the Wrong Item?**\n\nWe're so sorry about that! Please:\n\n1. Take a photo of the item you received\n2. Note your order number\n3. Contact us — we'll arrange a replacement or refund immediately\n\nOur AI assistant can start this process for you right now.",
      quickReplies: [
        { label: "Ask the AI assistant", nextId: null },
        { label: "Back to order help",   nextId: "order_assistance" },
        { label: "Back to main topics",  nextId: "__restart" },
      ],
    },
    order_damaged: {
      message: "**Item Arrived Damaged?**\n\nWe take great care with packaging, but sometimes damage occurs in transit. Here's what to do:\n\n1. Take clear photos of the damage and packaging\n2. Note your order number\n3. Contact us within 48 hours of delivery\n\nWe'll send a replacement or issue a full refund — no need to return the damaged item.",
      quickReplies: [
        { label: "Ask the AI assistant", nextId: null },
        { label: "Back to order help",   nextId: "order_assistance" },
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
          sendButton: container.querySelector(".shop-ai-chat-send"),
          messagesContainer: container.querySelector(".shop-ai-chat-messages"),
        };

        // Detect mobile device
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        // Set up event listeners
        this.setupEventListeners();

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
          sendButton,
          messagesContainer,
        } = this.elements;

        // Toggle chat window visibility
        chatBubble.addEventListener("click", () => this.toggleChatWindow());

        // Close chat window
        closeButton.addEventListener("click", () => this.closeChatWindow());

        // Send message when pressing Enter in input
        chatInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter" && chatInput.value.trim() !== "") {
            ShopAIChat.Flow.endFlow();
            ShopAIChat.Message.send(chatInput, messagesContainer);

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

            // On mobile, focus input after sending
            if (this.isMobile) {
              setTimeout(() => chatInput.focus(), 300);
            }
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
        const { chatWindow, chatInput } = this.elements;

        chatWindow.classList.toggle("active");

        if (chatWindow.classList.contains("active")) {
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
          // Remove body class when closing
          document.body.classList.remove("shop-ai-chat-open");
        }
      },

      /**
       * Close chat window
       */
      closeChatWindow: function () {
        const { chatWindow, chatInput } = this.elements;

        chatWindow.classList.remove("active");

        // On mobile, blur input to hide keyboard and enable body scrolling
        if (this.isMobile) {
          chatInput.blur();
          document.body.classList.remove("shop-ai-chat-open");
        }
      },

      /**
       * Scroll messages container to bottom
       */
      scrollToBottom: function () {
        const { messagesContainer } = this.elements;
        setTimeout(() => {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
