import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { getCustomerToken, getCustomerAccountUrls, deleteCustomerToken } from "../db.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  TextField,
  Button,
  Banner,
  DataTable,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { result: null };
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const conversationId = (form.get("conversationId") || "").trim();

  if (!conversationId) {
    return { error: "Conversation ID is required" };
  }

  if (intent === "reset") {
    await deleteCustomerToken(conversationId);
    return { message: `Token deleted for ${conversationId}`, conversationId };
  }

  if (intent === "inspect") {
    const token = await getCustomerToken(conversationId);
    const urls = await getCustomerAccountUrls(conversationId);

    let tools = null;
    let toolsError = null;

    if (token && urls?.mcpApiUrl) {
      try {
        const rpcResponse = await fetch(urls.mcpApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token.accessToken,
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
        });
        const rpcData = await rpcResponse.json();
        tools = rpcData?.result?.tools ?? rpcData?.tools ?? null;
        if (!tools) toolsError = JSON.stringify(rpcData);
      } catch (err) {
        toolsError = err.message;
      }
    } else if (!token) {
      toolsError = "No valid token found for this conversation.";
    } else {
      toolsError = "No MCP endpoint URL cached for this conversation.";
    }

    return {
      conversationId,
      token: token
        ? { expiresAt: token.expiresAt.toISOString(), present: true }
        : { present: false },
      mcpApiUrl: urls?.mcpApiUrl ?? null,
      tools,
      toolsError,
    };
  }

  return { error: "Unknown intent" };
};

export default function McpDebugPage() {
  useLoaderData();
  const fetcher = useFetcher();
  const [conversationId, setConversationId] = useState("");

  const data = fetcher.data;
  const loading = fetcher.state !== "idle";

  const submit = (intent) => {
    const form = new FormData();
    form.set("intent", intent);
    form.set("conversationId", conversationId);
    fetcher.submit(form, { method: "post" });
  };

  return (
    <Page narrowWidth>
      <TitleBar title="MCP Debug — Order Auth" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Inspect customer token &amp; MCP tools</Text>
              <Text tone="subdued">
                Enter a conversation ID from the debug view or from the browser localStorage
                key <code>shopAiConversationId</code>.
              </Text>
              <TextField
                label="Conversation ID"
                value={conversationId}
                onChange={setConversationId}
                autoComplete="off"
                placeholder="conv-1234-abc…"
                monospaced
              />
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  onClick={() => submit("inspect")}
                  loading={loading && fetcher.formData?.get("intent") === "inspect"}
                  disabled={!conversationId}
                >
                  Inspect
                </Button>
                <Button
                  tone="critical"
                  onClick={() => submit("reset")}
                  loading={loading && fetcher.formData?.get("intent") === "reset"}
                  disabled={!conversationId}
                >
                  Reset auth (delete token)
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {data && (
          <Layout.Section>
            {data.error && <Banner tone="critical">{data.error}</Banner>}
            {data.message && <Banner tone="success">{data.message}</Banner>}

            {data.token && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">Token status</Text>
                  <InlineStack gap="200" align="start">
                    <Badge tone={data.token.present ? "success" : "critical"}>
                      {data.token.present ? "Valid token" : "No token"}
                    </Badge>
                    {data.token.present && (
                      <Text tone="subdued">Expires: {new Date(data.token.expiresAt).toLocaleString()}</Text>
                    )}
                  </InlineStack>
                  {data.mcpApiUrl && (
                    <Text tone="subdued" breakWord>MCP endpoint: {data.mcpApiUrl}</Text>
                  )}
                </BlockStack>
              </Card>
            )}

            {data.toolsError && (
              <Banner tone="warning">
                <Text>Could not fetch tools: {data.toolsError}</Text>
              </Banner>
            )}

            {data.tools && data.tools.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">
                    Customer MCP tools ({data.tools.length})
                  </Text>
                  <DataTable
                    columnContentTypes={["text", "text"]}
                    headings={["Tool name", "Description"]}
                    rows={data.tools.map((t) => [
                      <Text key={t.name} variant="bodyMd" fontWeight="semibold">{t.name}</Text>,
                      <Text key={t.name + "_desc"} tone="subdued">{t.description ?? "—"}</Text>,
                    ])}
                  />
                </BlockStack>
              </Card>
            )}

            {data.tools && data.tools.length === 0 && (
              <Banner tone="warning">tools/list returned an empty array.</Banner>
            )}
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
