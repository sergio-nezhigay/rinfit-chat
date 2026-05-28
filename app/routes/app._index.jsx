import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { listConversations } from "../db.server";
import { getConversationIdsByMetric } from "../utils/analytics.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  IndexTable,
  Text,
  Select,
  TextField,
  Button,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

const PAGE_SIZE = 20;

const METRIC_LABELS = {
  add_to_cart: "Add to cart",
  pdp_click: "Redirects to PDP",
};

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const sortBy = url.searchParams.get("sort") || "updatedAt";
  const order = url.searchParams.get("order") || "desc";
  const dateFrom = url.searchParams.get("dateFrom") || undefined;
  const dateTo = url.searchParams.get("dateTo") || undefined;
  const minMessages = url.searchParams.get("minMessages") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const rating = url.searchParams.get("rating") || undefined;
  const metric = url.searchParams.get("metric") || undefined;

  let conversationIds;
  if (metric && METRIC_LABELS[metric]) {
    const mDateFrom = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const mDateTo = dateTo ? new Date(dateTo) : new Date();
    mDateTo.setHours(23, 59, 59, 999);
    conversationIds = await getConversationIdsByMetric(undefined, metric, mDateFrom, mDateTo);
  }

  const skip = (page - 1) * PAGE_SIZE;
  const { conversations, total } = await listConversations({
    skip,
    take: PAGE_SIZE,
    sortBy,
    order,
    dateFrom,
    dateTo,
    minMessages,
    search,
    rating,
    conversationIds,
  });
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return { conversations, total, page, totalPages, sortBy, order, dateFrom, dateTo, minMessages, search, rating, metric: metric || null };
};

