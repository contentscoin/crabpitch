import type { GenericActionCtx } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { jsonResponse } from "./lib/http";
import { extractMcpBearer, tagsFromQuery } from "./lib/mcpHttpAuth";

type ActionCtx = GenericActionCtx<DataModel>;

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

type ToolCallResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const SERVER_INFO = {
  name: "crabpitch",
  version: "1.0.0",
};

const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "crabpitch_status",
    description:
      "CrabPitch MCP 연결 상태와 현재 플랜을 확인합니다. 유료 플랜 키가 필요합니다.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "crabpitch_match_journalists",
    description:
      "주제 태그로 기자 후보를 매칭합니다. 응답에는 기자 코드(기자 #XXXX)만 포함되며 실명·이메일은 노출되지 않습니다. 발송은 CrabPitch 웹앱에서 진행하세요.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "보도자료 초안·키워드·주제 (쉼표/공백으로 태그 추출)",
        },
        topicTags: {
          type: "array",
          items: { type: "string" },
          description: "주제 태그 배열 (있으면 query보다 우선)",
        },
        limit: {
          type: "number",
          description: "최대 결과 수 (기본 10, 최대 20)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "crabpitch_email_template",
    description:
      "보도자료 피치용 이메일 제목/본문 템플릿을 생성합니다. 실제 발송은 CrabPitch 웹앱의 Gmail 연동으로 합니다.",
    inputSchema: {
      type: "object",
      properties: {
        angle: { type: "string", description: "피치 앵글 / 헤드라인" },
        releaseDraft: { type: "string", description: "보도자료 초안" },
        outlet: { type: "string", description: "매체명 (선택)" },
        beat: { type: "string", description: "데스크/비트 (선택)" },
        companyName: { type: "string", description: "회사명 (선택)" },
      },
      required: ["angle"],
      additionalProperties: false,
    },
  },
  {
    name: "crabpitch_classify",
    description: "기자 회신/텍스트를 관심·거절·인터뷰 등으로 분류합니다.",
    inputSchema: {
      type: "object",
      properties: {
        draft: { type: "string", description: "분류할 텍스트" },
        text: { type: "string", description: "분류할 텍스트 (draft와 동일)" },
      },
      additionalProperties: false,
    },
  },
];

function textResult(text: string, isError = false): ToolCallResult {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function jsonRpcResult(id: JsonRpcId | undefined, result: unknown) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  };
}

function jsonRpcError(
  id: JsonRpcId | undefined,
  code: number,
  message: string,
  data?: unknown,
) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

/** URL path `/api/mcp/cp_mcp_…` 또는 Bearer / x-api-key / ?key= */
async function authenticate(
  ctx: ActionCtx,
  request: Request,
): Promise<
  | { ok: true; userId: Id<"users">; keyId: Id<"userMcpKeys"> }
  | { ok: false; status: number; message: string }
> {
  const rawKey = extractMcpBearer(request);
  if (!rawKey) {
    return {
      ok: false,
      status: 401,
      message: "Authorization: Bearer cp_mcp_... 또는 /api/mcp/cp_mcp_... 가 필요합니다.",
    };
  }

  const resolved = await ctx.runQuery(internal.mcpInternal.resolveKey, {
    bearer: rawKey,
  });
  if (!resolved) {
    return {
      ok: false,
      status: 401,
      message:
        "유효하지 않은 MCP 키이거나 유료 플랜이 아닙니다. Solo/Growth/Agency에서 키를 발급하세요.",
    };
  }

  await ctx.runMutation(internal.mcpInternal.touchKey, {
    keyId: resolved.keyId,
  });

  return { ok: true, userId: resolved.userId, keyId: resolved.keyId };
}

