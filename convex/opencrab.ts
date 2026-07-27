import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireUser } from "./model";
import { maskEmailsInText } from "./lib/packSync";

const referenceArticleValidator = v.object({
  title: v.string(),
  url: v.optional(v.string()),
  topic: v.optional(v.string()),
  publishedAtText: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
});

const journalistRow = v.object({
  name: v.string(),
  outlet: v.string(),
  email: v.string(),
  beatPrimary: v.string(),
  beatSecondary: v.array(v.string()),
  contactConfidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  referenceArticleCount: v.number(),
  topReferenceTitle: v.optional(v.string()),
  topReferenceUrl: v.optional(v.string()),
  mailingStatus: v.string(),
  source: v.literal("opencrab"),
  // 팩 고유 필드
  naverOid: v.optional(v.string()),
  contactVerification: v.optional(v.string()),
  contactEvidenceCount: v.optional(v.number()),
  contactSourceUrls: v.optional(v.array(v.string())),
  beatDistribution: v.optional(v.array(v.object({ beat: v.string(), weight: v.number() }))),
  classificationConfidence: v.optional(v.string()),
  referenceArticles: v.optional(v.array(referenceArticleValidator)),
  latestArticleAt: v.optional(v.number()),
  outletCategory: v.optional(v.string()),
});

/**
 * OpenCrab 동기화 결과 업서트(이메일 키). 액션에서만 호출.
 *
 * ⚠️ 화이트리스트 패치: 팩에서 온 필드만 명시적으로 갱신한다. 발송·컴플라이언스 축
 * (`mailingStatus`는 항상 candidate 고정, 그리고 향후 추가될 발송 이력 필드)은 동기화가
 * 절대 덮어쓰지 않는다 — 쿨다운 판정 데이터 보호의 전제. suppressionList도 이 계층에서
 * 참조·수정하지 않는다(발송 직전 sendGuard가 재대조 — 책임 분리).
 */
export const upsertFromOpenCrab = internalMutation({
  args: {
    journalists: v.array(journalistRow),
    packPackageId: v.optional(v.string()),
    packBatch: v.optional(v.string()),
  },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx, { journalists, packPackageId, packBatch }) => {
    let inserted = 0;
    let updated = 0;
    const now = Date.now();

    for (const j of journalists) {
      // 팩 유래 필드만 담은 패치 — 여기 없는 필드는 어떤 경우에도 건드리지 않는다.
      const packPatch = {
        name: j.name,
        outlet: j.outlet,
        beatPrimary: j.beatPrimary,
        beatSecondary: j.beatSecondary,
        contactConfidence: j.contactConfidence,
        referenceArticleCount: j.referenceArticleCount,
        topReferenceTitle: j.topReferenceTitle,
        topReferenceUrl: j.topReferenceUrl,
        naverOid: j.naverOid,
        contactVerification: j.contactVerification,
        contactEvidenceCount: j.contactEvidenceCount,
        contactSourceUrls: j.contactSourceUrls,
        beatDistribution: j.beatDistribution,
        classificationConfidence: j.classificationConfidence,
        referenceArticles: j.referenceArticles,
        latestArticleAt: j.latestArticleAt,
        outletCategory: j.outletCategory,
        packPackageId,
        packBatch,
        packSyncedAt: now,
        lastSeenInPackAt: now,
        // 컴플라이언스: 팩 값과 무관하게 항상 candidate
        mailingStatus: "candidate",
        source: "opencrab",
      };

      const existing = await ctx.db
        .query("journalists")
        .withIndex("by_email", (q) => q.eq("email", j.email))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, packPatch);
        updated += 1;
      } else {
        await ctx.db.insert("journalists", { email: j.email, ...packPatch });
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

/** 팩 목록 조회 결과를 레지스트리 테이블에 반영(신규 시리즈는 syncEnabled=false로 진입). */
export const upsertPackMeta = internalMutation({
  args: {
    packs: v.array(
      v.object({
        packageId: v.string(),
        series: v.string(),
        batch: v.optional(v.string()),
        name: v.optional(v.string()),
        recordCount: v.optional(v.number()),
        capturedAt: v.optional(v.string()),
        fingerprint: v.optional(v.string()),
        /** 자동 동기화 대상 시리즈인지 — 신규/파생 시리즈는 false(관리자 승인 대기) */
        autoSync: v.boolean(),
      }),
    ),
  },
  returns: v.object({ created: v.number(), changed: v.number() }),
  handler: async (ctx, { packs }) => {
    const now = Date.now();
    let created = 0;
    let changed = 0;
    for (const p of packs) {
      const existing = await ctx.db
        .query("opencrabPacks")
        .withIndex("by_packageId", (q) => q.eq("packageId", p.packageId))
        .unique();
      if (existing) {
        const isChanged =
          existing.fingerprint !== p.fingerprint || existing.capturedAt !== p.capturedAt;
        await ctx.db.patch(existing._id, {
          series: p.series,
          batch: p.batch,
          name: p.name,
          recordCount: p.recordCount,
          capturedAt: p.capturedAt,
          fingerprint: p.fingerprint,
          lastSeenAt: now,
          // syncEnabled는 관리자 결정 — 목록 갱신이 덮어쓰지 않는다
        });
        if (isChanged) changed += 1;
      } else {
        await ctx.db.insert("opencrabPacks", {
          packageId: p.packageId,
          series: p.series,
          batch: p.batch,
          name: p.name,
          recordCount: p.recordCount,
          capturedAt: p.capturedAt,
          fingerprint: p.fingerprint,
          syncEnabled: p.autoSync,
          firstSeenAt: now,
          lastSeenAt: now,
        });
        created += 1;
      }
    }
    return { created, changed };
  },
});

/** 동기화 대상 팩 목록(액션이 무엇을 가져올지 결정할 때 사용). */
/**
 * 프로젝트에서 빠진 팩의 자동 동기화를 끈다.
 *
 * 프로젝트는 큐레이션된 집합이라 거기서 제외했다는 건 "더 쓰지 않는다"는 뜻이다.
 * 그런데 레지스트리 테이블은 upsert만 해서 한 번 등록된 팩이 영원히 남았고,
 * 깨진 배치 팩 25개가 프로젝트에서 제거된 뒤에도 계속 동기화돼 실패 목록을 채웠다.
 *
 * 삭제하지 않고 syncEnabled만 내린다 — 이력과 마지막 오류를 남겨 둔다.
 */
export const disablePacksMissingFromProject = internalMutation({
  args: { keepPackageIds: v.array(v.string()) },
  returns: v.object({ disabled: v.number() }),
  handler: async (ctx, { keepPackageIds }) => {
    const keep = new Set(keepPackageIds);
    let disabled = 0;
    for (const p of await ctx.db.query("opencrabPacks").collect()) {
      if (keep.has(p.packageId) || !p.syncEnabled) continue;
      await ctx.db.patch(p._id, { syncEnabled: false });
      disabled += 1;
    }
    return { disabled };
  },
});

export const listSyncablePacks = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      packageId: v.string(),
      series: v.string(),
      batch: v.optional(v.string()),
      fingerprint: v.optional(v.string()),
      lastSyncedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db.query("opencrabPacks").collect();
    return rows
      .filter((r) => r.syncEnabled)
      .map((r) => ({
        packageId: r.packageId,
        series: r.series,
        batch: r.batch,
        fingerprint: r.fingerprint,
        lastSyncedAt: r.lastSyncedAt,
      }));
  },
});

