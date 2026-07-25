/** HTTP JSON 응답 헬퍼 (CORS 포함) */

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, Accept, X-Api-Key, Mcp-Session-Id",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}