async function callTool(
  ctx: ActionCtx,
  userId: Id<"users">,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  try {
    switch (name) {
      case "crabpitch_status": {
        const status = await ctx.runQuery(internal.mcpInternal.status, {
          userId,
        });
        return textResult(JSON.stringify(status, null, 2));
      }
      case "crabpitch_match_journalists": {
        const topicTagsFromArgs = Array.isArray(args.topicTags)
          ? args.topicTags.filter((t): t is string => typeof t === "string")
          : [];
        const query = typeof args.query === "string" ? args.query : "";
        const topicTags =
          topicTagsFromArgs.length > 0
            ? topicTagsFromArgs
            : tagsFromQuery(query);
        const limitRaw =
          typeof args.limit === "number" ? Math.floor(args.limit) : 10;
        const topK = Math.min(20, Math.max(1, limitRaw));
        const result = await ctx.runQuery(internal.mcpInternal.matchJournalists, {
          userId,
          topicTags: topicTags.length ? topicTags : ["IT·스타트업"],
          topK,
        });
        return textResult(JSON.stringify(result, null, 2));
      }
      case "crabpitch_email_template": {
        const angle = typeof args.angle === "string" ? args.angle : "";
        const releaseDraft =
          typeof args.releaseDraft === "string" ? args.releaseDraft : "";
        const outlet =
          typeof args.outlet === "string" ? args.outlet : "매체";
        const beat = typeof args.beat === "string" ? args.beat : "데스크";
        const companyName =
          typeof args.companyName === "string" ? args.companyName : undefined;
        if (!angle.trim()) {
          return textResult("angle(헤드라인)이 필요합니다.", true);
        }
        const result = await ctx.runQuery(internal.mcpInternal.emailTemplate, {
          outlet,
          beat,
          headline: angle.trim(),
          companyName,
          body: releaseDraft || undefined,
        });
        return textResult(JSON.stringify(result, null, 2));
      }
      case "crabpitch_classify": {
        const text =
          (typeof args.text === "string" && args.text) ||
          (typeof args.draft === "string" && args.draft) ||
          "";
        if (!text.trim()) {
          return textResult("text/draft가 필요합니다.", true);
        }
        const result = await ctx.runQuery(internal.mcpInternal.classify, {
          text,
        });
        return textResult(JSON.stringify(result, null, 2));
      }
      default:
        return textResult(`Unknown tool: ${name}`, true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return textResult(message, true);
  }
}

async function handleRpc(
  ctx: ActionCtx,
  userId: Id<"users">,
  message: JsonRpcRequest,
): Promise<unknown | null> {
  const method = message.method ?? "";
  const id = message.id;
  const params = message.params ?? {};

  if (id === undefined && method.startsWith("notifications/")) {
    return null;
  }

  switch (method) {
    case "initialize":
      return jsonRpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
        instructions:
          "CrabPitch MCP — 보도자료 피치용 도구입니다. 기자 실명/이메일은 반환하지 않습니다. 발송은 CrabPitch 웹앱에서 진행하세요. 유료 플랜 전용.",
      });
    case "notifications/initialized":
      return null;
    case "ping":
      return jsonRpcResult(id, {});
    case "tools/list":
      return jsonRpcResult(id, { tools: TOOLS });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args =
        params.arguments &&
        typeof params.arguments === "object" &&
        !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      const result = await callTool(ctx, userId, name, args);
      return jsonRpcResult(id, result);
    }
    case "resources/list":
      return jsonRpcResult(id, { resources: [] });
    case "prompts/list":
      return jsonRpcResult(id, { prompts: [] });
    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function handleMcpRequest(
  ctx: ActionCtx,
  request: Request,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, Accept, X-Api-Key, Mcp-Session-Id",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (request.method === "GET") {
    const auth = await authenticate(ctx, request);
    if (!auth.ok) {
      return jsonResponse(
        { error: auth.message, paidOnly: true },
        auth.status,
      );
    }
    const status = await ctx.runQuery(internal.mcpInternal.status, {
      userId: auth.userId,
    });
    return jsonResponse({
      ok: true,
      server: SERVER_INFO,
      protocolVersion: PROTOCOL_VERSION,
      ...status,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await authenticate(ctx, request);
  if (!auth.ok) {
    return jsonResponse(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: auth.message },
      },
      auth.status,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(jsonRpcError(null, -32700, "Parse error"), 400);
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses: unknown[] = [];

  for (const raw of messages) {
    if (!raw || typeof raw !== "object") {
      responses.push(jsonRpcError(null, -32600, "Invalid Request"));
      continue;
    }
    const response = await handleRpc(
      ctx,
      auth.userId,
      raw as JsonRpcRequest,
    );
    if (response !== null) {
      responses.push(response);
    }
  }

  if (Array.isArray(body)) {
    return jsonResponse(responses, 200);
  }
  if (responses.length === 0) {
    return new Response(null, { status: 202 });
  }
  return jsonResponse(responses[0], 200);
}

export const mcpHttpHandler = httpAction(async (ctx, request) => {
  return handleMcpRequest(ctx, request);
});
