import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { listConversations } from "../db.server";

const PAGE_SIZE = 20;

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const { conversations, total } = await listConversations({ skip, take: PAGE_SIZE });
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return { conversations, total, page, totalPages };
};

function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

function truncateId(id) {
  return id.length > 16 ? `${id.slice(0, 16)}…` : id;
}

export default function ConversationsList() {
  const { conversations, total, page, totalPages } = useLoaderData();

  return (
    <s-page>
      <ui-title-bar title="Chat Conversations" />

      <s-section>
        <s-stack gap="base">
          <s-text>
            {total} conversation{total !== 1 ? "s" : ""} total
          </s-text>

          {conversations.length === 0 ? (
            <s-paragraph>No conversations yet.</s-paragraph>
          ) : (
            <s-stack gap="tight">
              {conversations.map((conv) => (
                <s-box key={conv.id} padding="base" background="subdued">
                  <s-stack direction="horizontal" align="space-between">
                    <s-stack gap="extra-tight">
                      <s-link href={`/app/conversations/${conv.id}`}>
                        <s-text tone="emphasis">{truncateId(conv.id)}</s-text>
                      </s-link>
                      <s-text tone="subdued">
                        {conv._count.messages} message{conv._count.messages !== 1 ? "s" : ""}
                        {" · "}Updated {formatDate(conv.updatedAt)}
                      </s-text>
                    </s-stack>
                    <s-link href={`/app/conversations/${conv.id}`}>View →</s-link>
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          )}

          {totalPages > 1 && (
            <s-stack direction="horizontal" gap="base">
              {page > 1 ? (
                <s-link href={`/app?page=${page - 1}`}>← Previous</s-link>
              ) : (
                <s-text tone="subdued">← Previous</s-text>
              )}
              <s-text>
                Page {page} of {totalPages}
              </s-text>
              {page < totalPages ? (
                <s-link href={`/app?page=${page + 1}`}>Next →</s-link>
              ) : (
                <s-text tone="subdued">Next →</s-text>
              )}
            </s-stack>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
