import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getAnalyticsSummary, getAnalyticsTimeSeries, getConversationIdsByMetric } from "../utils/analytics.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get("dateFrom")
    ? new Date(url.searchParams.get("dateFrom"))
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dateTo = url.searchParams.get("dateTo")
    ? new Date(url.searchParams.get("dateTo"))
    : new Date();
  dateTo.setHours(23, 59, 59, 999);

  const shopDomain = url.searchParams.get("shopDomain") || undefined;

  const [summary, timeSeries, cartConvIds, pdpConvIds] = await Promise.all([
    getAnalyticsSummary(shopDomain, dateFrom, dateTo),
    getAnalyticsTimeSeries(shopDomain, dateFrom, dateTo),
    getConversationIdsByMetric(shopDomain, "add_to_cart", dateFrom, dateTo),
    getConversationIdsByMetric(shopDomain, "pdp_click", dateFrom, dateTo),
  ]);

  return {
    period: { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString(), shopDomain: shopDomain || null },
    summary,
    cartConversationIds: cartConvIds,
    pdpConversationIds: pdpConvIds,
    timeSeries,
  };
};

export default function AnalyticsDebug() {
  const data = useLoaderData();
  return (
    <pre style={{ padding: "24px", fontSize: "13px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
