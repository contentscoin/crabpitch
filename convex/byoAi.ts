import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getProfile, requireUser } from "./model";
import {
  AI_PROVIDERS,
  buildOpenCrabMcpSnippet,
  buildSkillBootstrapPrompt,
  isAiProviderId,
  resolveLaunchUrls,
  SKILL_PACK_URL,
  skillRawUrl,
  type AiProviderId,
  type SkillId,
} from "./lib/byoAi";

const providerValidator = v.union(
  v.literal("claude"),
  v.literal("chatgpt"),
  v.literal("gemini"),
);

const skillValidator = v.union(
  v.literal("press-release-writer"),
  v.literal("media-kit-builder"),
  v.literal("journalist-outreach"),
  v.literal("reply-handler"),
);

/** 선호 AI + 런치 메타(딥링크·스킬 URL). */
export const getHub = query({
  args: {},
  returns: v.object({
    preferredProvider: v.union(providerValidator, v.null()),
    providers: v.array(
      v.object({
        id: providerValidator,
        label: v.string(),
        short: v.string(),
        webNewChat: v.string(),
        appSchemes: v.array(v.string()),
        skillInstallHint: v.string(),
      }),
    ),
    skillPackUrl: v.string(),
    mcpSnippet: v.string(),
    note: v.string(),
  }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    const preferred = profile?.preferredAiProvider;
    return {
      preferredProvider:
        preferred && isAiProviderId(preferred) ? preferred : null,
      providers: (Object.keys(AI_PROVIDERS) as AiProviderId[]).map((id) => {
        const p = AI_PROVIDERS[id];
        return {
          id: p.id,
          label: p.label,
          short: p.short,
          webNewChat: p.webNewChat,
          appSchemes: p.appSchemes,
          skillInstallHint: p.skillInstallHint,
        };
      }),
      skillPackUrl: SKILL_PACK_URL,
      mcpSnippet: buildOpenCrabMcpSnippet(),
      note:
        "PC/모바일 ChatGPT·Claude·Gemini 앱의 로그인 세션을 자동으로 가져올 수는 없습니다. 이미 그 앱에 로그인해 두었다면, 아래 버튼으로 같은 계정 채팅을 열고 스킬을 붙여 사용하세요.",
    };
  },
});

export const setPreferredProvider = mutation({
  args: { provider: providerValidator },
  returns: v.null(),
  handler: async (ctx, { provider }) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("프로필이 없습니다.");
    await ctx.db.patch(profile._id, { preferredAiProvider: provider });
    return null;
  },
});

/** 스킬 실행용 프롬프트 + 열 URL 묶음. */
export const getLaunchPack = query({
  args: {
    provider: providerValidator,
    skill: skillValidator,
    who: v.optional(v.string()),
    headline: v.optional(v.string()),
    bodyHint: v.optional(v.string()),
    topicTags: v.optional(v.array(v.string())),
    extraNotes: v.optional(v.string()),
  },
  returns: v.object({
    provider: providerValidator,
    skill: skillValidator,
    prompt: v.string(),
    skillUrl: v.string(),
    skillPackUrl: v.string(),
    openUrls: v.array(v.string()),
    webUrl: v.string(),
    hint: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    const prompt = buildSkillBootstrapPrompt({
      skill: args.skill as SkillId,
      companyName: profile?.companyName,
      who: args.who,
      headline: args.headline,
      bodyHint: args.bodyHint,
      topicTags: args.topicTags,
      extraNotes: args.extraNotes,
    });
    const urls = resolveLaunchUrls(args.provider as AiProviderId);
    const meta = AI_PROVIDERS[args.provider as AiProviderId];
    return {
      provider: args.provider,
      skill: args.skill,
      prompt,
      skillUrl: skillRawUrl(args.skill as SkillId),
      skillPackUrl: SKILL_PACK_URL,
      openUrls: urls.fallbacks,
      webUrl: urls.primary,
      hint: meta.skillInstallHint,
    };
  },
});
