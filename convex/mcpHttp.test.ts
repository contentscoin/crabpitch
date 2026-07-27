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
const REVOKED_KEY = "cp_mcp_" + "c".repeat(48);

type QueryHandler = (args: Record<string, unknown>) => unknown;

function makeCtx(overrides: Record<string, QueryHandler> = {}) {
  const calls: string[] = [];
  const defaults: Record<string, QueryHandler> = {
    "mcpInternal:resolveKey": (args) => {
      const bearer = String(args.bearer ?? "");
      if (bearer === VALID_KEY) {
        return { userId: "user_1", keyId: "key_1", plan: "solo" };
      }
      // 무료도 연결은 된다 — 제한은 도구 단위로 건다.
      if (bearer === FREE_KEY) {
        return { userId: "user_2", keyId: "key_2", plan: "free" };
      }
      // 폐기·미존재 키만 null (mcpAuth.resolveUserMcpKey 동작)
      return null;
    },
    "mcpInternal:touchKey": () => null,
    "mcpInternal:matchJournalists": (args) => ({
      topicTags: ["핀테크"],
      matches: [],
      _topK: args.topK,
    }),
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

  it("폐기·미존재 키는 401 — 키 발급 경로를 안내한다", async () => {
    const { ctx } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      post(REVOKED_KEY, { jsonrpc: "2.0", id: 5, method: "tools/list" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toMatch(/키/);
  });

  it("무료 키는 인증은 되고 도구 목록만 좁아진다", async () => {
    const { ctx } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      post(FREE_KEY, { jsonrpc: "2.0", id: 6, method: "tools/list" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = (body.result.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names.sort()).toEqual(["crabpitch_press_guide", "crabpitch_status"]);
  });

  it("유료 키에는 도구 5종이 모두 보인다", async () => {
    const { ctx } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      post(VALID_KEY, { jsonrpc: "2.0", id: 7, method: "tools/list" }),
    );
    const body = await res.json();
    expect((body.result.tools as unknown[]).length).toBe(5);
  });

  it("무료가 유료 도구를 직접 호출하면 막고 사유를 준다", async () => {
    // 목록을 건너뛰고 부르는 클라이언트가 있으므로 호출 경로도 막아야 한다.
    const { ctx, calls } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      post(FREE_KEY, {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "crabpitch_match_journalists", arguments: { query: "핀테크" } },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/유료 플랜 전용/);
    // 게이트에서 끊겼으므로 매칭 질의 자체가 실행되지 않아야 한다.
    expect(calls).not.toContain("mcpInternal:matchJournalists");
  });

  it("무료도 보도자료 도구는 정상 호출된다", async () => {
    const { ctx, calls } = makeCtx({
      "mcpInternal:pressGuide": () => ({ guide: "## 구조", note: "n" }),
    });
    const res = await handleMcpRequest(
      ctx,
      post(FREE_KEY, {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "crabpitch_press_guide", arguments: { section: "structure" } },
      }),
    );
    const body = await res.json();
    expect(body.result.isError).toBeUndefined();
    expect(calls).toContain("mcpInternal:pressGuide");
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

describe("crabpitch_match_journalists — 인원 상한", () => {
  async function call(limit: number) {
    const { ctx } = makeCtx();
    const res = await handleMcpRequest(
      ctx,
      post(VALID_KEY, {
        jsonrpc: "2.0",
        id: 90,
        method: "tools/call",
        params: {
          name: "crabpitch_match_journalists",
          arguments: { query: "핀테크", limit },
        },
      }),
    );
    return JSON.parse((await res.json()).result.content[0].text);
  }

  it("20명을 넘겨도 잘라내지 않는다 — 권장치이지 금지선이 아니다", async () => {
    const body = await call(50);
    expect(body._topK).toBe(50);
  });

  it("권장치를 넘으면 스팸 위험을 안내한다", async () => {
    const body = await call(50);
    expect(body.sendingGuidance).toMatch(/스팸/);
    expect(body.sendingGuidance).toMatch(/20/);
  });

  it("권장치 이내면 기본 안내만 붙는다", async () => {
    const body = await call(10);
    expect(body._topK).toBe(10);
    expect(body.sendingGuidance).toMatch(/20명 이하를 권장/);
  });

  it("남용 방지 상한(100)은 유지한다", async () => {
    const body = await call(5000);
    expect(body._topK).toBe(100);
  });
});
