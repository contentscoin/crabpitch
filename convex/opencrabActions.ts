"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  buildOpenCrabQueryBody,
  extractJournalistsFromResponse,
  normalizePackReporters,
} from "./lib/opencrabMap";
import {
  fetchOpenCrabViaHttp,
  fetchOpenCrabViaMcp,
  fetchPackDocuments,
  fetchPackList,
  fetchProjectPacks,
  openOpenCrabMcpSession,
  resolveOpenCrabTransport,
} from "./lib/opencrabClient";
import {
  classifySyncStatus,
  parsePackListPayload,
  parseProjectPacksPayload,
  parsePackPayload,
} from "./lib/packSync";
import {
  JOURNALIST_PROJECT_NAME,
  JOURNALIST_WORKSPACE_ID,
  PR_PRESSKIT_PROJECT_NAME,
  SYNC_SOURCE_PACKS,
  classifyPackSeries,
  extractBatch,
  shouldAutoSync,
} from "./lib/packRegistry";

/**
 * OpenCrab 심 — HTTP 또는 MCP(`ocm_` 키)로 조회 후 업서트.
 * 미설정·실패 시 `{ synced: 0, mode: "skipped"|"error" }` (시드/기존 DB로 매칭 계속).
 */
export const syncJournalists = action({
  args: {
    topicTags: v.optional(v.array(v.string())),
    topK: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    synced: number;
    inserted: number;
    updated: number;
    mode: "opencrab" | "skipped" | "error";
    message?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");

    const baseUrl = process.env.OPENCRAB_API_URL?.trim();
    const apiKey = process.env.OPENCRAB_API_KEY?.trim();
    if (!baseUrl || !apiKey) {
      return {
        synced: 0,
        inserted: 0,
        updated: 0,
        mode: "skipped",
        message: "OPENCRAB_API_URL/KEY 미설정 — 시드·기존 기자 DB로 매칭합니다.",
      };
    }

    // 기본 15는 한 번 돌려도 15명밖에 안 들어와 디렉터리가 계속 얇았다.
    // 팩 전체(현재 306청크 규모)를 한 번에 받도록 넉넉히 잡는다.
    const topK = args.topK ?? 200;
    const body = buildOpenCrabQueryBody(args.topicTags ?? [], topK);
    const transport = resolveOpenCrabTransport(baseUrl, apiKey);

    try {
      const payload =
        transport.mode === "mcp"
          ? // MCP 팩 스코프는 package_id로만 건다. HTTP 계약의 pack_query는 그대로 유지
            // (서버 구현이 다르다) — 자세한 근거는 opencrabClient.fetchOpenCrabViaMcp 주석.
            await fetchOpenCrabViaMcp(transport.endpoint, body.query, topK, body.package_id)
          : await fetchOpenCrabViaHttp(transport.endpoint, apiKey, body);

      const journalists = extractJournalistsFromResponse(payload).slice(0, topK);

      if (journalists.length === 0) {
        return {
          synced: 0,
          inserted: 0,
          updated: 0,
          mode: "opencrab",
          message:
            transport.mode === "mcp"
              ? "OpenCrab MCP 응답에 정규화 가능한 기자 레코드가 없습니다. (팩 설치·문서 인제스트 필요)"
              : "OpenCrab 응답에 정규화 가능한 기자 레코드가 없습니다.",
        };
      }

      const result: { inserted: number; updated: number } = await ctx.runMutation(
        internal.opencrab.upsertFromOpenCrab,
        { journalists },
      );

      return {
        synced: journalists.length,
        inserted: result.inserted,
        updated: result.updated,
        mode: "opencrab",
        message: `OpenCrab(${transport.mode})에서 ${journalists.length}명 동기화 (신규 ${result.inserted} · 갱신 ${result.updated})`,
      };
    } catch (e) {
      return {
        synced: 0,
        inserted: 0,
        updated: 0,
        mode: "error",
        message: e instanceof Error ? e.message : "OpenCrab 동기화 실패",
      };
    }
  },
});

/* ── 기자단 팩 동기화 파이프라인 (트랙 A) ─────────────────────
 * 트리거: 일 1회 크론(`syncPacksInternal`) + 관리자 수동(`syncPacksManual`).
 * 원칙: LLM 무사용 순수 파싱 · email 키 업서트 · mailingStatus는 항상 candidate ·
 *       **팩 1개 단위 커밋**(Convex 액션은 트랜잭션이 아니므로 1개 실패가 25개를 막지 않는다).
 */

