import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  DataTable,
  Banner,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

// Scopes we declare in shopify.app.shop-chat-agent.toml
const REQUESTED_SCOPES = [
  "read_orders", "write_orders", "write_order_edits",
  "read_fulfillments", "write_fulfillments",
  "read_returns", "write_returns",
  "read_products", "write_products",
  "read_inventory", "write_inventory",
  "read_product_listings",
  "read_customers", "write_customers",
  "read_discounts", "write_discounts",
  "read_draft_orders", "write_draft_orders",
  "read_locations",
  "read_shipping",
  "read_analytics",
  "unauthenticated_read_product_listings",
  "unauthenticated_read_checkouts",
  "unauthenticated_write_checkouts",
  // customer_ scopes are separate (Customer Account API, not Admin API)
  "customer_read_customers", "customer_read_orders",
  "customer_read_store_credit_account_transactions",
  "customer_read_store_credit_accounts",
];

// Minimal read query to actually exercise each Admin API scope
const SCOPE_QUERIES = {
  read_orders:        `{ orders(first: 1) { edges { node { id name } } } }`,
  read_products:      `{ products(first: 1) { edges { node { id title } } } }`,
  read_customers:     `{ customers(first: 1) { edges { node { id email } } } }`,
  read_discounts:     `{ discountNodes(first: 1) { edges { node { id } } } }`,
  read_draft_orders:  `{ draftOrders(first: 1) { edges { node { id name } } } }`,
  read_locations:     `{ locations(first: 1) { edges { node { id name } } } }`,
  read_shipping:      `{ shippingProfiles(first: 1) { edges { node { id name } } } }`,
  read_inventory:     `{ inventoryItems(first: 1, query: "sku:*") { edges { node { id sku } } } }`,
  read_analytics:     `{ shopifyqlQuery(query: "FROM sales SINCE -7d UNTIL today SHOW total_sales") { parseErrors { code message } tableData { unformattedData { rows { key value } } } } }`,
  read_fulfillments:  `{ orders(first: 1) { edges { node { fulfillments { id status } } } } }`,
  read_returns:       `{ returns(first: 1) { edges { node { id status } } } }`,
};

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // ── 1. Single query: all currently granted scopes ──────────────────────────
  const grantedRes = await admin.graphql(`
    query CurrentScopes {
      currentAppInstallation {
        accessScopes { handle description }
      }
    }
  `);
  const grantedJson = await grantedRes.json();
  const grantedScopes = (
    grantedJson.data?.currentAppInstallation?.accessScopes ?? []
  ).map((s) => ({ handle: s.handle, description: s.description ?? "" }));
  const grantedHandles = new Set(grantedScopes.map((s) => s.handle));

  // ── 2. Cross-reference against declared scopes ─────────────────────────────
  const scopeStatus = REQUESTED_SCOPES.map((handle) => ({
    handle,
    granted: grantedHandles.has(handle),
  }));

  // Scopes granted but not in our toml (e.g. implicit ones Shopify adds)
  const bonus = grantedScopes.filter(
    (s) => !REQUESTED_SCOPES.includes(s.handle)
  );

  // ── 3. Live query tests for Admin API read scopes ──────────────────────────
  const queryResults = await Promise.all(
    Object.entries(SCOPE_QUERIES).map(async ([scope, query]) => {
      try {
        const res = await admin.graphql(`query ScopeProbe { ${query.slice(1, -1)} }`);
        const json = await res.json();
        if (json.errors?.length) {
          const msg = json.errors[0].message;
          const denied = /access denied|not authorized|requires.*scope/i.test(msg);
          return { scope, ok: false, denied, detail: msg };
        }
        return { scope, ok: true, detail: summarize(scope, json.data) };
      } catch (err) {
        return { scope, ok: false, denied: false, detail: err.message };
      }
    })
  );

  const granted = scopeStatus.filter((s) => s.granted).length;
  const missing = scopeStatus.filter((s) => !s.granted).length;

  return { scopeStatus, bonus, queryResults, granted, missing, total: scopeStatus.length };
};

