import { authenticate } from "../shopify.server";
import { getAllConversationsForExport } from "../db.server";

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

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const sortBy = url.searchParams.get("sort") || "updatedAt";
  const order = url.searchParams.get("order") || "desc";
  const dateFrom = url.searchParams.get("dateFrom") || undefined;
  const dateTo = url.searchParams.get("dateTo") || undefined;
  const minMessages = url.searchParams.get("minMessages") || undefined;
  const search = url.searchParams.get("search") || undefined;

  const rows = await getAllConversationsForExport({ dateFrom, dateTo, minMessages, search, sortBy, order });

  const header = ["id", "updatedAt", "createdAt", "messageCount", "lastUserMessage"];
  const lines = [
    header.join(","),
    ...rows.map((conv) => {
      const lastMsg =
        conv.messages && conv.messages.length > 0
          ? parseContent(conv.messages[0].content)
          : "";
      return [
        csvEscape(conv.id),
        csvEscape(conv.updatedAt.toISOString()),
        csvEscape(conv.createdAt.toISOString()),
        csvEscape(conv._count.messages),
        csvEscape(lastMsg),
      ].join(",");
    }),
  ];

  const csv = lines.join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="conversations.csv"',
    },
  });
};
