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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
      const text = parsed
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const products = parsed.find((b) => b.type === "product_results")?.products || [];
      const hasToolUse = parsed.some((b) => b.type !== "text" && b.type !== "product_results");
      
      return { text, products, hasToolUse };
    }
    return { text: String(parsed), products: [], hasToolUse: false };
  } catch {
    return { text: raw, products: [], hasToolUse: false };
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${day}.${month}.${year}, ${hours}:${minutes}:${seconds}`;
}

/** Minimal inline styles so markdown elements look reasonable inside Polaris cards */
const mdStyles = {
  wrapper: {
    fontSize: "var(--p-font-size-325, 14px)",
    lineHeight: "var(--p-line-height-500, 1.6)",
    color: "var(--p-color-text, #202223)",
    wordBreak: "break-word",
  },
  table: {
    borderCollapse: "collapse",
    width: "100%",
    marginBottom: "0.75em",
    fontSize: "0.9em",
  },
  th: {
    border: "1px solid var(--p-color-border, #c9cccf)",
    padding: "6px 10px",
    background: "var(--p-color-bg-surface-secondary, #f6f6f7)",
    textAlign: "left",
    fontWeight: 600,
  },
  td: {
    border: "1px solid var(--p-color-border, #c9cccf)",
    padding: "6px 10px",
  },
  productGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "12px",
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: "1px solid var(--p-color-border-subdued, #ebebeb)",
  },
  productCard: {
    border: "1px solid var(--p-color-border-subdued, #ebebeb)",
    borderRadius: "8px",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    background: "var(--p-color-bg-surface, #ffffff)",
  },
  productImage: {
    width: "100%",
    aspectRatio: "1/1",
    objectFit: "contain",
    background: "#f9f9f9",
  },
  productInfo: {
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flexGrow: 1,
  },
  productTitle: {
    fontSize: "12px",
    fontWeight: "600",
    lineHeight: "1.3",
    color: "var(--p-color-text, #202223)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    textDecoration: "none",
  },
  productPrice: {
    fontSize: "12px",
    color: "var(--p-color-text-secondary, #6d7175)",
  },
};

/** Polaris-friendly component map for react-markdown */
const markdownComponents = {
  p: ({ children }) => (
    <p style={{ margin: "0 0 0.5em 0" }}>{children}</p>
  ),
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--p-color-text-emphasis, #2c6ecb)" }}
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h1 style={{ fontSize: "1.2em", fontWeight: 700, margin: "0.6em 0 0.3em" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontSize: "1.1em", fontWeight: 700, margin: "0.6em 0 0.3em" }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontSize: "1em", fontWeight: 700, margin: "0.5em 0 0.3em" }}>
      {children}
    </h3>
  ),
  ul: ({ children }) => (
    <ul style={{ paddingLeft: "1.4em", margin: "0.3em 0 0.5em" }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ paddingLeft: "1.4em", margin: "0.3em 0 0.5em" }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ marginBottom: "0.15em" }}>{children}</li>,
  code: ({ inline, children }) =>
    inline ? (
      <code
        style={{
          background: "var(--p-color-bg-surface-secondary, #f6f6f7)",
          padding: "1px 5px",
          borderRadius: "3px",
          fontSize: "0.88em",
          fontFamily: "monospace",
        }}
      >
        {children}
      </code>
    ) : (
      <pre
        style={{
          background: "var(--p-color-bg-surface-secondary, #f6f6f7)",
          padding: "10px 14px",
          borderRadius: "6px",
          overflowX: "auto",
          fontSize: "0.88em",
          fontFamily: "monospace",
          margin: "0.4em 0",
        }}
      >
        <code>{children}</code>
      </pre>
    ),
  table: ({ children }) => (
    <div style={{ overflowX: "auto", margin: "0.5em 0" }}>
      <table style={mdStyles.table}>{children}</table>
    </div>
  ),
  th: ({ children }) => <th style={mdStyles.th}>{children}</th>,
  td: ({ children }) => <td style={mdStyles.td}>{children}</td>,
  hr: () => (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid var(--p-color-border, #c9cccf)",
        margin: "0.75em 0",
      }}
    />
  ),
  blockquote: ({ children }) => (
    <blockquote
      style={{
        borderLeft: "3px solid var(--p-color-border-emphasis, #8c9196)",
        margin: "0.4em 0",
        paddingLeft: "0.8em",
        color: "var(--p-color-text-secondary, #6d7175)",
      }}
    >
      {children}
    </blockquote>
  ),
};

function AssistantMessageBody({ text, products }) {
  return (
    <BlockStack gap="200">
      {text && (
        <div style={mdStyles.wrapper}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {text}
          </ReactMarkdown>
        </div>
      )}
      
      {products && products.length > 0 && (
        <div>
          <Text as="h4" variant="headingSm">Top Matching Products</Text>
          <div style={mdStyles.productGrid}>
            {products.map((product) => (
              <div key={product.id} style={mdStyles.productCard}>
                <img 
                  src={product.image_url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"} 
                  alt={product.title}
                  style={mdStyles.productImage}
                  onError={(e) => { e.target.src = "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"; }}
                />
                <div style={mdStyles.productInfo}>
                  <a 
                    href={product.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={mdStyles.productTitle}
                  >
                    {product.title}
                  </a>
                  <span style={mdStyles.productPrice}>{product.price}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </BlockStack>
  );
}

export default function ConversationDetail() {
  const { conversation } = useLoaderData();
  const navigate = useNavigate();

  return (
    <Page
      backAction={{ content: "Conversations", onAction: () => navigate("/app") }}
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
                const { text, products, hasToolUse } = parseContent(msg.content);
                const isUser = msg.role === "user";

                return (
                  <Card
                    key={msg.id}
                    background={
                      isUser ? "bg-surface" : "bg-surface-secondary"
                    }
                  >
                    <BlockStack gap="100">
                      <InlineStack align="space-between">
                        <Text
                          as="span"
                          fontWeight="bold"
                          tone={isUser ? "base" : "magic"}
                        >
                          {isUser ? "Customer" : "Assistant"}
                        </Text>
                        <Text as="span" tone="subdued">
                          {formatDate(msg.createdAt)}
                        </Text>
                      </InlineStack>

                      {isUser ? (
                        text && <Text as="p">{text}</Text>
                      ) : (
                        (text || (products && products.length > 0)) && (
                          <AssistantMessageBody text={text} products={products} />
                        )
                      )}

                      {hasToolUse && (
                        <Text as="p" tone="subdued">
                          [tool call]
                        </Text>
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
