import { saveConversationRating } from "../db.server.js";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

// React Router v7 routes OPTIONS to loader, not action
export async function loader({ request }) {
  if (request.method.toUpperCase() === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: corsHeaders(request),
  });
}

export async function action({ request }) {

  if (request.method.toUpperCase() !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders(request),
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: corsHeaders(request),
    });
  }

  const { conversation_id, rating } = body;

  if (!conversation_id || ![1, -1].includes(rating)) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: corsHeaders(request),
    });
  }

  try {
    await saveConversationRating(conversation_id, rating);
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: corsHeaders(request),
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to save rating" }), {
      status: 500,
      headers: corsHeaders(request),
    });
  }
}
