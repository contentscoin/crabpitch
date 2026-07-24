"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  buildOpenCrabQueryBody,
  extractJournalistsFromResponse,
} from "./lib/opencrabMap";
import {
  fetchOpenCrabViaHttp,
  fetchOpenCrabViaMcp,
  resolveOpenCrabTransport,
} from "./lib/opencrabClient";

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

    const topK = args.topK ?? 15;
    const body = buildOpenCrabQueryBody(args.topicTags ?? [], topK);
    const transport = resolveOpenCrabTransport(baseUrl, apiKey);

    try {
      const payload =
        transport.mode === "mcp"
          ? await fetchOpenCrabViaMcp(transport.endpoint, body.query, topK)
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
