import prisma from "../db.server";

const CART_TOOL_NAMES = new Set([
  "add_to_cart", "clear_cart", "empty_cart",
  "remove_cart", "remove_from_cart", "set_cart", "update_cart",
]);

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

// Returns true if the message content JSON contains a cart mutation tool_use block
function hasCartToolUse(content) {
  let blocks;
  try { blocks = JSON.parse(content); } catch { return false; }
  if (!Array.isArray(blocks)) return false;
  return blocks.some((b) => b.type === "tool_use" && CART_TOOL_NAMES.has(b.name));
}

// Fetch conversation IDs for a shop/period (step 1 of two-step queries)
async function getConversationIds(shopDomain, dateFrom, dateTo) {
  const rows = await prisma.conversation.findMany({
    where: {
      ...(shopDomain ? { shopDomain } : {}),
      createdAt: { gte: dateFrom, lte: dateTo },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Returns aggregate counts for the dashboard summary cards.
 */
export async function getAnalyticsSummary(shopDomain, dateFrom, dateTo) {
  const convIds = await getConversationIds(shopDomain, dateFrom, dateTo);

  if (convIds.length === 0) {
    return { totalConversations: 0, addToCartCount: 0, addToCartConversations: 0, pdpClickCount: 0, pdpClickConversations: 0 };
  }

  const [cartMessages, pdpEvents] = await Promise.all([
    prisma.message.findMany({
      where: {
        conversationId: { in: convIds },
        role: "assistant",
        OR: [...CART_TOOL_NAMES].map((name) => ({ content: { contains: `"${name}"` } })),
      },
      select: { content: true, conversationId: true },
    }),

    prisma.analyticsEvent.findMany({
      where: {
        type: "pdp_click",
        conversationId: { in: convIds },
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      select: { conversationId: true },
    }),
  ]);

  const cartConversationIds = new Set();
  let addToCartCount = 0;
  for (const msg of cartMessages) {
    if (hasCartToolUse(msg.content)) {
      addToCartCount++;
      cartConversationIds.add(msg.conversationId);
    }
  }

  const pdpConversationIds = new Set(pdpEvents.map((e) => e.conversationId));

  return {
    totalConversations: convIds.length,
    addToCartCount,
    addToCartConversations: cartConversationIds.size,
    pdpClickCount: pdpEvents.length,
    pdpClickConversations: pdpConversationIds.size,
  };
}

/**
 * Returns a daily time series for sparkline charts.
 * Each entry: { date: "YYYY-MM-DD", conversations, addToCart, pdpClicks }
 */
export async function getAnalyticsTimeSeries(shopDomain, dateFrom, dateTo) {
  const [conversations, convIds] = await (async () => {
    const rows = await prisma.conversation.findMany({
      where: {
        ...(shopDomain ? { shopDomain } : {}),
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      select: { id: true, createdAt: true },
    });
    return [rows, rows.map((r) => r.id)];
  })();

  const [cartMessages, pdpEvents] = convIds.length === 0
    ? [[], []]
    : await Promise.all([
        prisma.message.findMany({
          where: {
            conversationId: { in: convIds },
            role: "assistant",
            OR: [...CART_TOOL_NAMES].map((name) => ({ content: { contains: `"${name}"` } })),
          },
          select: { content: true, createdAt: true },
        }),

        prisma.analyticsEvent.findMany({
          where: {
            type: "pdp_click",
            conversationId: { in: convIds },
            createdAt: { gte: dateFrom, lte: dateTo },
          },
          select: { createdAt: true },
        }),
      ]);

  // Build date buckets covering the full range
  const buckets = {};
  const cursor = new Date(dateFrom);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(dateTo);
  end.setHours(23, 59, 59, 999);
  while (cursor <= end) {
    buckets[toDateStr(cursor)] = { date: toDateStr(cursor), conversations: 0, addToCart: 0, pdpClicks: 0 };
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const c of conversations) {
    const d = toDateStr(new Date(c.createdAt));
    if (buckets[d]) buckets[d].conversations++;
  }

  for (const msg of cartMessages) {
    if (!hasCartToolUse(msg.content)) continue;
    const d = toDateStr(new Date(msg.createdAt));
    if (buckets[d]) buckets[d].addToCart++;
  }

  for (const ev of pdpEvents) {
    const d = toDateStr(new Date(ev.createdAt));
    if (buckets[d]) buckets[d].pdpClicks++;
  }

  return Object.values(buckets);
}

/**
 * Returns conversation IDs matching a specific metric, for "See conversations" links.
 * metric: "add_to_cart" | "pdp_click"
 */
export async function getConversationIdsByMetric(shopDomain, metric, dateFrom, dateTo) {
  const convIds = await getConversationIds(shopDomain, dateFrom, dateTo);
  if (convIds.length === 0) return [];

  if (metric === "add_to_cart") {
    const msgs = await prisma.message.findMany({
      where: {
        conversationId: { in: convIds },
        role: "assistant",
        OR: [...CART_TOOL_NAMES].map((name) => ({ content: { contains: `"${name}"` } })),
      },
      select: { content: true, conversationId: true },
    });
    const ids = new Set();
    for (const msg of msgs) {
      if (hasCartToolUse(msg.content)) ids.add(msg.conversationId);
    }
    return [...ids];
  }

  if (metric === "pdp_click") {
    const events = await prisma.analyticsEvent.findMany({
      where: {
        type: "pdp_click",
        conversationId: { in: convIds },
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      select: { conversationId: true },
    });
    return [...new Set(events.map((e) => e.conversationId))];
  }

  return [];
}
