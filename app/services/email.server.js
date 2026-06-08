const ISSUE_TYPE_LABELS = {
  damaged_item: "Damaged Item",
  wrong_item: "Wrong Item Received",
  return_request: "Return Request",
  missing_item: "Missing Item",
  order_not_arrived: "Order Not Arrived",
  other: "Other",
};

/**
 * Send a structured support request email to support@rinfit.com via Resend.
 * @param {Object} data
 * @param {string} data.issue_type
 * @param {string} [data.order_number]
 * @param {string} [data.customer_name]
 * @param {string} data.customer_email
 * @param {string} [data.items_affected]
 * @param {string} data.description
 * @param {string} [data.preferred_resolution]
 * @param {string} [data.conversationId]
 */
export async function sendSupportRequest(data) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const issueLabel = ISSUE_TYPE_LABELS[data.issue_type] || data.issue_type;
  const orderRef = data.order_number || "N/A";
  const subject = `Support Request: ${issueLabel} – Order ${orderRef}`;

  const rows = [
    ["Issue Type", issueLabel],
    ["Order Number", orderRef],
    ["Customer Name", data.customer_name || "N/A"],
    ["Customer Email", data.customer_email],
    ["Items Affected", data.items_affected || "N/A"],
    ["Description", data.description],
    ["Preferred Resolution", data.preferred_resolution || "N/A"],
    ["Conversation ID", data.conversationId || "N/A"],
  ];

  const tableRows = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:8px 12px;font-weight:600;background:#f5f5f5;border:1px solid #ddd;white-space:nowrap">${label}</td>
        <td style="padding:8px 12px;border:1px solid #ddd">${escapeHtml(String(value))}</td>
      </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#333">New Support Request</h2>
      <table style="border-collapse:collapse;width:100%">
        ${tableRows}
      </table>
      <p style="margin-top:24px;color:#666;font-size:13px">
        Submitted via Rinfit chat widget. Reply directly to the customer at
        <a href="mailto:${escapeHtml(data.customer_email)}">${escapeHtml(data.customer_email)}</a>.
      </p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Rinfit Chat <noreply@rinfit.com>",
      to: ["nezhihai+test@gmail.com"],
      reply_to: data.customer_email,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend API error ${response.status}: ${err}`);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
