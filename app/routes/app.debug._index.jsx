import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { listDebugConversations } from "../db.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  IndexTable,
  Text,
  Badge,
  TextField,
  Button,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

const PAGE_SIZE = 20;

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const shopFilter = url.searchParams.get("shop") || "";
  const skip = (page - 1) * PAGE_SIZE;

  const { conversations, total } = await listDebugConversations({
    skip,
    take: PAGE_SIZE,
    shopDomain: shopFilter || undefined,
  });
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return { conversations, total, page, totalPages, shopFilter };
};

function formatDate(dateString) {
  const d = new Date(dateString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DebugConversationsList() {
  const { conversations, page, totalPages, shopFilter } = useLoaderData();
  const navigate = useNavigate();
  const [shopInput, setShopInput] = useState(shopFilter);

  const applyFilter = () => {
    const params = new URLSearchParams();
    if (shopInput) params.set("shop", shopInput);
    params.set("page", "1");
    navigate(`/app/debug?${params.toString()}`);
  };

  const clearFilter = () => {
    setShopInput("");
    navigate("/app/debug");
  };

  const rowMarkup = conversations.map((conv, index) => {
    const errorCount = conv.messages.length; // only isError=true messages were fetched

    return (
      <IndexTable.Row
        id={conv.id}
        key={conv.id}
        position={index}
        onClick={() => navigate(`/app/debug/${conv.id}`)}
      >
        <IndexTable.Cell>
          <Text variant="bodySm" tone="subdued" as="span">
            {conv.shopDomain || "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {formatDate(conv.updatedAt)}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span" tone="subdued">
            {conv._count.messages}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {errorCount > 0 ? (
            <Badge tone="critical">{String(errorCount)}</Badge>
          ) : (
            <Text variant="bodyMd" as="span" tone="subdued">
              0
            </Text>
          )}
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page>
      <TitleBar title="Debug — Conversations" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <InlineStack gap="200">
                <Button url="/app/debug/mcp" variant="plain">MCP Auth Debug →</Button>
              </InlineStack>
            </Card>
            <Card>
              <InlineStack gap="300" blockAlign="end">
                <div style={{ flexGrow: 1 }}>
                  <TextField
                    label="Filter by shop domain"
                    value={shopInput}
                    onChange={setShopInput}
                    placeholder="e.g. mystore.myshopify.com"
                    autoComplete="off"
                    onKeyDown={(e) => e.key === "Enter" && applyFilter()}
                  />
                </div>
                <Button onClick={applyFilter}>Apply</Button>
                {shopFilter && (
                  <Button variant="plain" onClick={clearFilter}>
                    Clear
                  </Button>
                )}
              </InlineStack>
            </Card>

            <Card padding="0">
              <IndexTable
                resourceName={{ singular: "conversation", plural: "conversations" }}
                itemCount={conversations.length}
                headings={[
                  { title: "Shop" },
                  { title: "Last Updated" },
                  { title: "Messages" },
                  { title: "Errors" },
                ]}
                selectable={false}
                pagination={{
                  hasNext: page < totalPages,
                  hasPrevious: page > 1,
                  onNext: () =>
                    navigate(
                      `/app/debug?page=${page + 1}${shopFilter ? `&shop=${encodeURIComponent(shopFilter)}` : ""}`,
                    ),
                  onPrevious: () =>
                    navigate(
                      `/app/debug?page=${page - 1}${shopFilter ? `&shop=${encodeURIComponent(shopFilter)}` : ""}`,
                    ),
                }}
              >
                {rowMarkup}
              </IndexTable>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