function formatDate(dateString) {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}.${month}, ${hours}:${minutes}`;
}

function parseContent(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join(" ");
    }
    return String(parsed);
  } catch {
    return raw;
  }
}

function truncateText(text, length = 80) {
  if (!text) return "No messages";
  return text.length > length ? text.substring(0, length) + "..." : text;
}

const SORT_OPTIONS = [
  { label: "Newest first", value: "updatedAt|desc" },
  { label: "Oldest first", value: "updatedAt|asc" },
  { label: "Most messages", value: "messageCount|desc" },
  { label: "Fewest messages", value: "messageCount|asc" },
];

const RATING_OPTIONS = [
  { label: "All ratings", value: "" },
  { label: "👍 Positive", value: "1" },
  { label: "👎 Negative", value: "-1" },
  { label: "Not rated", value: "unrated" },
];

function ratingEmoji(rating) {
  if (rating === 1) return "👍";
  if (rating === -1) return "👎";
  return "";
}

export default function ConversationsList() {
  const { conversations, page, totalPages, sortBy, order, dateFrom, dateTo, minMessages, search, rating, metric } =
    useLoaderData();
  const navigate = useNavigate();

  const [localSort, setLocalSort] = useState(`${sortBy}|${order}`);
  const [localDateFrom, setLocalDateFrom] = useState(dateFrom || "");
  const [localDateTo, setLocalDateTo] = useState(dateTo || "");
  const [localMinMessages, setLocalMinMessages] = useState(minMessages || "");
  const [localSearch, setLocalSearch] = useState(search || "");
  const [localRating, setLocalRating] = useState(rating || "");

  function buildQuery(overrides = {}) {
    const params = new URLSearchParams();
    const s = overrides.sort ?? localSort;
    const [sb, ord] = s.split("|");
    if (sb !== "updatedAt" || ord !== "desc") {
      params.set("sort", sb);
      params.set("order", ord);
    }
    const df = overrides.dateFrom ?? localDateFrom;
    if (df) params.set("dateFrom", df);
    const dt = overrides.dateTo ?? localDateTo;
    if (dt) params.set("dateTo", dt);
    const mm = overrides.minMessages ?? localMinMessages;
    if (mm) params.set("minMessages", mm);
    const sr = overrides.search ?? localSearch;
    if (sr) params.set("search", sr);
    const rt = overrides.rating ?? localRating;
    if (rt) params.set("rating", rt);
    const pg = overrides.page ?? 1;
    if (pg > 1) params.set("page", pg);
    const qs = params.toString();
    return qs ? `/app?${qs}` : "/app";
  }

  function applyFilters() {
    navigate(buildQuery({ page: 1 }));
  }

  function resetFilters() {
    setLocalSort("updatedAt|desc");
    setLocalDateFrom("");
    setLocalDateTo("");
    setLocalMinMessages("");
    setLocalSearch("");
    setLocalRating("");
    navigate("/app");
  }

  function exportUrl() {
    const params = new URLSearchParams();
    const [sb, ord] = localSort.split("|");
    params.set("sort", sb);
    params.set("order", ord);
    if (localDateFrom) params.set("dateFrom", localDateFrom);
    if (localDateTo) params.set("dateTo", localDateTo);
    if (localMinMessages) params.set("minMessages", localMinMessages);
    if (localSearch) params.set("search", localSearch);
    if (localRating) params.set("rating", localRating);
    const qs = params.toString();
    return qs ? `/app/conversations/export?${qs}` : "/app/conversations/export";
  }

  async function handleExport() {
    try {
      const response = await fetch(exportUrl());
      if (!response.ok) throw new Error(`Export failed: ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "conversations.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("CSV export error:", err);
    }
  }

  const rowMarkup = conversations.map((conv, index) => {
    const lastMessage = conv.messages && conv.messages.length > 0 ? conv.messages[0] : null;
    let messagePreview = "No messages";
    if (lastMessage) {
      const textContent = parseContent(lastMessage.content);
      messagePreview = truncateText(textContent, 80);
    }

    return (
      <IndexTable.Row
        id={conv.id}
        key={conv.id}
        position={index}
        onClick={() => navigate(`/app/conversations/${conv.id}`)}
      >
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
          <Text variant="bodyMd" as="span" truncate>
            {messagePreview}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {ratingEmoji(conv.rating)}
          </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page>
      <TitleBar title="Chat Conversations" />

      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {metric && METRIC_LABELS[metric] && (
              <Banner
                title={`Showing conversations with "${METRIC_LABELS[metric]}" events`}
                action={{ content: "Clear filter", url: "/app" }}
                tone="info"
              />
            )}
            {/* Filter / sort toolbar */}
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="400" wrap blockAlign="end">
                  <Select
                    label="Sort"
                    options={SORT_OPTIONS}
                    value={localSort}
                    onChange={setLocalSort}
                  />
                  <TextField
                    label="From date"
                    type="date"
                    value={localDateFrom}
                    onChange={setLocalDateFrom}
                    autoComplete="off"
                  />
                  <TextField
                    label="To date"
                    type="date"
                    value={localDateTo}
                    onChange={setLocalDateTo}
                    autoComplete="off"
                  />
                  <div style={{ width: "90px" }}>
                    <TextField
                      label="Min messages"
                      type="number"
                      value={localMinMessages}
                      onChange={setLocalMinMessages}
                      min={1}
                      autoComplete="off"
                    />
                  </div>
                  <Select
                    label="Rating"
                    options={RATING_OPTIONS}
                    value={localRating}
                    onChange={setLocalRating}
                  />
                  <div style={{ paddingTop: "22px" }}>
                    <Button onClick={applyFilters} variant="primary">
                      Apply
                    </Button>
                  </div>
                </InlineStack>
                <TextField
                  label="Search in messages"
                  type="search"
                  value={localSearch}
                  onChange={setLocalSearch}
                  placeholder="Type to search message text…"
                  autoComplete="off"
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                />
                <InlineStack gap="300">
                  <Button onClick={resetFilters} variant="plain">
                    Reset filters
                  </Button>
                  <Button onClick={handleExport} variant="secondary">
                    Export CSV
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Conversations table */}
            <Card padding="0">
              <IndexTable
                resourceName={{ singular: 'conversation', plural: 'conversations' }}
                itemCount={conversations.length}
                headings={[
                  { title: 'Last Updated' },
                  { title: 'Messages' },
                  { title: 'Last Message Preview' },
                  { title: 'Rating' },
                ]}
                selectable={false}
                pagination={{
                  hasNext: page < totalPages,
                  hasPrevious: page > 1,
                  onNext: () => navigate(buildQuery({ page: page + 1 })),
                  onPrevious: () => navigate(buildQuery({ page: page - 1 })),
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
