import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getConversationWithMessages } from "../db.server";

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
  return new Date(dateString).toLocaleString();
}

export default function ConversationDetail() {
  const { conversation } = useLoaderData();

  return (
    <s-page>
      <ui-title-bar title="Conversation" />

      <s-section>
        <s-stack gap="base">
          <s-link href="/app">← Back to Conversations</s-link>

          <s-stack gap="extra-tight">
            <s-heading>Conversation details</s-heading>
            <s-text tone="subdued">ID: {conversation.id}</s-text>
            <s-text tone="subdued">Created: {formatDate(conversation.createdAt)}</s-text>
            <s-text tone="subdued">Updated: {formatDate(conversation.updatedAt)}</s-text>
            <s-text tone="subdued">
              {conversation.messages.length} message{conversation.messages.length !== 1 ? "s" : ""}
            </s-text>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Messages">
        {conversation.messages.length === 0 ? (
          <s-paragraph>No messages in this conversation.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {conversation.messages.map((msg) => {
              const { text, hasToolUse } = parseContent(msg.content);
              const isUser = msg.role === "user";

              return (
                <s-box
                  key={msg.id}
                  padding="base"
                  background={isUser ? "default" : "subdued"}
                >
                  <s-stack gap="extra-tight">
                    <s-stack direction="horizontal" align="space-between">
                      <s-text tone={isUser ? "emphasis" : "magic"}>
                        {isUser ? "Customer" : "Assistant"}
                      </s-text>
                      <s-text tone="subdued">{formatDate(msg.createdAt)}</s-text>
                    </s-stack>
                    {text && <s-paragraph>{text}</s-paragraph>}
                    {hasToolUse && (
                      <s-text tone="subdued">[tool call]</s-text>
                    )}
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
