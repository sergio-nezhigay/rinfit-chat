# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start development server (includes Shopify CLI tunnel)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Production entrypoint (runs migrations then starts)
npm run docker-start

# Database: generate client and run migrations
npm run setup
npx prisma migrate dev          # dev: create + apply migrations
npx prisma migrate deploy       # prod: apply pending migrations
npx prisma studio               # GUI for inspecting SQLite data

# Lint
npm run lint

# Type-check (generates React Router types, then tsc)
npm run typecheck

# GraphQL codegen (Shopify Admin API types)
npm run graphql-codegen

# Shopify CLI commands
npm run config:link             # Link to a Shopify app
npm run config:use              # Switch app configurations
npm run deploy                  # Deploy to Shopify
```

**Node version requirement:** >=20.10

## Architecture

This is a Shopify app that embeds an AI-powered chat widget on storefronts. Customers interact with a Claude-backed assistant that can search products, manage carts, answer policy questions, and handle orders — all via Shopify's Model Context Protocol (MCP).

### Two-component structure

1. **Backend** (`app/`) — A React Router v7 full-stack app. Handles Claude API streaming, MCP tool orchestration, OAuth/PKCE auth flows, and conversation persistence.
2. **Theme Extension** (`extensions/chat-bubble/`) — A Shopify theme block extension. Pure client-side JS/CSS that renders the chat UI and communicates with the backend over SSE.

### Request flow (chat message lifecycle)

```
Chat widget (chat.js)
  → POST /chat  with { message, conversation_id, prompt_type }
    → chat.jsx creates an SSE ReadableStream
      → Initializes MCPClient (connects to storefront + customer MCP servers)
      → Loads conversation history from SQLite
      → Enters agentic loop: calls Claude streaming API
        → Claude may emit tool_use blocks → callTool() dispatched to correct MCP server
        → Tool results fed back as tool_result messages
        → Loop continues until stop_reason === "end_turn"
      → Streams SSE events back: chunk, tool_use, product_results, end_turn, etc.
  ← Client renders streamed chunks in real time
