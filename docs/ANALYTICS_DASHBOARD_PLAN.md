# Analytics Dashboard — Implementation Plan

## What We're Building

An admin-facing "Sales" analytics dashboard showing how the AI chat concierge impacted store metrics.
Embedded in the Shopify admin as a new `/app/analytics` route.

Visual reference: a 2×3 grid of metric cards, each with a headline number, secondary stat, description,
a sparkline time-series chart (current period + optional previous period), and a "See conversations" link.
Global controls: date range picker, "Compare to previous period" toggle.

---

## The 6 Metric Cards

| Card | Headline | Secondary | Description |
|------|----------|-----------|-------------|
| Conversion rate | % chat sessions → order | — | Conversations that ended in a purchase |
| AI-generated sales | $ revenue | % of total store revenue | Revenue from orders attributed to AI |
| AI-generated orders | order count | % of total store orders | Orders attributed to AI |
| AOV | avg $ per order | Lift vs store average | Average order value, AI-attributed orders only |
| Redirects to PDP | click count | conversion rate | Users guided to a product page by the bot |
| Add to cart | event count | conversion rate | Times bot called the add-to-cart tool |

---

## Attribution Model

- **Method:** IP address matching (V1 — pragmatic, not perfect)
- **Window:** 24 hours
- **Logic:** An order is "AI-attributed" if the Shopify order's `clientIp` matches a
  `Conversation.buyerIp` value **and** the order was created within 24 hours after the conversation started.
- **Shopify field:** `clientIp` on the GraphQL `Order` object (requires `read_orders` scope,
  must be approved in Partner Dashboard — this is the most common failure point).
- **IP capture:** Read from `CF-Connecting-IP` → `X-Forwarded-For` → `X-Real-IP` headers
  on every inbound chat request. Store on the `Conversation` row.
- **Known limitations:** Shared IPs (NAT, mobile carriers) can produce false positives.
  Treat as "probable" attribution, not confirmed. Upgrade path: customer ID matching or
  checkout pixel in a later version.

### "Percentage of total" calculation
Query Shopify Admin API for all orders in the same period to get the store-wide totals,
then divide AI-attributed value by store total.

### "Conversion rate" definition (simplified)
`AI-attributed orders ÷ unique conversations` — not divided by total store visitors
(visitor count requires Shopify Analytics API, out of scope for V1).

### "Lift" on AOV
`AI-attributed AOV ÷ store-average AOV` — store average comes from the same Admin API
order query used for percentage-of-total.

---

## Data Sources

### Already in your DB (mine from existing data)
- `Conversation` table — count of chat sessions per period
- `Message.content` — JSON array of Claude content blocks. Mine for:
  - `type: "tool_use"`, `name: "add_to_cart"` → add-to-cart events
  - `type: "product_results"` → bot returned product cards (proxy for PDP intent)

### Need to add to DB
1. `Conversation.buyerIp String?` — persist the client IP on conversation creation
2. `AnalyticsEvent` model — for frontend-tracked events (PDP link clicks)

### Shopify Admin API (new)
- Query `orders` with fields: `id`, `createdAt`, `clientIp`, `email`, `totalPriceSet`
- Use `admin.graphql()` pattern (already established in most Shopify app starters)
- Pagination: use cursor-based (`after`) for large stores; for V1, `first: 250` per request is fine

---

## DB Schema Changes

```prisma
model Conversation {
  id         String    @id
  shopDomain String?
  buyerIp    String?   // <-- ADD THIS
  messages   Message[]
  events     AnalyticsEvent[]
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}

model AnalyticsEvent {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  type           String       // "pdp_click"  (extend as needed)
  metadata       String?      // JSON string for extra data (productHandle, url, etc.)
  createdAt      DateTime     @default(now())

  @@index([conversationId])
  @@index([type, createdAt])
}
```

---

## New Files to Create

```
app/
  routes/
    app.analytics.jsx              — main dashboard route (loader + React component)
    app.analytics.conversations.jsx — filtered conversations list (reuses existing list logic)
    analytics.event.jsx             — public POST endpoint for frontend event tracking (no admin auth)
  services/
    attribution.server.js           — order fetch + IP matching logic
  utils/
    analytics.server.js             — aggregation query functions (Prisma)
    sparkline.jsx                   — reusable SVG sparkline component
```

