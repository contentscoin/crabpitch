/**
 * OpenCrab HTTP 또는 MCP(JSON-RPC) 클라이언트로 기자 후보를 조회한다.
 *
 * 설정:
 *   OPENCRAB_API_URL  — HTTP 엔드포인트 또는 `https://opencrab.sh/api/mcp`
 *   OPENCRAB_API_KEY  — Bearer 키 또는 `ocm_…` MCP 키
 *
 * MCP 키(`ocm_`)이거나 URL에 `/api/mcp`가 있으면 MCP tools/call(opencrab_query) 사용.
 */

export function resolveOpenCrabTransport(
  baseUrl: string,
  apiKey: string,
): { mode: "http" | "mcp"; endpoint: string } {
  const url = baseUrl.replace(/\/$/, "");
  const key = apiKey.trim();
  const isMcp =
    key.startsWith("ocm_") ||
    /\/api\/mcp(\/|$)/i.test(url) ||
    url.includes("/api/mcp/");

  if (!isMcp) {
    return { mode: "http", endpoint: url };
  }

  // URL에 키가 이미 붙어 있으면 그대로, 아니면 /api/mcp/{key}
  if (/\/api\/mcp\/ocm_/i.test(url)) {
    return { mode: "mcp", endpoint: url };
  }
  const mcpBase = /\/api\/mcp$/i.test(url)
    ? url
    : "https://opencrab.sh/api/mcp";
  return { mode: "mcp", endpoint: `${mcpBase}/${key}` };
}

async function mcpRpc(
  endpoint: string,
  body: Record<string, unknown>,
  sessionId?: string,
): Promise<{ json: unknown; sessionId?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-03-26",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const nextSid =
    res.headers.get("Mcp-Session-Id") ??
    res.headers.get("mcp-session-id") ??
    sessionId;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // SSE 한 줄 data: {...} 형태 대비
    const line = text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("data:"));
    if (line) {
      json = JSON.parse(line.slice(5).trim());
    } else {
      throw new Error(`OpenCrab MCP 비JSON 응답: ${text.slice(0, 120)}`);
    }
  }
  if (!res.ok) {
    throw new Error(`OpenCrab MCP HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return { json, sessionId: nextSid ?? undefined };
}

function unwrapToolResult(rpc: unknown): unknown {
  if (!rpc || typeof rpc !== "object") return rpc;
  const obj = rpc as Record<string, unknown>;
  if (obj.error && typeof obj.error === "object") {
    const err = obj.error as { message?: string };
    throw new Error(err.message ?? "OpenCrab MCP error");
  }
  const result = obj.result as Record<string, unknown> | undefined;
  if (!result) return rpc;
  if (result.isError) {
    const detail =
      (result.structuredContent as { detail?: string } | undefined)?.detail ??
      "OpenCrab tool error";
    throw new Error(detail);
  }
  if (result.structuredContent != null) return result.structuredContent;
  const content = result.content;
  if (Array.isArray(content) && content[0] && typeof content[0] === "object") {
    const c0 = content[0] as { type?: string; text?: string };
    if (c0.type === "text" && typeof c0.text === "string") {
      try {
        return JSON.parse(c0.text) as unknown;
      } catch {
        return { answer: c0.text };
      }
    }
  }
  return result;
}

/** MCP opencrab_query 호출 */
export async function fetchOpenCrabViaMcp(
  endpoint: string,
  query: string,
  topK: number,
): Promise<unknown> {
  const init = await mcpRpc(endpoint, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "crabpitch", version: "0.1.0" },
    },
  });
  const sid = init.sessionId;
  try {
    await mcpRpc(
      endpoint,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      sid,
    );
  } catch {
    // 일부 게이트웨이는 notification을 무시/실패해도 tools/call 가능
  }

  const called = await mcpRpc(
    endpoint,
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "opencrab_query",
        arguments: { query, top_k: topK },
      },
    },
    sid,
  );
  return unwrapToolResult(called.json);
}

/** 기존 HTTP POST 계약 */
export async function fetchOpenCrabViaHttp(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenCrab HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as unknown;
}
