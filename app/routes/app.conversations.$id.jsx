import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { getConversationWithMessages } from "../db.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request, params }) => {
  await authenticate.admin(request);

  const conversation = await getConversationWithMessages(params.id);

  if (!conversation) {
    throw new Response("Conversation not found", { status: 404 });
  }

  return { conversation };
};

function parseContent(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        text: parsed
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n"),
        hasToolUse: parsed.some((b) => b.type !== "text"),
      };
    }
    return { text: String(parsed), hasToolUse: false };
  } catch {
    return { text: raw, hasToolUse: false };
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${day}.${month}.${year}, ${hours}:${minutes}:${seconds}`;
}

export default function ConversationDetail() {
  const { conversation } = useLoaderData();
  const navigate = useNavigate();

  return (
    <Page
      backAction={{ content: 'Conversations', onAction: () => navigate('/app') }}
      title="Conversation"
    >
      <TitleBar title="Conversation" />

      <Layout>
        <Layout.Section>
          {conversation.messages.length === 0 ? (
            <Text as="p">No messages in this conversation.</Text>
          ) : (
            <BlockStack gap="200">
              {conversation.messages.map((msg) => {
                const { text, hasToolUse } = parseContent(msg.content);
                const isUser = msg.role === "user";

                return (
                  <Card key={msg.id} background={isUser ? "bg-surface" : "bg-surface-secondary"}>
                    <BlockStack gap="100">
                      <InlineStack align="space-between">
                        <Text as="span" fontWeight="bold" tone={isUser ? "base" : "magic"}>
                          {isUser ? "Customer" : "Assistant"}
                        </Text>
                        <Text as="span" tone="subdued">{formatDate(msg.createdAt)}</Text>
                      </InlineStack>
                      {text && <Text as="p">{text}</Text>}
                      {hasToolUse && (
                        <Text as="p" tone="subdued">[tool call]</Text>
                      )}
                    </BlockStack>
                  </Card>
                );
              })}
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
