import type { GenericActionCtx } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { jsonResponse } from "./lib/http";
import { extractMcpBearer, tagsFromQuery } from "./lib/mcpHttpAuth";
import { MCP_TOOL_SKILL, planAllowsSkill, upgradeRequiredMessage } from "./lib/plans";

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

/**
 * 한 번에 접촉하기 적절한 기자 수. **금지선이 아니라 권장치다.**
 * 사용자가 더 필요하다고 판단하면 지정할 수 있어야 하고, 대신 왜 위험한지 알려 준다.
 */
const RECOMMENDED_MATCH_LIMIT = 20;
/** 남용·응답 폭주 방지선. 권장치와 구분한다. */
const MAX_MATCH_LIMIT = 100;

function sendingGuidance(topK: number): string {
  const base =
    "발송은 CrabPitch 웹앱에서 사용자 승인 후에만 진행됩니다. 기자별로 내용을 달리한 개인화 메일만 보내세요.";
  if (topK > RECOMMENDED_MATCH_LIMIT) {
    return (
      `${topK}명은 권장치(${RECOMMENDED_MATCH_LIMIT}명)를 넘습니다. ` +
      "동시에 많은 수에 발송하면 수신 서버가 스팸으로 판정해 도메인 평판이 깎일 수 있습니다. " +
      `나눠 보내거나 상위 ${RECOMMENDED_MATCH_LIMIT}명부터 시작하는 편을 권합니다. ` +
      base
    );
  }
  return `한 번에 ${RECOMMENDED_MATCH_LIMIT}명 이하를 권장합니다. ${base}`;
}

const TOOLS = [
  {
    name: "crabpitch_status",
    description:
      "CrabPitch MCP 연결 상태·플랜과, 이 플랜에서 쓸 수 있는 스킬(skills)·잠긴 스킬(lockedSkills)을 확인합니다.",
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
          description:
            "최대 결과 수 (기본 10). 한 번에 20명 이하를 권장합니다 — 더 지정할 수 있지만, 동시에 많이 보내면 수신 서버가 스팸으로 판정할 수 있습니다.",
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
  {
    name: "crabpitch_press_guide",
    description:
      "보도자료 작성 규범(구조·작성 전략·GEO·표시광고법 게이트·프레스킷 목차)을 조회하고, 초안을 주면 결정적 규칙 검사 결과를 함께 돌려줍니다. 표시·광고 계열만 다루며 법률 검토를 대체하지 않습니다.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: ["structure", "writing", "geo", "adlaw", "presskit", "all"],
          description: "조회할 가이드 섹션 (기본 all)",
        },
        draft: { type: "string", description: "검사할 보도자료 본문 (선택)" },
        title: { type: "string", description: "검사할 보도자료 제목 (선택)" },
        boilerplate: {
          type: "string",
          description:
            "미디어킷의 회사 소개 원문 (선택). 주면 본문이 이 문단을 그대로 실었는지 대조합니다.",
        },
        factSheet: {
          type: "array",
          description:
            "미디어킷 팩트시트 (선택). 주면 본문 수치가 이 집합의 부분집합인지 대조합니다.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
            },
            required: ["label", "value"],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
];

/** MCP 인자에서 `{label, value}` 배열만 통과시킨다 — 모양이 다르면 통째로 버린다. */
function parseFactSheet(value: unknown): Array<{ label: string; value: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.filter(
    (r): r is { label: string; value: string } =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as { label?: unknown }).label === "string" &&
      typeof (r as { value?: unknown }).value === "string",
  );
  return rows.length > 0 ? rows : undefined;
}

/**
 * 이 플랜이 실제로 쓸 수 있는 도구만 노출한다.
 *
 * 호출 시 막는 것만으로는 부족하다 — 목록에 보이면 에이전트가 계획을 세우고 호출한 뒤에야
 * 실패한다. 아예 보이지 않아야 다른 방법을 찾는다. `crabpitch_status`는 무엇이 잠겼는지
 * 알려 주는 도구라 항상 남긴다.
 */
function toolsForPlan(plan: string) {
  return TOOLS.filter((t) => {
    const skill = MCP_TOOL_SKILL[t.name];
    return skill === undefined || planAllowsSkill(plan, skill);
  });
}

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
  | { ok: true; userId: Id<"users">; keyId: Id<"userMcpKeys">; plan: string }
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
        "유효하지 않거나 해지된 MCP 키입니다. CrabPitch 웹앱 「내 AI 연동」에서 키를 발급하세요.",
    };
  }

  await ctx.runMutation(internal.mcpInternal.touchKey, {
    keyId: resolved.keyId,
  });

  return {
    ok: true,
    userId: resolved.userId,
    keyId: resolved.keyId,
    plan: resolved.plan,
  };
}

async function callTool(
  ctx: ActionCtx,
  userId: Id<"users">,
  plan: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  try {
    // 목록에서 감추는 것과 별개로 호출도 막는다 — 목록을 건너뛰고 부르는 클라이언트가 있다.
    const requiredSkill = MCP_TOOL_SKILL[name];
    if (requiredSkill !== undefined && !planAllowsSkill(plan, requiredSkill)) {
      return textResult(upgradeRequiredMessage(requiredSkill), true);
    }
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
        // 20은 권장치이지 금지선이 아니다 — 필요하면 더 볼 수 있어야 한다.
        // 상한(MAX)은 남용·응답 폭주 방지선일 뿐이다.
        const topK = Math.min(MAX_MATCH_LIMIT, Math.max(1, limitRaw));
        const result = await ctx.runQuery(internal.mcpInternal.matchJournalists, {
          userId,
          topicTags: topicTags.length ? topicTags : ["IT·스타트업"],
          topK,
        });
        return textResult(
          JSON.stringify(
            {
              ...result,
              sendingGuidance: sendingGuidance(topK),
            },
            null,
            2,
          ),
        );
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
      case "crabpitch_press_guide": {
        const guide = await ctx.runQuery(internal.mcpInternal.pressGuide, {
          section: typeof args.section === "string" ? args.section : undefined,
          draft: typeof args.draft === "string" ? args.draft : undefined,
          title: typeof args.title === "string" ? args.title : undefined,
          boilerplate: typeof args.boilerplate === "string" ? args.boilerplate : undefined,
          factSheet: parseFactSheet(args.factSheet),
        });
        return textResult(JSON.stringify(guide, null, 2));
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
  plan: string,
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
          "CrabPitch MCP — 보도자료 피치용 도구입니다. 기자 실명/이메일은 반환하지 않습니다. 발송은 CrabPitch 웹앱에서 진행하세요. 무료 플랜은 보도자료 작성 도구만 노출되며, 매칭·메일 템플릿·회신 분류는 Solo 이상에서 열립니다(웹앱에서는 무료로도 이용 가능).",
      });
    case "notifications/initialized":
      return null;
    case "ping":
      return jsonRpcResult(id, {});
    case "tools/list":
      return jsonRpcResult(id, { tools: toolsForPlan(plan) });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args =
        params.arguments &&
        typeof params.arguments === "object" &&
        !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      const result = await callTool(ctx, userId, plan, name, args);
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
      auth.plan,
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
