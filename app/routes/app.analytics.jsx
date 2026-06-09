import { useState, useEffect } from "react";
import { useLoaderData, useNavigate, useNavigation } from "react-router";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { authenticate } from "../shopify.server";
import { getAnalyticsSummary, getAnalyticsTimeSeries } from "../utils/analytics.server";
import { fetchOrdersForPeriod, matchOrdersToConversations, computeStoreMetrics } from "../services/attribution.server";
import prisma from "../db.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  TextField,
  Button,
  Divider,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);

  const defaultDateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const defaultDateTo = new Date();

  const dateFrom = url.searchParams.get("dateFrom")
    ? new Date(url.searchParams.get("dateFrom"))
    : defaultDateFrom;
  const dateTo = url.searchParams.get("dateTo")
    ? new Date(url.searchParams.get("dateTo"))
    : defaultDateTo;
  dateTo.setHours(23, 59, 59, 999);

  const dateFromStr = dateFrom.toISOString().slice(0, 10);
  const dateToStr = dateTo.toISOString().slice(0, 10);

  const [summary, timeSeries, allOrders, conversations] = await Promise.all([
    getAnalyticsSummary(undefined, dateFrom, dateTo),
    getAnalyticsTimeSeries(undefined, dateFrom, dateTo),
    fetchOrdersForPeriod(admin, dateFrom, dateTo).catch(() => []),
    prisma.conversation.findMany({
      where: { createdAt: { gte: dateFrom, lte: dateTo } },
      select: { id: true, buyerIp: true, createdAt: true },
    }),
  ]);

  const attribution = matchOrdersToConversations(allOrders, conversations);
  const storeMetrics = computeStoreMetrics(allOrders);

  const aiAov = attribution.attributedOrderCount > 0
    ? attribution.totalRevenue / attribution.attributedOrderCount
    : 0;

  return {
    summary,
    timeSeries,
    dateFromStr,
    dateToStr,
    attribution: {
      attributedOrderCount: attribution.attributedOrderCount,
      totalRevenue: attribution.totalRevenue,
      currencyCode: attribution.currencyCode,
      uniqueConversations: attribution.uniqueConversations,
      aiAov,
    },
    storeMetrics: {
      totalOrders: storeMetrics.totalOrders,
      totalRevenue: storeMetrics.totalRevenue,
      aov: storeMetrics.aov,
      currencyCode: storeMetrics.currencyCode,
    },
  };
};

// Recharts uses browser APIs — render only after mount to avoid SSR errors
function SparklineChart({ data, dataKey, color = "#2563eb" }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !data || data.length === 0) {
    return <div style={{ height: 80 }} />;
  }

  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" hide />
        <Tooltip
          contentStyle={{ fontSize: 12 }}
          formatter={(val) => [val, dataKey]}
          labelFormatter={(label) => label}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${dataKey})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function pct(numerator, denominator) {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatCurrency(amount, currencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function MetricCard({ title, value, secondaryValue, secondaryLabel, description, chartData, chartKey, chartColor, onSeeConversations }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start">
          <Text variant="headingSm" as="h3">{title}</Text>
          {secondaryLabel && (
            <Text variant="bodySm" tone="subdued">{secondaryLabel}</Text>
          )}
        </InlineStack>

        <InlineStack align="space-between" blockAlign="end">
          <Text variant="headingXl" as="p">{value}</Text>
          {secondaryValue && (
            <Text variant="headingLg" as="p" tone="success">{secondaryValue}</Text>
          )}
        </InlineStack>

        {description && (
          <Text variant="bodySm" tone="subdued">{description}</Text>
        )}

        <Divider />

        <SparklineChart data={chartData} dataKey={chartKey} color={chartColor} />

        {onSeeConversations && (
          <div>
            <Button variant="plain" onClick={onSeeConversations} size="slim">
              See conversations
            </Button>
          </div>
        )}
      </BlockStack>
    </Card>
  );
}

function StatCard({ title, value, secondaryValue, secondaryLabel, description }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start">
          <Text variant="headingSm" as="h3">{title}</Text>
          {secondaryLabel && (
            <Text variant="bodySm" tone="subdued">{secondaryLabel}</Text>
          )}
        </InlineStack>

        <InlineStack align="space-between" blockAlign="end">
          <Text variant="headingXl" as="p">{value}</Text>
          {secondaryValue && (
            <Text variant="headingLg" as="p" tone="success">{secondaryValue}</Text>
          )}
        </InlineStack>

        {description && (
          <Text variant="bodySm" tone="subdued">{description}</Text>
        )}
      </BlockStack>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <SkeletonPage title="Analytics">
      <Layout>
        <Layout.Section>
          <SkeletonDisplayText size="medium" />
        </Layout.Section>

        <Layout.Section>
          <Card>
            <InlineStack gap="400" blockAlign="end" wrap>
              <BlockStack gap="100">
                <SkeletonBodyText lines={1} />
                <SkeletonDisplayText size="small" />
              </BlockStack>
              <BlockStack gap="100">
                <SkeletonBodyText lines={1} />
                <SkeletonDisplayText size="small" />
              </BlockStack>
            </InlineStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 1, md: 3 }} gap="400">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <BlockStack gap="300">
                  <SkeletonBodyText lines={1} />
                  <SkeletonDisplayText size="large" />
                  <SkeletonBodyText lines={2} />
                  <Divider />
                  <SkeletonBodyText lines={3} />
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="200">
            <SkeletonDisplayText size="small" />
            <SkeletonBodyText lines={1} />
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 1, md: 3 }} gap="400">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <BlockStack gap="300">
                  <SkeletonBodyText lines={1} />
                  <SkeletonDisplayText size="large" />
                  <SkeletonBodyText lines={2} />
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}