Modify:
```
prisma/schema.prisma               — add buyerIp + AnalyticsEvent
app/db.server.js                   — update createOrUpdateConversation, add analytics query fns
app/routes/chat.jsx                — pass buyerIp to createOrUpdateConversation
app/routes/app._index.jsx          — add `metric` filter param for "See conversations" links
extensions/chat-bubble/assets/chat.js — add PDP click tracking
shopify.toml                       — add read_orders to scopes
```

---

## Implementation Steps (Phased — Test After Each)

---

### Step 1 — DB Schema + IP Persistence

**Goal:** Every new conversation stores the buyer's IP address.

**Changes:**
1. `prisma/schema.prisma`: Add `buyerIp String?` to `Conversation`. Add full `AnalyticsEvent` model.
2. Run `npx prisma migrate dev --name add_analytics`
3. `app/db.server.js`: Update `createOrUpdateConversation(conversationId, shopDomain, buyerIp?)`.
   On create: write `buyerIp`. On update: no-op (IP is set once at creation).
4. `app/routes/chat.jsx`: Extract buyer IP from request headers (CF-Connecting-IP first),
   pass to `createOrUpdateConversation`.
5. `shopify.toml`: Add `read_orders` to the `[access_scopes]` list.

**How to test:**
- Deploy. Start a new chat session on the storefront.
- SSH into server. Query DB: `SELECT id, buyerIp, createdAt FROM Conversation ORDER BY createdAt DESC LIMIT 5`
- Verify `buyerIp` is non-null.
- Confirm old conversations have `null` (no backfill needed).

---

### Step 2 — Frontend PDP Click Tracking

**Goal:** When a user clicks a product link inside the chat widget, record the event server-side.

**Changes:**
1. `extensions/chat-bubble/assets/chat.js`: Add a delegated click listener on the chat
   messages container. When a click target is `<a>` inside a product card (or any product
   link rendered by the bot), POST to `/analytics/event` with:
   ```json
   { "conversationId": "...", "type": "pdp_click", "metadata": { "url": "..." } }
   ```
2. `app/routes/analytics.event.jsx`: Public POST endpoint (no `authenticate.admin`).
   Reads JSON body, calls `recordAnalyticsEvent(conversationId, type, metadata)`.
3. `app/db.server.js`: Add `recordAnalyticsEvent` function.

**Notes:**
- The endpoint must be public (no Shopify auth) because the chat widget runs on the storefront.
- Rate-limit or validate `conversationId` exists to prevent spam if concerned.
- The product cards rendered by the bot have a known HTML structure — match your project's
  actual rendered class names/selectors.

**How to test:**
- Deploy. Open chat, trigger a product search, click a product link.
- Query DB: `SELECT * FROM AnalyticsEvent ORDER BY createdAt DESC LIMIT 5`
- Verify a row with `type = "pdp_click"` appears.

---

### Step 3 — Backend Aggregation Queries

**Goal:** All data-fetching logic is written and verified before building UI.

**Add to `app/db.server.js` (or a new `app/utils/analytics.server.js`):**

```js
// Returns aggregate counts for the dashboard summary cards
getAnalyticsSummary(shopDomain, dateFrom, dateTo)
// Returns:
// { totalConversations, addToCartCount, addToCartConversations,
//   pdpClickCount, pdpClickConversations }

// Returns daily breakdown for sparkline charts
getAnalyticsTimeSeries(shopDomain, dateFrom, dateTo)
// Returns array of { date: "YYYY-MM-DD", conversations, addToCart, pdpClicks }

// Returns conversation IDs matching a specific metric (for "See conversations" link)
getConversationIdsByMetric(shopDomain, metric, dateFrom, dateTo)
// metric: "add_to_cart" | "pdp_click" | "converted"
```

