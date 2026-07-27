/**
 * OpenCrab HTTP 또는 MCP(JSON-RPC) 클라이언트로 기자 후보를 조회한다.
 *
 * 설정:
 *   OPENCRAB_API_URL  — HTTP 엔드포인트 또는 `https://opencrab.sh/api/mcp`
 *   OPENCRAB_API_KEY  — Bearer 키 또는 `ocm_…` MCP 키
 *
 * MCP 키(`ocm_`)이거나 URL에 `/api/mcp`가 있으면 MCP tools/call(opencrab_query) 사용.
 */

/**
 * 환경변수 값에 CLI 플래그가 섞여 들어갔는지 본다.
 *
 * `npx convex env set NAME VALUE --prod` 형태의 안내를 대시보드 입력창에 그대로
 * 붙여넣으면 `--prod`가 **값의 일부**가 된다. 그러면 키 끝에 " --prod"가 붙은 채
 * 호출돼 서버가 401을 주고, 화면에는 "Unauthorized"만 남아 원인이 보이지 않는다.
 * 실제로 이 사고가 났고 팩 27개가 전부 그 이유로 실패했다.
 *
 * 공백이나 대시 플래그가 보이면 인증을 시도하지 않고 무엇이 잘못됐는지 바로 말한다.
 */
export function assertCleanCredential(name: string, value: string): void {
  const flag = value.match(/\s--?[a-z][\w-]*/i);
  if (flag) {
    throw new Error(
      `${name} 값에 CLI 플래그 "${flag[0].trim()}"가 섞여 있습니다. ` +
        `대시보드에는 값만 넣으세요(예: --prod 제외).`,
    );
  }
  if (/\s/.test(value)) {
    throw new Error(`${name} 값에 공백이 있습니다. 붙여넣기를 확인하세요.`);
  }
}

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
  apiKey?: string,
): Promise<{ json: unknown; sessionId?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-03-26",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  // 경로에 키가 박혀 있어도 헤더를 함께 보낸다.
  // 경로 인증만 쓰면 initialize는 통과하고 tools/call만 "Unauthorized MCP request"로
  // 떨어지는 게이트웨이가 있다 — 실제로 팩 27개가 전부 그렇게 실패했다.
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

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

/**
 * MCP 세션 1회 수립 후 임의 도구를 반복 호출할 수 있는 호출자를 만든다.
 * 팩 26개를 순회하는 동기화 경로에서 세션 재수립 비용을 없앤다.
 */
export async function openOpenCrabMcpSession(
  endpoint: string,
  apiKey?: string,
): Promise<(toolName: string, args: Record<string, unknown>) => Promise<unknown>> {
  const init = await mcpRpc(
    endpoint,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "crabpitch", version: "0.1.0" },
      },
    },
    undefined,
    apiKey,
  );
  const sid = init.sessionId;
  try {
    await mcpRpc(
      endpoint,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      sid,
      apiKey,
    );
  } catch {
    // 일부 게이트웨이는 notification을 무시/실패해도 tools/call 가능
  }

  let callId = 1;
  return async (toolName, args) => {
    callId += 1;
    const called = await mcpRpc(
      endpoint,
      {
        jsonrpc: "2.0",
        id: callId,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      },
      sid,
      apiKey,
    );
    return unwrapToolResult(called.json);
  };
}

/**
 * 범용 MCP 도구 1회 호출 — baseUrl/키에서 엔드포인트를 해석하고 세션을 수립한다.
 * 반복 호출은 `openOpenCrabMcpSession`을 쓰는 편이 낫다.
 */
export async function callOpenCrabMcpTool(
  baseUrl: string,
  apiKey: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const transport = resolveOpenCrabTransport(baseUrl, apiKey);
  if (transport.mode !== "mcp") {
    throw new Error("MCP 도구 호출은 ocm_ 키 또는 /api/mcp 엔드포인트에서만 가능합니다.");
  }
  const call = await openOpenCrabMcpSession(transport.endpoint);
  return await call(toolName, args);
}