/** 팩 1개 단위 실행 기록 — 오류 문자열은 저장 전 이메일 마스킹(PII 유출 차단). */
export const recordSyncRun = internalMutation({
  args: {
    packageId: v.string(),
    status: v.string(),
    startedAt: v.number(),
    recordCount: v.optional(v.number()),
    fetched: v.number(),
    inserted: v.number(),
    updated: v.number(),
    error: v.optional(v.string()),
    trigger: v.string(),
    fingerprint: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("packSyncRuns", {
      packageId: args.packageId,
      status: args.status,
      startedAt: args.startedAt,
      finishedAt: Date.now(),
      recordCount: args.recordCount,
      fetched: args.fetched,
      inserted: args.inserted,
      updated: args.updated,
      error: args.error ? maskEmailsInText(args.error).slice(0, 500) : undefined,
      trigger: args.trigger,
    });

    const pack = await ctx.db
      .query("opencrabPacks")
      .withIndex("by_packageId", (q) => q.eq("packageId", args.packageId))
      .unique();
    if (pack && args.status !== "failed") {
      await ctx.db.patch(pack._id, {
        lastSyncedAt: Date.now(),
        ...(args.fingerprint ? { fingerprint: args.fingerprint } : {}),
        ...(args.recordCount !== undefined ? { recordCount: args.recordCount } : {}),
      });
    }
    return null;
  },
});

/** 클라이언트가 OpenCrab 설정 여부를 UI에 표시할 때 사용(키 값은 노출하지 않음). */
export const syncStatus = query({
  args: {},
  returns: v.object({
    journalistCount: v.number(),
    opencrabConfigured: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireUser(ctx);
    const journalists = await ctx.db.query("journalists").collect();
    // 클라이언트에는 설정 여부만 — 실제 키 존재는 액션에서 판단하고,
    // 여기선 opencrab 소스 레코드 유무로 힌트를 준다.
    const fromOpenCrab = journalists.some((j) => j.source === "opencrab");
    return {
      journalistCount: journalists.length,
      opencrabConfigured: fromOpenCrab,
    };
  },
});