**Mining add_to_cart from messages:**
```js
// Prisma raw query — find messages containing tool_use blocks named "add_to_cart"
const msgs = await prisma.message.findMany({
  where: {
    conversation: { shopDomain },
    createdAt: { gte: dateFrom, lte: dateTo },
    content: { contains: '"add_to_cart"' }  // fast pre-filter
  }
})
// Then parse JSON and confirm tool_use block with name === "add_to_cart"
```

**Add to `app/services/attribution.server.js`:**
```js
// Fetches orders from Shopify Admin API for a date range
fetchOrdersForPeriod(admin, dateFrom, dateTo)

// Matches orders to conversations by IP within 24h window
matchOrdersToConversations(orders, conversations)
// Returns: { matchedOrders, totalRevenue, orderCount, aov }
```

**Create `app/routes/app.analytics.debug.jsx`** (temporary, delete after Step 5):
A loader-only JSON endpoint. Call `getAnalyticsSummary` and return the result so you
can verify numbers via browser without building the UI.

**How to test:**
- Deploy. Visit `/app/analytics/debug?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`
- Compare returned counts against what you can manually count in Prisma Studio.
- Verify `addToCartCount` matches by manually inspecting a known conversation's messages.

---

### Step 4 — Dashboard UI (Local Metrics Only — No Order Attribution Yet)

**Goal:** A working, styled dashboard showing the 3 local metrics. No Shopify API calls yet.

**`app/routes/app.analytics.jsx` loader:**
- `authenticate.admin(request)`
- Parse `dateFrom`, `dateTo` from URL params (default: last 30 days)
- Call `getAnalyticsSummary` + `getAnalyticsTimeSeries`
- Return data

**UI structure (Polaris):**
```jsx
<Page title="Analytics">
  <TitleBar title="Analytics" />
  <Layout>
    {/* Date range filter row */}
    <Layout.Section>
      <InlineStack gap="300">
        <TextField label="From" value={dateFrom} onChange={...} />
        <TextField label="To" value={dateTo} onChange={...} />
        <Button onClick={applyFilter}>Apply</Button>
      </InlineStack>
    </Layout.Section>

    {/* Metric cards grid */}
    <Layout.Section>
      <InlineGrid columns={3} gap="400">
        <MetricCard ... />
        <MetricCard ... />
        <MetricCard ... />
      </InlineGrid>
    </Layout.Section>
  </Layout>
</Page>
```

**`MetricCard` component:**
```jsx
function MetricCard({ title, value, secondaryValue, secondaryLabel, description, chartData, seeConversationsUrl }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between">
          <Text variant="headingSm">{title}</Text>
          <Text tone="subdued">{secondaryLabel}</Text>
        </InlineStack>
        <InlineStack align="space-between">
          <Text variant="headingLg">{value}</Text>
          <Text variant="headingMd" tone="success">{secondaryValue}</Text>
        </InlineStack>
        <Text tone="subdued">{description}</Text>
        <Sparkline data={chartData} />
        <Button variant="plain" url={seeConversationsUrl}>See conversations</Button>
      </BlockStack>
    </Card>
  )
}
```

**`Sparkline` SVG component:**
```jsx
// Simple path-based SVG line chart. No dependencies.
// Props: data (number[]), width, height, color
// Normalize values to SVG coordinate space, draw a <polyline> or <path>
// For two series (current + previous period), render two paths with different stroke styles
```

Cards visible in this step: **Add to cart** + **Redirects to PDP** + **Total conversations** (placeholder card).

**How to test:**
- Deploy. Visit `/app/analytics` in Shopify admin.
- Verify cards render with real numbers.
- Verify date filter changes the numbers.
- Verify "See conversations" links navigate to conversations list (filtered).
- Verify sparkline renders without errors (check browser console in Shopify admin iframe).

---

### Step 5 — Order Attribution + Revenue Metrics

**Prerequisites:** `read_orders` scope must be approved in Shopify Partner Dashboard.
Re-install or re-authorize the app after adding the scope.

**Changes:**
1. `app/routes/app.analytics.jsx` loader: destructure `admin` from `authenticate.admin(request)`.
   Call `fetchOrdersForPeriod(admin, dateFrom, dateTo)` and `matchOrdersToConversations(...)`.
   Also fetch store total orders/revenue for "percentage of total" calculations.