```

### Key files and their roles

| File | Purpose |
|------|---------|
| `app/routes/chat.jsx` | Main chat endpoint. Orchestrates the Claude streaming loop with tool use. |
| `app/mcp-client.js` | MCPClient class. Manages JSON-RPC connections to Shopify's storefront and customer MCP servers. Dispatches tool calls to the right server. |
| `app/services/claude.server.js` | Wraps `@anthropic-ai/sdk` streaming. Routes requests through `proxy.shopify.ai`. Selects system prompt by type. |
| `app/services/tool.server.js` | Post-processes tool responses. Extracts product cards from `search_shop_catalog` results. Handles auth-required errors. |
| `app/services/streaming.server.js` | SSE stream primitives: `createSseStream` wraps a handler into a `ReadableStream`, `createStreamManager` provides `sendMessage`/`sendError`/`closeStream`. |
| `app/services/config.server.js` | Centralized config: model name (`claude-3-5-sonnet-latest`), max tokens, prompt defaults, tool names. Change these rather than scattering values. |
| `app/db.server.js` | All Prisma database access. Conversation/message persistence, customer token storage, PKCE code verifier storage, customer account URL caching. |
| `app/auth.server.js` | PKCE flow: generates code verifier/challenge, constructs the Shopify Customer Account authorization URL. |
| `app/shopify.server.js` | Shopify app bootstrap. Uses `@shopify/shopify-app-react-router` with Prisma session storage. API version: October 2025. |
| `app/prompts/prompts.json` | System prompts keyed by type (`standardAssistant`, `enthusiasticAssistant`). The prompt type is selectable per-store via the theme extension settings and passed as `prompt_type` in the chat request body. |
| `app/routes/auth.callback.jsx` | OAuth callback. Extracts `conversationId` and `shopId` from the `state` param, exchanges code for token (with PKCE verifier), stores token, returns an auto-closing HTML page. |
| `app/routes/auth.token-status.jsx` | Polling endpoint. The chat widget polls this after showing an auth link; returns `authorized` once the token is stored. |
| `extensions/chat-bubble/blocks/chat-interface.liquid` | Liquid template for the chat block. Passes `promptType`, `welcomeMessage`, and `shopId` to client JS via `window.shopChatConfig`. Exposes theme editor settings for bubble color, welcome message, and prompt type. |
| `extensions/chat-bubble/assets/chat.js` | All client-side chat logic: SSE event parsing, message rendering (with basic Markdown), product card display, auth popup flow, token polling, mobile viewport handling. |
| `extensions/chat-bubble/assets/chat.css` | Chat widget styling. Desktop and mobile layouts, product cards, animations. |

### MCP tool routing

`MCPClient` maintains two tool lists populated at connection time:
- **Storefront tools** — fetched from `{shopDomain}/api/mcp` (unauthenticated). Covers product search, policies/FAQs, cart operations.
- **Customer tools** — fetched from the shop's customer account MCP endpoint (discovered via `/.well-known/customer-account-api`). Requires a customer OAuth token. Covers order status, returns.

When Claude requests a tool, `callTool()` checks which list the tool belongs to and routes accordingly. A 401 from the customer endpoint triggers the PKCE auth flow inline.

### Authentication — two separate flows

1. **Admin/app auth** — Standard Shopify OAuth handled by `@shopify/shopify-app-react-router`. Protects the admin routes (`app.*`). Sessions stored in SQLite via Prisma.
2. **Customer account auth** — PKCE-based OAuth for the Customer Account API. Initiated when a customer tool returns 401. The chat widget opens a popup → Shopify auth → callback stores token → widget polls `/auth/token-status` → resumes conversation. The `state` parameter encodes `conversationId-shopId` to thread the token back to the right conversation.

### Database

SQLite via Prisma (`prisma/schema.prisma`). Key models:

- `Session` — Shopify admin sessions (managed by the Shopify session storage adapter)
- `Conversation` / `Message` — Chat history. Messages store content as JSON strings (content blocks from Claude) or plain strings.
- `CustomerToken` — OAuth access tokens scoped to a conversation, with expiration tracking.
- `CodeVerifier` — Short-lived PKCE verifier records, deleted on retrieval.
- `CustomerAccountUrls` — Cached MCP/auth/token endpoint URLs per conversation (discovered once from `.well-known` endpoints).

### Environment variables

From `.env.example`:
- `CLAUDE_API_KEY` — Anthropic API key (requests go through `proxy.shopify.ai`)
- `SHOPIFY_API_KEY` — App client ID (also used as `client_id` in customer auth)
- `REDIRECT_URL` — OAuth callback URL for customer auth (must match what's registered in the app)

Additional env vars used in code but not in `.env.example`:
- `SHOPIFY_API_SECRET` — App secret for webhook verification
- `SHOPIFY_APP_URL` — Public URL of the app
- `SCOPES` — Comma-separated OAuth scopes
- `SHOP_CUSTOM_DOMAIN` — Optional custom domain

### Deployment

The app is deployed to Fly.io (`fly.toml`). SQLite is backed up continuously via Litestream (`litestream.yml`). The `Dockerfile` builds a production image: runs `setup` (prisma generate + migrate deploy) then `start` (react-router-serve).

### Adding a new system prompt

1. Add an entry to `app/prompts/prompts.json` under `systemPrompts` with a unique key.
2. Add a corresponding option in the `system_prompt` select setting in `extensions/chat-bubble/blocks/chat-interface.liquid` inside the `{% schema %}` block.
3. The key flows through `window.shopChatConfig.promptType` → POST body `prompt_type` → `claude.server.js` `getSystemPrompt()` automatically.

### Adding a new MCP tool

No backend code changes needed. MCP tools are discovered dynamically at connection time from the Shopify MCP servers. If a new tool is added to Shopify's storefront or customer MCP, it will appear in `mcpClient.tools` automatically and be made available to Claude. The only manual step would be updating the system prompt if you want to guide Claude on when/how to use it.
