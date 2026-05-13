import { generateAuthUrl } from "../auth.server";
import { getCustomerAccountUrls, storeCustomerAccountUrls } from "../db.server";

/**
 * GET /auth/url?conversation_id=X&shop_id=Y
 *
 * Generates a PKCE auth URL for proactive auth (before any tool call).
 * The widget calls this when the customer enters the Order Assistance flow
 * without an existing valid token.
 */
export async function loader({ request }) {
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversation_id");
  const shopId = url.searchParams.get("shop_id");
  const origin = request.headers.get("Origin") || "";

  if (!conversationId || !shopId) {
    return new Response(JSON.stringify({ error: "Missing conversation_id or shop_id" }), {
      status: 400,
      headers: corsHeaders(origin),
    });
  }

  try {
    // Ensure the well-known URLs are cached for this conversation —
    // generateAuthUrl depends on them being present in the DB.
    const existing = await getCustomerAccountUrls(conversationId);
    if (!existing?.authorizationUrl && origin) {
      const hostname = new URL(origin).hostname;
      const [mcpRes, oidcRes] = await Promise.all([
        fetch(`https://${hostname}/.well-known/customer-account-api`).then((r) => r.json()),
        fetch(`https://${hostname}/.well-known/openid-configuration`).then((r) => r.json()),
      ]);
      await storeCustomerAccountUrls({
        conversationId,
        mcpApiUrl: mcpRes.mcp_api,
        authorizationUrl: oidcRes.authorization_endpoint,
        tokenUrl: oidcRes.token_endpoint,
      });
    }

    const { url: authUrl } = await generateAuthUrl(conversationId, shopId);

    // Log full URL params so they're visible in `flyctl logs` for diagnosis
    const parsed = new URL(authUrl);
    console.log("[auth/url] generated auth URL params:", {
      base: parsed.origin + parsed.pathname,
      client_id: parsed.searchParams.get("client_id"),
      scope: parsed.searchParams.get("scope"),
      redirect_uri: parsed.searchParams.get("redirect_uri"),
      response_type: parsed.searchParams.get("response_type"),
    });

    return new Response(JSON.stringify({ url: authUrl }), {
      headers: corsHeaders(origin),
    });
  } catch (error) {
    console.error("[auth/url] error:", error.message);
    return new Response(JSON.stringify({ error: "Failed to generate auth URL", detail: error.message }), {
      status: 500,
      headers: corsHeaders(origin),
    });
  }
}

export const action = async ({ request }) => {
  if (request.method.toUpperCase() === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("Origin") || "") });
  }
  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
};

function corsHeaders(origin) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