2. Add remaining metric cards: **Conversion rate**, **AI-generated sales**, **AI-generated orders**, **AOV**.

**Admin API query:**
```graphql
query GetOrders($query: String!, $after: String) {
  orders(first: 250, query: $query, after: $after, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        createdAt
        clientIp
        totalPriceSet { shopMoney { amount currencyCode } }
      }
    }
  }
}
```
Query string: `created_at:>=${dateFrom} created_at:<=${dateTo}`

**Matching logic:**
```js
function matchOrdersToConversations(orders, conversations) {
  // Build a map: ip -> list of conversation start times
  // For each order: find conversations with same IP where
  //   conversation.createdAt <= order.createdAt <= conversation.createdAt + 24h
  // Return matched order IDs + aggregate revenue
}
```

**How to test:**
- Place a test order in your store after starting a chat session (same browser/IP).
- Deploy. Visit dashboard for today's date range.
- Verify "AI-generated orders" = 1, "AI-generated sales" = order amount.
- If `clientIp` comes back null on orders → check scope is approved in Partner Dashboard.

---

### Step 6 — "See Conversations" Filter Links

**Goal:** Clicking "See conversations" on each card shows a filtered list of conversations.

**Changes:**
1. `app/routes/app._index.jsx` (or a new `app.analytics.conversations.jsx`):
   - Add `metric` URL param: `add_to_cart` | `pdp_click` | `converted`
   - Update the Prisma query to filter by metric:
     - `add_to_cart`: conversation IDs from `getConversationIdsByMetric`
     - `pdp_click`: conversation IDs that have `AnalyticsEvent` rows of type `pdp_click`
     - `converted`: conversation IDs matched by attribution logic
   - Show a banner at top: "Showing conversations with add-to-cart events"
2. `app/routes/app.analytics.jsx`: Set `seeConversationsUrl` on each card to
   `/app?metric=add_to_cart&dateFrom=...&dateTo=...` etc.

**How to test:**
- From dashboard, click "See conversations" on each card.
- Verify list shows only conversations matching that metric.
- Verify count in list matches the number on the dashboard card.

---

### Step 7 — Compare to Previous Period

**Goal:** Toggle shows previous period dashed line on sparklines and previous values on cards.

**Changes:**
1. `app/routes/app.analytics.jsx`:
   - Add `compare` boolean URL param.
   - When `compare=true`: calculate previous period dates (shift back by same number of days),
     run all queries again for the previous period.
   - Pass both current and previous series to `MetricCard`.
2. `Sparkline` component: accept optional `previousData` prop, render as dashed line.
3. `MetricCard`: show previous value below main value (subdued text).
4. Add toggle button to filter row: `<Button pressed={compare} onClick={toggleCompare}>Compare to previous period</Button>`

**How to test:**
- Select a date range with known data, toggle comparison on.
- Verify previous period dates are correct (same duration, immediately before selected period).
- Verify sparkline shows two lines.

---

## Polaris Component Notes

- Polaris v12 has no built-in chart components — use inline SVG for sparklines.
- `InlineGrid` (Polaris v12) is the correct component for a 3-column card grid, not `Grid`.
- `TitleBar` comes from `@shopify/app-bridge-react`, not `@shopify/polaris` — import separately.
- The filter-then-navigate pattern (local `useState` + `navigate(queryString)`) is the
  standard pattern for this codebase — don't use form submissions or fetchers for filters.
- Shopify admin runs the app in an iframe; avoid `window.location.href` redirects.
  Use React Router's `useNavigate` for internal navigation.

---

## Scopes Checklist

Add to `shopify.toml`:
```toml
[access_scopes]
scopes = "read_orders,..."   # add read_orders to existing scopes
```

Then in Shopify Partner Dashboard → App → Configuration → Protected customer data →
request access to `clientIp` / protected order data. Without this, `clientIp` returns `null`.

---

## V1 Limitations (Known, Document for Later)

