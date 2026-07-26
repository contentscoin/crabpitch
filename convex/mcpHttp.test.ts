import { describe, expect, it } from "vitest";
import { getFunctionName } from "convex/server";
import { handleMcpRequest } from "./mcpHttp";

/**
 * MCP HTTP 엔드포인트 계약 테스트.
 * Claude Desktop·Cursor·ChatGPT 커넥터가 의존하는 JSON-RPC 응답 형태를 고정한다.
 * (실제 Convex 배포 없이 ctx만 모킹해 핸들러를 직접 호출)
 */

const VALID_KEY = "cp_mcp_" + "a".repeat(48);
const FREE_KEY = "cp_mcp_" + "b".repeat(48);

type QueryHandler = (args: Record<string, unknown>) => unknown;

function makeCtx(overrides: Record<string, QueryHandler> = {}) {
  const calls: string[] = [];
  const defaults: Record<string, QueryHandler> = {
    "mcpInternal:resolveKey": (args) => {
      const bearer = String(args.bearer ?? "");
      if (bearer === VALID_KEY) {
        return { userId: "user_1", keyId: "key_1", plan: "solo" };
      }
      // 무료 플랜·폐기·미존재 키는 모두 null (mcpAuth.resolveUserMcpKey 동작)
      return null;
    },
    "mcpInternal:touchKey": () => null,
    "mcpInternal:status": () => ({
      service: "crabpitch",
      plan: "solo",
      mcpAllowed: true,
      companyName: "테스트컴퍼니",
      skills: ["press-release-writer"],
      skillPack: "https://github.com/contentscoin/crabpitch-skill",
      compliance: "기자 실명·이메일은 MCP 응답에 포함되지 않습니다.",
    }),
  };
  const table = { ...defaults, ...overrides };

  const run = (ref: unknown, args: Record<string, unknown>) => {
    const name = getFunctionName(ref as never);
    calls.push(name);
    const fn = table[name];
    if (!fn) throw new Error(`모킹되지 않은 함수 호출: ${name}`);
    return Promise.resolve(fn(args ?? {}));
  };

  return {
    ctx: { runQuery: run, runMutation: run, runAction: run } as never,
    calls,
  };
}

function post(key: string | null, body: unknown): Request {
  const url = key
    ? `https://deploy.convex.site/api/mcp/${key}`
    : "https://deploy.convex.site/api/mcp";
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("MCP HTTP 엔드포인트", () => {
  it("GET — 유효 키로 서버 상태를 반환한다 (브라우저 진단용)", async () => {
    const { ctx } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      new Request(`https://deploy.convex.site/api/mcp/${VALID_KEY}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.server.name).toBe("crabpitch");
    expect(body.plan).toBe("solo");
  });

  it("initialize — 프로토콜 버전과 serverInfo를 돌려준다", async () => {
    const { ctx } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      post(VALID_KEY, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {} },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.protocolVersion).toBe("2024-11-05");
    expect(body.result.serverInfo.name).toBe("crabpitch");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it("tools/list — 도구 5종을 노출한다", async () => {
    const { ctx } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      post(VALID_KEY, { jsonrpc: "2.0", id: 2, method: "tools/list" }),
    );
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual([
      "crabpitch_status",
      "crabpitch_match_journalists",
      "crabpitch_email_template",
      "crabpitch_classify",
      "crabpitch_press_guide",
    ]);
  });

  it("tools/call — crabpitch_status를 실행하고 키 사용시각을 갱신한다", async () => {
    const { ctx, calls } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      post(VALID_KEY, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "crabpitch_status", arguments: {} },
      }),
    );
    const body = await res.json();
    expect(body.result.content[0].type).toBe("text");
    expect(JSON.parse(body.result.content[0].text).plan).toBe("solo");
    expect(calls).toContain("mcpInternal:touchKey");
  });

  it("키가 없으면 401 — 인증 방법을 안내한다", async () => {
    const { ctx } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      post(null, { jsonrpc: "2.0", id: 4, method: "tools/list" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toMatch(/cp_mcp_/);
  });

  it("무료 플랜·폐기 키는 401 — 유료 안내 메시지를 준다", async () => {
    const { ctx } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      post(FREE_KEY, { jsonrpc: "2.0", id: 5, method: "tools/list" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toMatch(/유료 플랜|Solo/);
  });

  it("OPTIONS — CORS 프리플라이트를 허용한다", async () => {
    const { ctx } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      new Request(`https://deploy.convex.site/api/mcp/${VALID_KEY}`, {
        method: "OPTIONS",
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("알 수 없는 method는 JSON-RPC -32601", async () => {
    const { ctx } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      post(VALID_KEY, { jsonrpc: "2.0", id: 6, method: "nope/nope" }),
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });
});
