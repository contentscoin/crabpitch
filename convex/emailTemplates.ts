import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./model";

/** 내 커스텀 메일 템플릿 목록. */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("userEmailTemplates"),
      name: v.string(),
      subject: v.string(),
      body: v.string(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("userEmailTemplates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((t) => ({
        _id: t._id,
        name: t.name,
        subject: t.subject,
        body: t.body,
        updatedAt: t.updatedAt,
      }));
  },
});

const MAX_TEMPLATES_PER_USER = 10;
const MAX_NAME_LEN = 100;
const MAX_SUBJECT_LEN = 200;
const MAX_BODY_LEN = 20_000;

/** 저장(신규 또는 수정). 본문 없는 템플릿은 거부, 필드별 길이 상한 강제. */
export const save = mutation({
  args: {
    id: v.optional(v.id("userEmailTemplates")),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  returns: v.id("userEmailTemplates"),
  handler: async (ctx, { id, name, subject, body }) => {
    const userId = await requireUser(ctx);
    const trimmedName = name.trim() || "내 템플릿";
    if (!body.trim()) throw new Error("본문 템플릿을 입력하세요.");
    if (trimmedName.length > MAX_NAME_LEN)
      throw new Error(`템플릿 이름은 ${MAX_NAME_LEN}자 이내로 입력하세요.`);
    if (subject.trim().length > MAX_SUBJECT_LEN)
      throw new Error(`제목 템플릿은 ${MAX_SUBJECT_LEN}자 이내로 입력하세요.`);
    if (body.length > MAX_BODY_LEN)
      throw new Error(`본문 템플릿은 ${MAX_BODY_LEN.toLocaleString()}자 이내로 입력하세요.`);

    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing || existing.userId !== userId) {
        throw new Error("템플릿을 찾을 수 없습니다.");
      }
      await ctx.db.patch(id, {
        name: trimmedName,
        subject: subject.trim(),
        body,
        updatedAt: Date.now(),
      });
      return id;
    }

    const count = (
      await ctx.db
        .query("userEmailTemplates")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).length;
    if (count >= MAX_TEMPLATES_PER_USER) {
      throw new Error(`커스텀 템플릿은 최대 ${MAX_TEMPLATES_PER_USER}개까지 저장할 수 있습니다.`);
    }

    return await ctx.db.insert("userEmailTemplates", {
      userId,
      name: trimmedName,
      subject: subject.trim(),
      body,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("userEmailTemplates") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) {
      throw new Error("템플릿을 찾을 수 없습니다.");
    }
    await ctx.db.delete(id);
    return null;
  },
});