| Limitation | Upgrade path |
|-----------|-------------|
| IP attribution = probabilistic | Add customer ID matching or checkout pixel |
| No real-time order data (poll on page load) | Add `orders/create` webhook |
| "Lift" metric omitted (needs total visitor count) | Integrate Shopify Analytics API |
| No product/category filters | Add filter dimensions to `AnalyticsEvent` |
| Sparklines are custom SVG | Swap for `@shopify/polaris-viz` |
| Orders query loads max 250/request | Add cursor pagination for high-volume stores |

---

## Original Feature Request & Decision Log

This section records the original request, the clarifying questions asked, and the answers given.
Use it as the authoritative source of why specific decisions were made.

### Original Request

Build an analytics "Sales" dashboard in the Shopify admin for the AI chat concierge.
Reference design: a 2×3 grid of metric cards, each with headline number, secondary stat,
line chart sparkline, and a "See conversations" link.
Global controls: date range filter, "Compare to previous period" toggle, Filters button.

The dashboard title: **"Here's how your AI Concierge assisted"**

### Decisions Made (Q&A)

**Q: How do we attribute sales to the AI?**
A: Option (b) — any customer who chatted and then placed an order within 24 hours.
Attribution window: **24 hours**.

**Q: Webhook vs Admin API for order data?**
A: No webhooks currently exist. Research conclusion: **query Admin API on demand** (simpler,
sufficient for a historical dashboard that shows date ranges rather than real-time data).
Webhooks can be added later for real-time use cases.

**Q: How do we correlate anonymous chat sessions to orders?**
A: Customers mostly do not log in to chat. Research conclusion: use **IP address matching**
(`buyerIp` on `Conversation` ↔ `clientIp` on Shopify `Order`). The IP is already captured
in the chat request handler but was not being persisted — a one-field schema addition fixes this.
Known limitation: NAT/shared IPs can produce false positives. Acceptable for V1.

**Q: Redirect to PDP — count clicks or count bot responses with product cards?**
A: **Track actual clicks** (more accurate). Add a click event listener in the chat frontend
that POSTs to a server-side tracking endpoint when a product link is clicked.

**Q: Conversion rate baseline — vs total store visitors or vs total chat users?**
A: Use **chat users as the denominator**: `AI-attributed orders ÷ total unique conversations`.
(Total store visitor count requires Shopify Analytics API, out of scope for V1.)

**Q: AOV "Lift" — AI-attributed AOV vs store average AOV?**
A: Yes. Lift = `AI-attributed AOV ÷ store-average AOV`.
Store average comes from the same Admin API order query used for percentage-of-total.

**Q: "Percentage of total" — percentage of ALL store sales/orders?**
A: Yes. Divide AI-attributed revenue/order-count by total store revenue/orders in the same period.

**Q: Charts library preference?**
A: Use Polaris components where possible. Use fresh, real components — Shopify admin is a
strict iframe environment. Conclusion: Polaris v12 has no chart components, so use
**lightweight inline SVG sparklines** (zero new dependencies, always works in Shopify admin).
Upgrade path to `@shopify/polaris-viz` documented in V1 Limitations.

**Q: "Platform: Web" filter — relevant?**
A: Not relevant. Only web traffic exists. Omit the platform filter entirely.

**Q: Filters button — what does it filter?**
A: Keep it as simple as possible for V1. Date range is the only filter.

**Q: "See conversations" link behavior?**
A: Navigate to the conversations list page filtered to show only conversations relevant
to that metric (e.g. conversations that had an add-to-cart event, or that were attributed
to an order).

**Q: First phase — OK to start with only local-DB metrics (no order attribution)?**
A: Yes. Ship what we have, add order attribution in a later step.

### General Instruction

> "If some functionality demands a complicated implementation, prefer for now some optimal,
> maybe a bit downgraded V1 which could be upgraded in next versions."

This guided the following trade-offs:
- IP attribution over checkout pixels or customer ID matching
- Admin API polling over webhooks
- SVG sparklines over polaris-viz
- Date-only filter over product/category filters
- No "Lift" on conversion rate (would need Shopify Analytics API)