export default function AnalyticsDashboard() {
  const loaderData = useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();

  const [localDateFrom, setLocalDateFrom] = useState(loaderData?.dateFromStr ?? "");
  const [localDateTo, setLocalDateTo] = useState(loaderData?.dateToStr ?? "");

  console.log("[analytics] nav.state:", navigation.state, "— skeleton fires:", navigation.state === "loading");
  if (navigation.state === "loading") return <AnalyticsSkeleton />;

  const { summary, timeSeries, dateFromStr, dateToStr, attribution, storeMetrics } = loaderData;

  function applyFilter() {
    const params = new URLSearchParams();
    if (localDateFrom) params.set("dateFrom", localDateFrom);
    if (localDateTo) params.set("dateTo", localDateTo);
    navigate(`/app/analytics?${params.toString()}`);
  }

  const convRate = pct(summary.addToCartConversations, summary.totalConversations);
  const pdpRate = pct(summary.pdpClickConversations, summary.totalConversations);
  const aiConversionRate = pct(attribution.attributedOrderCount, summary.totalConversations);
  const revenueSharePct = pct(attribution.totalRevenue, storeMetrics.totalRevenue);
  const orderSharePct = pct(attribution.attributedOrderCount, storeMetrics.totalOrders);

  const aovLift = storeMetrics.aov > 0
    ? Math.round(((attribution.aiAov - storeMetrics.aov) / storeMetrics.aov) * 100)
    : 0;
  const aovLiftStr = aovLift > 0 ? `+${aovLift}%` : aovLift < 0 ? `${aovLift}%` : "—";

  function seeConversations(metric) {
    navigate(`/app?dateFrom=${dateFromStr}&dateTo=${dateToStr}&metric=${metric}`);
  }

  return (
    <Page>
      <TitleBar title="Analytics" />

      <Layout>
        {/* Header */}
        <Layout.Section>
          <BlockStack gap="200">
            <Text variant="headingLg" as="h2">Here&rsquo;s how your AI Concierge assisted</Text>
          </BlockStack>
        </Layout.Section>

        {/* Date range filter */}
        <Layout.Section>
          <Card>
            <InlineStack gap="400" blockAlign="end" wrap>
              <TextField
                label="From"
                type="date"
                value={localDateFrom}
                onChange={setLocalDateFrom}
                autoComplete="off"
              />
              <TextField
                label="To"
                type="date"
                value={localDateTo}
                onChange={setLocalDateTo}
                autoComplete="off"
              />
              <div style={{ paddingTop: "22px" }}>
                <Button variant="primary" onClick={applyFilter}>Apply</Button>
              </div>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Engagement metric cards */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 1, md: 3 }} gap="400">
            <MetricCard
              title="Total conversations"
              value={summary.totalConversations}
              description="Chat sessions started in the selected period"
              chartData={timeSeries}
              chartKey="conversations"
              chartColor="#2563eb"
            />

            <MetricCard
              title="Add to cart"
              value={summary.addToCartCount}
              secondaryValue={convRate}
              secondaryLabel="Conversion rate"
              description="Times the bot called a cart mutation tool"
              chartData={timeSeries}
              chartKey="addToCart"
              chartColor="#16a34a"
              onSeeConversations={() => seeConversations("add_to_cart")}
            />

            <MetricCard
              title="Redirects to PDP"
              value={summary.pdpClickCount}
              secondaryValue={pdpRate}
              secondaryLabel="Conversion rate"
              description="Shoppers who clicked a product link in the chat"
              chartData={timeSeries}
              chartKey="pdpClicks"
              chartColor="#9333ea"
              onSeeConversations={() => seeConversations("pdp_click")}
            />
          </InlineGrid>
        </Layout.Section>

        {/* Revenue attribution section */}
        <Layout.Section>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h3">Order Attribution (IP-based, 24h window)</Text>
            <Text variant="bodySm" tone="subdued">
              Orders placed within 24 hours of a chat session from the same IP address
            </Text>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 1, md: 3 }} gap="400">
            <StatCard
              title="AI-assisted orders"
              value={attribution.attributedOrderCount}
              secondaryValue={orderSharePct}
              secondaryLabel="of all orders"
              description={`Out of ${storeMetrics.totalOrders} total orders in period`}
            />

            <StatCard
              title="AI-generated sales"
              value={formatCurrency(attribution.totalRevenue, attribution.currencyCode)}
              secondaryValue={revenueSharePct}
              secondaryLabel="of total revenue"
              description={`Store total: ${formatCurrency(storeMetrics.totalRevenue, storeMetrics.currencyCode)}`}
            />

            <StatCard
              title="AI session AOV"
              value={attribution.attributedOrderCount > 0
                ? formatCurrency(attribution.aiAov, attribution.currencyCode)
                : "—"}
              secondaryValue={attribution.attributedOrderCount > 0 ? aovLiftStr : undefined}
              secondaryLabel={attribution.attributedOrderCount > 0 ? "vs store avg" : undefined}
              description={`Store AOV: ${formatCurrency(storeMetrics.aov, storeMetrics.currencyCode)}`}
            />
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