/** 응답에 근거(evidence)가 하나도 없는지 — 스코프 실패를 예외 대신 이걸로 판정한다. */
function hasNoEvidence(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return true;
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.evidence)) return obj.evidence.length === 0;
  if (obj.status === "no_evidence") return true;
  return false;
}

/**
 * MCP opencrab_query 호출.
 *
 * ⚠️ 팩 스코프는 **`package_id`로만** 건다. 이전 구현이 만들던 `pack_query`는 호출 인자로
 *    전달되지 않아 유실됐는데, 실측(F8 스파이크) 결과 **그 인자는 애초에 동작하지 않는다** —
 *    예외를 던지지 않고 `pack_scope.documents: 0`인 빈 결과를 조용히 돌려준다. 즉 인자를
 *    "복원"했다면 매칭 경로가 조용히 0건이 됐을 것이다. 그래서 서버가 실제로 해석하는
 *    `package_id`를 쓰고, 스코프가 먹지 않아 빈 결과가 오면 **스코프 없이 한 번 더** 조회한다.
 */
export async function fetchOpenCrabViaMcp(
  endpoint: string,
  query: string,
  topK: number,
  packageId?: string,
): Promise<unknown> {
  const call = await openOpenCrabMcpSession(endpoint);
  const scoped = packageId?.trim();
  if (!scoped) {
    return await call("opencrab_query", { query, top_k: topK });
  }

  const result = await call("opencrab_query", {
    query,
    top_k: topK,
    package_id: scoped,
  });
  if (!hasNoEvidence(result)) return result;
  // 스코프가 걸리지 않았거나 팩에 근거가 없다 — 매칭이 통째로 0건이 되지 않도록 폴백.
  return await call("opencrab_query", { query, top_k: topK });
}

/**
 * 팩 1개의 문서 청크를 가져온다(동기화 파이프라인 전용).
 *
 * 실측 확정 인자: `{ query, package_id, workspace_id?, limit≤100, scan_limit≤20000 }`.
 * `query`는 필수지만 내용은 무관하다 — `package_id` 스코프가 걸리면 팩 내 청크가 전부
 * 후보로 올라오고 `limit`까지 반환된다. offset·커서가 없어 청크 100개를 넘는 팩은
 * 단일 호출로 전량 취득할 수 없다(호출 측이 결손으로 기록).
 */
export async function fetchPackDocuments(
  call: (toolName: string, args: Record<string, unknown>) => Promise<unknown>,
  packageId: string,
  opts?: { workspaceId?: string; limit?: number; scanLimit?: number },
): Promise<unknown> {
  return await call("opencrab_search_documents", {
    query: "reporter",
    package_id: packageId,
    ...(opts?.workspaceId ? { workspace_id: opts.workspaceId } : {}),
    limit: Math.min(opts?.limit ?? 100, 100),
    scan_limit: Math.min(opts?.scanLimit ?? 20_000, 20_000),
  });
}

/**
 * 프로젝트에 담긴 팩 목록 조회 — 팩 탐색의 1차 경로.
 *
 * `opencrab_project_manage`는 프로젝트마다 `packages[]`를 통째로 실어 보내므로
 * 별도 페이지네이션이 필요 없다. `query`로 프로젝트 이름을 좁힌다.
 */
export async function fetchProjectPacks(
  call: (toolName: string, args: Record<string, unknown>) => Promise<unknown>,
  projectName: string,
): Promise<unknown> {
  return await call("opencrab_project_manage", {
    action: "list",
    query: projectName,
    limit: 50,
  });
}

/** 팩 목록 조회 — offset 기반 페이지네이션(next_cursor가 숫자 문자열). */
export async function fetchPackList(
  call: (toolName: string, args: Record<string, unknown>) => Promise<unknown>,
  query: string,
  offset?: string,
): Promise<unknown> {
  return await call("opencrab_search_packs", {
    query,
    limit: 10,
    ...(offset ? { cursor: offset } : {}),
  });
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
