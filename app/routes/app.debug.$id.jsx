/* eslint-disable react/prop-types */
import { useState } from "react";
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
  Badge,
  Button,
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

function parseBlocks(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [{ type: "text", text: String(parsed) }];
  } catch {
    return [{ type: "text", text: String(raw) }];
  }
}

function formatDate(dateString) {
  const d = new Date(dateString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDuration(ms) {
  if (ms == null) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Collapsible JSON block for tool_use and tool_result entries */
function JsonCollapsible({ label, data, statusText, isError }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: "4px" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          width: "100%",
          padding: "5px 10px",
          border: "1px solid var(--p-color-border, #c9cccf)",
          borderRadius: open ? "4px 4px 0 0" : "4px",
          background: isError
            ? "var(--p-color-bg-fill-critical-secondary, #fff4f4)"
            : "var(--p-color-bg-surface-secondary, #f6f6f7)",
          cursor: "pointer",
          fontSize: "12px",
          fontFamily: "monospace",
          textAlign: "left",
        }}
      >
        <span style={{ userSelect: "none" }}>{open ? "▼" : "▶"}</span>
        <span style={{ fontWeight: 600, flexGrow: 1 }}>{label}</span>
        <span
          style={{
            fontWeight: 700,
            color: isError
              ? "var(--p-color-text-critical, #d82c0d)"
              : "var(--p-color-text-success, #008060)",
          }}
        >
          {statusText}
        </span>
      </button>
      {open && (
        <pre
          style={{
            margin: 0,
            padding: "10px 14px",
            background: isError
              ? "var(--p-color-bg-fill-critical-secondary, #fff4f4)"
              : "var(--p-color-bg-surface-secondary, #f6f6f7)",
            border: "1px solid var(--p-color-border, #c9cccf)",
            borderTop: "none",
            borderRadius: "0 0 4px 4px",
            fontSize: "11px",
            fontFamily: "monospace",
            overflowX: "auto",
            maxHeight: "400px",
            overflowY: "auto",
          }}
        >
          {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

const mdStyles = {
  wrapper: {
    fontSize: "var(--p-font-size-325, 14px)",
    lineHeight: "var(--p-line-height-500, 1.6)",
    color: "var(--p-color-text, #202223)",
    wordBreak: "break-word",
  },
};

const markdownComponents = {
  p: ({ children }) => <p style={{ margin: "0 0 0.5em 0" }}>{children}</p>,
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
};

function ContentBlocks({ blocks, toolNameById }) {
  return (
    <BlockStack gap="200">
      {blocks.map((block, i) => {
        if (block.type === "text") {
          return (
            <div key={i} style={mdStyles.wrapper}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {block.text}
              </ReactMarkdown>
            </div>
          );
        }

        if (block.type === "tool_use") {
          return (
            <JsonCollapsible
              key={i}
              label={`🔧 ${block.name}`}
              data={block.input}
              statusText="→ input"
              isError={false}
            />
          );
        }

        if (block.type === "tool_result") {
          const toolName = toolNameById?.[block.tool_use_id];
          const label = toolName
            ? `📥 ${toolName}`
            : `📥 result:${(block.tool_use_id || "").slice(0, 8)}`;
          const isErr = block.is_error === true;
          return (
            <JsonCollapsible
              key={i}
              label={label}
              data={block.content}
              statusText={isErr ? "✗ error" : "✓ ok"}
              isError={isErr}
            />
          );
        }

        if (block.type === "product_results") {
          const titles = (block.products || []).map((p) => p.title).join(", ");
          return (
            <Text key={i} as="p" tone="subdued">
              📦 Products: {titles || "none"}
            </Text>
          );
        }

        return (
          <Text key={i} as="p" tone="subdued">
            [{block.type}]
          </Text>
        );
      })}
    </BlockStack>
  );
}

function MessageCard({ msg, toolNameById }) {
  const [showRaw, setShowRaw] = useState(false);
  const blocks = parseBlocks(msg.content);
  const isAssistant = msg.role === "assistant";
  const isToolResult = !isAssistant && blocks.some((b) => b.type === "tool_result");
  const hasError = msg.isError;

  const roleLabel = isAssistant ? "Assistant" : isToolResult ? "Tool Result" : "Customer";
  const badgeTone = isAssistant ? "magic" : isToolResult ? "attention" : "info";

  return (
    <div
      style={{
        borderLeft: hasError
          ? "3px solid var(--p-color-border-critical, #d82c0d)"
          : "3px solid transparent",
        borderRadius: "8px",
      }}
    >
      <Card background={isAssistant ? "bg-surface-secondary" : "bg-surface"}>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={badgeTone}>{roleLabel}</Badge>
              {hasError && <Badge tone="critical">error</Badge>}
              {isAssistant && msg.durationMs != null && (
                <Text as="span" variant="bodySm" tone="subdued">
                  ⏱ {formatDuration(msg.durationMs)}
                </Text>
              )}
              {isAssistant && (msg.inputTokens != null || msg.outputTokens != null) && (
                <Text as="span" variant="bodySm" tone="subdued">
                  📊 {(msg.inputTokens || 0).toLocaleString()} in /{" "}
                  {(msg.outputTokens || 0).toLocaleString()} out
                </Text>
              )}
            </InlineStack>
            <Text as="span" variant="bodySm" tone="subdued">
              {formatDate(msg.createdAt)}
            </Text>
          </InlineStack>

          {showRaw ? (
            <pre
              style={{
                margin: 0,
                padding: "10px 14px",
                background: "var(--p-color-bg-surface-secondary, #f6f6f7)",
                borderRadius: "6px",
                fontSize: "11px",
                fontFamily: "monospace",
                overflowX: "auto",
                maxHeight: "600px",
                overflowY: "auto",
              }}
            >
              {JSON.stringify(blocks, null, 2)}
            </pre>
          ) : (
            <ContentBlocks blocks={blocks} toolNameById={toolNameById} />
          )}

          <InlineStack align="end">
            <Button variant="plain" size="slim" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Show Formatted" : "Raw JSON"}
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </div>
  );
}

function buildAiContext(conversation, toolNameById) {
  const lines = [];

  const assistantMsgs = conversation.messages.filter((m) => m.role === "assistant");
  const totalIn = assistantMsgs.reduce((s, m) => s + (m.inputTokens || 0), 0);
  const totalOut = assistantMsgs.reduce((s, m) => s + (m.outputTokens || 0), 0);
  const totalMs = assistantMsgs.reduce((s, m) => s + (m.durationMs || 0), 0);
  const errorCount = conversation.messages.filter((m) => m.isError).length;

  lines.push("# CONVERSATION DEBUG CONTEXT");
  lines.push("# Paste into an AI assistant for analysis");
  lines.push("");
  lines.push("## METADATA");
  lines.push(`Conversation ID : ${conversation.id}`);
  if (conversation.shopDomain) lines.push(`Shop            : ${conversation.shopDomain}`);
  lines.push(`Created         : ${formatDate(conversation.createdAt)}`);
  lines.push(`Updated         : ${formatDate(conversation.updatedAt)}`);
  lines.push(`Turns           : ${assistantMsgs.length}`);
  lines.push(
    `Tokens          : ${(totalIn + totalOut).toLocaleString()} total` +
      ` (${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out)`,
  );
  if (totalMs > 0) lines.push(`Duration        : ${formatDuration(totalMs)}`);
  lines.push(`Errors          : ${errorCount}`);
  lines.push("");
  lines.push("## CONVERSATION");
  lines.push("");

  conversation.messages.forEach((msg, idx) => {
    const blocks = parseBlocks(msg.content);
    const isAssistant = msg.role === "assistant";
    const isToolResult = !isAssistant && blocks.some((b) => b.type === "tool_result");

    const roleLabel = isAssistant ? "ASSISTANT" : isToolResult ? "TOOL RESULT" : "CUSTOMER";

    let header = `─── [${idx + 1}] ${roleLabel} | ${formatDate(msg.createdAt)}`;
    if (isAssistant && msg.durationMs != null)
      header += ` | ${formatDuration(msg.durationMs)}`;
    if (isAssistant && (msg.inputTokens || msg.outputTokens))
      header += ` | ${(msg.inputTokens || 0).toLocaleString()} in / ${(msg.outputTokens || 0).toLocaleString()} out`;
    if (msg.isError) header += ` | ⚠ ERROR`;
    header += " ───";
    lines.push(header);

    blocks.forEach((block) => {
      if (block.type === "text") {
        lines.push(block.text.trimEnd());
      } else if (block.type === "tool_use") {
        lines.push("");
        lines.push(`  [TOOL CALL → ${block.name}]`);
        const inputJson = JSON.stringify(block.input, null, 2).replace(/\n/g, "\n  ");
        lines.push(`  Input:\n  ${inputJson}`);
      } else if (block.type === "tool_result") {
        const toolName = toolNameById[block.tool_use_id] || block.tool_use_id;
        const isErr = block.is_error === true;
        lines.push(`  [TOOL: ${toolName} | ${isErr ? "✗ ERROR" : "✓ OK"}]`);
        const raw =
          typeof block.content === "string"
            ? block.content
            : JSON.stringify(block.content, null, 2);
        const truncated =
          raw.length > 1200 ? raw.slice(0, 1200) + `\n  … (${raw.length} chars total)` : raw;
        lines.push(`  Output:\n  ${truncated.replace(/\n/g, "\n  ")}`);
      } else if (block.type === "product_results") {
        const titles = (block.products || []).map((p) => p.title).join(", ");
        lines.push(`  [PRODUCTS: ${titles || "none"}]`);
      }
    });

    lines.push("");
  });

  return lines.join("\n");
}

function AiContextPanel({ conversation, toolNameById }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const text = buildAiContext(conversation, toolNameById);

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">
              AI Analysis Context
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Full conversation exported as plain text — copy and paste into any AI for analysis
            </Text>
          </BlockStack>
          <InlineStack gap="200">
            <Button onClick={copy} size="slim" variant={copied ? "primary" : "secondary"}>
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
            <Button variant="plain" size="slim" onClick={() => setOpen((v) => !v)}>
              {open ? "Hide" : "Preview"}
            </Button>
          </InlineStack>
        </InlineStack>
        {open && (
          <textarea
            readOnly
            value={text}
            onClick={(e) => e.target.select()}
            style={{
              width: "100%",
              height: "400px",
              fontFamily: "monospace",
              fontSize: "11px",
              border: "1px solid var(--p-color-border, #c9cccf)",
              borderRadius: "4px",
              padding: "10px 14px",
              resize: "vertical",
              background: "var(--p-color-bg-surface-secondary, #f6f6f7)",
              color: "var(--p-color-text, #202223)",
              lineHeight: "1.5",
            }}
          />
        )}
      </BlockStack>
    </Card>
  );
}

export default function DebugConversationDetail() {
  const { conversation } = useLoaderData();
  const navigate = useNavigate();

  const toolNameById = {};
  conversation.messages.forEach((msg) => {
    parseBlocks(msg.content).forEach((b) => {
      if (b.type === "tool_use") toolNameById[b.id] = b.name;
    });
  });

  const assistantMsgs = conversation.messages.filter((m) => m.role === "assistant");
  const totalIn = assistantMsgs.reduce((s, m) => s + (m.inputTokens || 0), 0);
  const totalOut = assistantMsgs.reduce((s, m) => s + (m.outputTokens || 0), 0);
  const totalMs = assistantMsgs.reduce((s, m) => s + (m.durationMs || 0), 0);
  const errorCount = conversation.messages.filter((m) => m.isError).length;

  return (
    <Page
      backAction={{ content: "Debug", onAction: () => navigate("/app/debug") }}
      title={`Conversation: ${conversation.id}`}
    >
      <TitleBar title="Debug — Conversation" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <InlineStack gap="500" wrap>
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Turns
                  </Text>
                  <Text as="span" variant="headingMd">
                    {assistantMsgs.length}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Total tokens
                  </Text>
                  <Text as="span" variant="headingMd">
                    {(totalIn + totalOut).toLocaleString()}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    In / Out
                  </Text>
                  <Text as="span" variant="headingMd">
                    {totalIn.toLocaleString()} / {totalOut.toLocaleString()}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Total duration
                  </Text>
                  <Text as="span" variant="headingMd">
                    {formatDuration(totalMs) || "—"}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Errors
                  </Text>
                  <Text
                    as="span"
                    variant="headingMd"
                    tone={errorCount > 0 ? "critical" : "success"}
                  >
                    {errorCount}
                  </Text>
                </BlockStack>
                {conversation.shopDomain && (
                  <BlockStack gap="100">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Shop
                    </Text>
                    <Text as="span" variant="bodySm">
                      {conversation.shopDomain}
                    </Text>
                  </BlockStack>
                )}
              </InlineStack>
            </Card>

            <AiContextPanel conversation={conversation} toolNameById={toolNameById} />

            {conversation.messages.length === 0 ? (
              <Text as="p">No messages in this conversation.</Text>
            ) : (
              conversation.messages.map((msg) => (
                <MessageCard key={msg.id} msg={msg} toolNameById={toolNameById} />
              ))
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