function summarize(scope, data) {
  if (!data) return "no data";
  switch (scope) {
    case "read_orders":       return `${data.orders?.edges?.length ?? 0} order(s)`;
    case "read_products":     return data.products?.edges?.[0]?.node?.title ?? "0 products";
    case "read_customers":    return data.customers?.edges?.[0]?.node?.email ?? "0 customers";
    case "read_discounts":    return `${data.discountNodes?.edges?.length ?? 0} discount(s)`;
    case "read_draft_orders": return `${data.draftOrders?.edges?.length ?? 0} draft(s)`;
    case "read_locations":    return data.locations?.edges?.[0]?.node?.name ?? "0 locations";
    case "read_shipping":     return data.shippingProfiles?.edges?.[0]?.node?.name ?? "0 profiles";
    case "read_inventory":    return `${data.inventoryItems?.edges?.length ?? 0} item(s)`;
    case "read_fulfillments": {
      const f = data.orders?.edges?.[0]?.node?.fulfillments ?? [];
      return `${f.length} fulfillment(s) on latest order`;
    }
    case "read_returns":      return `${data.returns?.edges?.length ?? 0} return(s)`;
    case "read_analytics": {
      if (data.shopifyqlQuery?.parseErrors?.length) return `parse error: ${data.shopifyqlQuery.parseErrors[0].message}`;
      return `${data.shopifyqlQuery?.tableData?.unformattedData?.rows?.length ?? 0} row(s)`;
    }
    default: return "ok";
  }
}

export default function ScopeTest() {
  const { scopeStatus, bonus, queryResults, granted, missing, total } = useLoaderData();

  const scopeRows = scopeStatus.map(({ handle, granted: g }) => [
    <Text variant="bodyMd" as="span" fontWeight={g ? undefined : "semibold"}>{handle}</Text>,
    <Badge tone={g ? "success" : "critical"}>{g ? "Granted" : "Not granted"}</Badge>,
  ]);

  const bonusRows = bonus.map(({ handle, description }) => [
    handle,
    <Text variant="bodySm" tone="subdued" as="span">{description || "—"}</Text>,
  ]);

  const queryRows = queryResults.map(({ scope, ok, denied, detail }) => [
    scope,
    <Badge tone={ok ? "success" : denied ? "critical" : "warning"}>
      {ok ? "OK" : denied ? "Access denied" : "Error"}
    </Badge>,
    <Text variant="bodySm" tone={ok ? "subdued" : "critical"} as="span">{detail}</Text>,
  ]);

  return (
    <Page>
      <TitleBar title="Scope Test" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">

            {/* Summary banner */}
            {missing > 0 ? (
              <Banner title={`${missing} scope(s) not yet granted`} tone="warning">
                <Text as="p" variant="bodySm">
                  Scopes appear in the toml but aren't granted — the merchant needs to re-approve.
                  Re-deploy the app and re-install (or visit the Partner Dashboard install link) to trigger the permission prompt.
                </Text>
              </Banner>
            ) : (
              <Banner title="All declared scopes are granted" tone="success" />
            )}

            {/* Section 1: currentAppInstallation cross-reference */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Declared scopes vs granted</Text>
                  <InlineStack gap="200">
                    <Badge tone="success">{granted} granted</Badge>
                    {missing > 0 && <Badge tone="critical">{missing} missing</Badge>}
                    <Badge tone="info">{total} declared</Badge>
                  </InlineStack>
                </InlineStack>
                <Text variant="bodySm" tone="subdued" as="p">
                  Source: <code>currentAppInstallation {"{"} accessScopes {"{"} handle {"}"} {"}"}</code> — single query, no side effects.
                  <code>customer_*</code> scopes are Customer Account API scopes and won't appear here (they're verified separately).
                </Text>
              </BlockStack>
            </Card>
            <Card padding="0">
              <DataTable
                columnContentTypes={["text", "text"]}
                headings={["Scope handle", "Status"]}
                rows={scopeRows}
                hoverable
              />
            </Card>

            {bonus.length > 0 && (
              <>
                <Divider />
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Bonus: granted by Shopify (not in toml)</Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Shopify may grant implicit scopes not explicitly requested.
                    </Text>
                  </BlockStack>
                </Card>
                <Card padding="0">
                  <DataTable
                    columnContentTypes={["text", "text"]}
                    headings={["Scope handle", "Description"]}
                    rows={bonusRows}
                    hoverable
                  />
                </Card>
              </>
            )}

            <Divider />

            {/* Section 2: live query probes */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Live query probes</Text>
                <Text variant="bodySm" tone="subdued" as="p">
                  Each row runs a minimal read query to confirm the scope works end-to-end.
                  Write scopes can't be verified without mutations — if the matching read passes, write is configured too.
                  Empty results (0 items) are still a pass.
                </Text>
              </BlockStack>
            </Card>
            <Card padding="0">
              <DataTable
                columnContentTypes={["text", "text", "text"]}
                headings={["Scope", "Result", "Sample / error"]}
                rows={queryRows}
                hoverable
              />
            </Card>

          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
