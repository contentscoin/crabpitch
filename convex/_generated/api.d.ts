/* eslint-disable */
/**
 * Generated API types.
 *
 * NOTE: `npx convex dev` 실행 시 실제 함수 기준으로 재생성됩니다.
 */
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as agency from "../agency.js";
import type * as aiActions from "../aiActions.js";
import type * as auth from "../auth.js";
import type * as byoAi from "../byoAi.js";
import type * as campaigns from "../campaigns.js";
import type * as drafts from "../drafts.js";
import type * as gmailAccounts from "../gmailAccounts.js";
import type * as gmailActions from "../gmailActions.js";
import type * as integrations from "../integrations.js";
import type * as journalists from "../journalists.js";
import type * as mediaKits from "../mediaKits.js";
import type * as opencrab from "../opencrab.js";
import type * as opencrabActions from "../opencrabActions.js";
import type * as pressReleases from "../pressReleases.js";
import type * as profiles from "../profiles.js";
import type * as replies from "../replies.js";
import type * as seed from "../seed.js";
import type * as suppression from "../suppression.js";
import type * as usage from "../usage.js";

declare const fullApi: ApiFromModules<{
  agency: typeof agency;
  aiActions: typeof aiActions;
  auth: typeof auth;
  byoAi: typeof byoAi;
  campaigns: typeof campaigns;
  drafts: typeof drafts;
  gmailAccounts: typeof gmailAccounts;
  gmailActions: typeof gmailActions;
  integrations: typeof integrations;
  journalists: typeof journalists;
  mediaKits: typeof mediaKits;
  opencrab: typeof opencrab;
  opencrabActions: typeof opencrabActions;
  pressReleases: typeof pressReleases;
  profiles: typeof profiles;
  replies: typeof replies;
  seed: typeof seed;
  suppression: typeof suppression;
  usage: typeof usage;
}>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
