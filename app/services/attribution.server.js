const ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch all orders created within a date range via Admin GraphQL (paginated).
 * Requires read_orders scope.
 */
export async function fetchOrdersForPeriod(admin, dateFrom, dateTo) {
  const query = `created_at:>='${dateFrom.toISOString()}' AND created_at:<='${dateTo.toISOString()}'`;
  const orders = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const variables = { query, first: 250, ...(after ? { after } : {}) };
    const response = await admin.graphql(
      `query GetOrders($query: String!, $first: Int!, $after: String) {
        orders(first: $first, query: $query, after: $after, sortKey: CREATED_AT) {
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
      }`,
      { variables }
    );
    const { data } = await response.json();
    const ordersPage = data?.orders;
    if (!ordersPage) break;
    for (const edge of ordersPage.edges) {
      orders.push(edge.node);
    }
    hasNextPage = ordersPage.pageInfo.hasNextPage;
    after = ordersPage.pageInfo.endCursor;
  }

  return orders;
}

/**
 * Match orders to conversations by IP within the attribution window.
 * A conversation "gets credit" for an order if:
 *   - conversation.buyerIp === order.clientIp (non-null)
 *   - order was placed within ATTRIBUTION_WINDOW_MS after the conversation started
 *
 * Returns { attributedOrders, totalRevenue, currencyCode, uniqueConversations }.
 */
export function matchOrdersToConversations(orders, conversations) {
  const ipToConversations = new Map();
  for (const conv of conversations) {
    if (!conv.buyerIp) continue;
    if (!ipToConversations.has(conv.buyerIp)) {
      ipToConversations.set(conv.buyerIp, []);
    }
    ipToConversations.get(conv.buyerIp).push(conv);
  }

  const attributedOrders = [];
  const attributedConversationIds = new Set();

  for (const order of orders) {
    if (!order.clientIp) continue;
    const matchingConvs = ipToConversations.get(order.clientIp);
    if (!matchingConvs) continue;

    const orderTime = new Date(order.createdAt).getTime();
    const matched = matchingConvs.some((conv) => {
      const convTime = new Date(conv.createdAt).getTime();
      return orderTime >= convTime && orderTime <= convTime + ATTRIBUTION_WINDOW_MS;
    });

    if (matched) {
      attributedOrders.push(order);
      for (const conv of matchingConvs) {
        const convTime = new Date(conv.createdAt).getTime();
        if (orderTime >= convTime && orderTime <= convTime + ATTRIBUTION_WINDOW_MS) {
          attributedConversationIds.add(conv.id);
        }
      }
    }
  }

  let totalRevenue = 0;
  let currencyCode = "USD";
  for (const order of attributedOrders) {
    const money = order.totalPriceSet?.shopMoney;
    if (money) {
      totalRevenue += parseFloat(money.amount) || 0;
      currencyCode = money.currencyCode;
    }
  }

  return {
    attributedOrders,
    attributedOrderCount: attributedOrders.length,
    totalRevenue,
    currencyCode,
    uniqueConversations: attributedConversationIds.size,
  };
}

/**
 * Fetch store-wide session and conversion data via ShopifyQL.
 * Requires read_analytics scope.
 * Returns { sessions, conversionRate } where conversionRate is 0–1.
 */
export async function fetchStoreConversionRate(admin, dateFrom, dateTo) {
  const since = dateFrom.toISOString().slice(0, 10);
  const until = dateTo.toISOString().slice(0, 10);

  try {
    const response = await admin.graphql(`
      {
        shopifyqlQuery(query: "FROM sessions SHOW sessions, orders_placed SINCE '${since}' UNTIL '${until}' TIMEZONE 'UTC'") {
          parseErrors
          tableData {
            rows
            columns { name }
          }
        }
      }
    `);

    const json = await response.json();
    console.log("[analytics] ShopifyQL raw response:", JSON.stringify(json).slice(0, 1000));

    const result = json?.data?.shopifyqlQuery;
    if (!result) {
      console.log("[analytics] ShopifyQL: no result, errors:", JSON.stringify(json?.errors));
      return { sessions: 0, conversionRate: null };
    }
    if (result.parseErrors?.length) {
      console.log("[analytics] ShopifyQL parseErrors:", result.parseErrors);
      return { sessions: 0, conversionRate: null };
    }
    if (!result.tableData) {
      console.log("[analytics] ShopifyQL: no tableData");
      return { sessions: 0, conversionRate: null };
    }

    const cols = result.tableData.columns.map((c) => c.name);
    const rows = result.tableData.rows;
    console.log("[analytics] ShopifyQL columns:", cols, "rows:", JSON.stringify(rows).slice(0, 300));

    const sessionsIdx = cols.findIndex((c) => c === "sessions");
    const ordersIdx = cols.findIndex((c) => c === "orders_placed");
    if (sessionsIdx === -1) {
      console.log("[analytics] 'sessions' column not found in", cols);
      return { sessions: 0, conversionRate: null };
    }

    let totalSessions = 0;
    let totalOrders = 0;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (Array.isArray(row)) {
          totalSessions += parseFloat(row[sessionsIdx]) || 0;
          if (ordersIdx !== -1) totalOrders += parseFloat(row[ordersIdx]) || 0;
        } else if (row && typeof row === "object") {
          totalSessions += parseFloat(row.sessions ?? row[cols[sessionsIdx]]) || 0;
          if (ordersIdx !== -1) totalOrders += parseFloat(row.orders_placed ?? row[cols[ordersIdx]]) || 0;
        }
      }
    }

    console.log("[analytics] sessions=%d orders=%d", totalSessions, totalOrders);
    const conversionRate = totalSessions > 0 ? totalOrders / totalSessions : 0;
    return { sessions: Math.round(totalSessions), conversionRate };
  } catch (err) {
    console.error("[analytics] fetchStoreConversionRate error:", err?.message ?? err);
    return { sessions: 0, conversionRate: null };
  }
}

/**
 * Compute store-wide order metrics for the same period (for AOV comparison).
 */
export function computeStoreMetrics(orders) {
  let totalRevenue = 0;
  let currencyCode = "USD";
  for (const order of orders) {
    const money = order.totalPriceSet?.shopMoney;
    if (money) {
      totalRevenue += parseFloat(money.amount) || 0;
      currencyCode = money.currencyCode;
    }
  }
  const aov = orders.length > 0 ? totalRevenue / orders.length : 0;
  return { totalOrders: orders.length, totalRevenue, aov, currencyCode };
}