interface PackSyncSummary {
  mode: "opencrab" | "skipped" | "error";
  packsAttempted: number;
  ok: number;
  partial: number;
  failed: number;
  inserted: number;
  updated: number;
  message?: string;
}

/** 팩 목록을 완주해 레지스트리 테이블에 반영한다(실패해도 상수 폴백으로 계속). */
async function refreshPackRegistry(
  ctx: { runMutation: (ref: any, args: any) => Promise<any> },
  call: (toolName: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<void> {
  const seen = new Map<
    string,
    { name?: string; capturedAt?: string; fromProject: boolean }
  >();

  // ① 프로젝트 우선 — 사람이 큐레이션한 명시적 집합이다.
  //    키워드 탐색만 쓰던 시절, 제목 규칙이 다른 신규 시리즈 13팩이 조용히 빠져 있었다.
  for (const projectName of [JOURNALIST_PROJECT_NAME, PR_PRESSKIT_PROJECT_NAME]) {
    try {
      const payload = await fetchProjectPacks(call, projectName);
      for (const p of parseProjectPacksPayload(payload, projectName)) {
        seen.set(p.packageId, {
          name: p.name,
          capturedAt: p.capturedAt,
          fromProject: true,
        });
      }
    } catch {
      // 프로젝트 조회 실패는 치명적이지 않다 — 아래 키워드 탐색으로 이어간다.
    }
  }

  // ② 키워드 탐색 — 프로젝트에 아직 안 담긴 팩을 줍는 보조 경로.
  //    여기서만 발견된 팩은 fromProject=false라 관리자 승인을 기다린다.
  for (const query of ["journalist", "presskit"]) {
    let cursor: string | undefined;
    // 커서 완주(무한 루프 방지 상한 20페이지)
    for (let page = 0; page < 20; page += 1) {
      const payload = await fetchPackList(call, query, cursor);
      const parsed = parsePackListPayload(payload);
      for (const p of parsed.packs) {
        if (!seen.has(p.packageId)) {
          seen.set(p.packageId, {
            name: p.name,
            capturedAt: p.capturedAt,
            fromProject: false,
          });
        }
      }
      if (!parsed.hasMore || !parsed.nextCursor) break;
      cursor = parsed.nextCursor;
    }
  }
  if (seen.size === 0) return;

  const packs = [...seen.entries()].map(([packageId, meta]) => {
    const label = meta.name ?? packageId;
    const series = classifyPackSeries(label);
    return {
      packageId,
      series,
      batch: extractBatch(label),
      name: meta.name,
      capturedAt: meta.capturedAt,
      // 프로젝트 소속이면 제목이 무엇이든 동기화 대상. 그 밖은 관리자 승인 대기.
      autoSync: shouldAutoSync(series, meta.fromProject),
    };
  });
  await ctx.runMutation(internal.opencrab.upsertPackMeta, { packs });
}

async function runPackSync(
  ctx: any,
  trigger: "cron" | "manual",
  packageIds?: string[],
): Promise<PackSyncSummary> {
  const baseUrl = process.env.OPENCRAB_API_URL?.trim();
  const apiKey = process.env.OPENCRAB_API_KEY?.trim();
  const empty: PackSyncSummary = {
    mode: "skipped",
    packsAttempted: 0,
    ok: 0,
    partial: 0,
    failed: 0,
    inserted: 0,
    updated: 0,
  };
  if (!baseUrl || !apiKey) {
    return { ...empty, message: "OPENCRAB_API_URL/KEY 미설정 — 팩 동기화를 건너뜁니다." };
  }

  const transport = resolveOpenCrabTransport(baseUrl, apiKey);
  if (transport.mode !== "mcp") {
    return {
      ...empty,
      message: "팩 동기화는 MCP 키(ocm_)에서만 동작합니다. HTTP 모드에서는 건너뜁니다.",
    };
  }

  let call: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  try {
    call = await openOpenCrabMcpSession(transport.endpoint);
  } catch (e) {
    return {
      ...empty,
      mode: "error",
      message: e instanceof Error ? e.message : "OpenCrab MCP 세션 수립 실패",
    };
  }

  // ① 목록 완주 → 레지스트리 반영(실패는 치명적이지 않다 — 상수 폴백)
  try {
    await refreshPackRegistry(ctx, call);
  } catch {
    // 목록 조회 실패 시 packRegistry 상수로 진행한다.
  }

  // ② 동기화 대상 결정
  let targets: Array<{ packageId: string; batch?: string }> = [];
  if (packageIds?.length) {
    targets = packageIds.map((packageId) => ({ packageId }));
  } else {
    const enabled: Array<{ packageId: string; batch?: string }> = await ctx.runQuery(
      internal.opencrab.listSyncablePacks,
      {},
    );
    targets = enabled.length
      ? enabled
      : SYNC_SOURCE_PACKS.map((p) => ({ packageId: p.packageId, batch: p.batch }));
  }

  const summary: PackSyncSummary = {
    mode: "opencrab",
    packsAttempted: targets.length,
    ok: 0,
    partial: 0,
    failed: 0,
    inserted: 0,
    updated: 0,
  };

  // ③ 팩 1개 단위로 취득 → 업서트 → run 기록 (실패 격리)
  for (const target of targets) {
    const startedAt = Date.now();
    try {
      const payload = await fetchPackDocuments(call, target.packageId, {
        workspaceId: JOURNALIST_WORKSPACE_ID,
      });
      const parsed = parsePackPayload(payload);
      const journalists = normalizePackReporters(parsed.reporters);

      let inserted = 0;
      let updated = 0;
      if (journalists.length > 0) {
        const res: { inserted: number; updated: number } = await ctx.runMutation(
          internal.opencrab.upsertFromOpenCrab,
          {
            journalists,
            packPackageId: target.packageId,
            packBatch: target.batch ?? (parsed.batch !== undefined ? `batch-${String(parsed.batch).padStart(3, "0")}` : undefined),
          },
        );
        inserted = res.inserted;
        updated = res.updated;
      }

      const status = classifySyncStatus(journalists.length, parsed.recordCount, parsed.complete);
      const gapNote = parsed.gaps.length
        ? `청크 결손 ${parsed.gaps.length}구간(${parsed.gaps.map((g) => `${g.from}-${g.to}`).join(", ")})`
        : undefined;

      await ctx.runMutation(internal.opencrab.recordSyncRun, {
        packageId: target.packageId,
        status,
        startedAt,
        recordCount: parsed.recordCount,
        fetched: journalists.length,
        inserted,
        updated,
        error: parsed.parseError ?? gapNote,
        trigger,
        fingerprint: parsed.fingerprint,
      });

      summary.inserted += inserted;
      summary.updated += updated;
      if (status === "ok") summary.ok += 1;
      else if (status === "partial") summary.partial += 1;
      else summary.failed += 1;
    } catch (e) {
      summary.failed += 1;
      await ctx.runMutation(internal.opencrab.recordSyncRun, {
        packageId: target.packageId,
        status: "failed",
        startedAt,
        fetched: 0,
        inserted: 0,
        updated: 0,
        error: e instanceof Error ? e.message : "팩 동기화 실패",
        trigger,
      });
    }
  }

  summary.message = `팩 ${summary.packsAttempted}개 중 정상 ${summary.ok} · 결손 ${summary.partial} · 실패 ${summary.failed} (신규 ${summary.inserted} · 갱신 ${summary.updated})`;
  return summary;
}

/** 크론 전용 — 인증이 필요 없는 내부 액션(기존 syncJournalists는 로그인 필수라 크론 불가). */
export const syncPacksInternal = internalAction({
  args: { packageIds: v.optional(v.array(v.string())) },
  handler: async (ctx, { packageIds }): Promise<PackSyncSummary> =>
    await runPackSync(ctx, "cron", packageIds),
});

/** 관리자 수동 실행 — 특정 팩만 재시도할 수 있다. */
export const syncPacksManual = action({
  args: { packageIds: v.optional(v.array(v.string())) },
  handler: async (ctx, { packageIds }): Promise<PackSyncSummary> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");
    const allowed: boolean = await ctx.runQuery(
      internal.admin.assertPlatformAdminInternal,
      { userId },
    );
    if (!allowed) throw new Error("플랫폼 관리자만 실행할 수 있습니다.");
    return await runPackSync(ctx, "manual", packageIds);
  },
});
