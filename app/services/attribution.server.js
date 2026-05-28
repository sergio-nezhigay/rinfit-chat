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
