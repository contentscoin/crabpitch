/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as agency from "../agency.js";
import type * as agencyHttp from "../agencyHttp.js";
import type * as aiActions from "../aiActions.js";
import type * as aiKeys from "../aiKeys.js";
import type * as auth from "../auth.js";
import type * as byoAi from "../byoAi.js";
import type * as campaigns from "../campaigns.js";
import type * as crons from "../crons.js";
import type * as drafts from "../drafts.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as gmailAccounts from "../gmailAccounts.js";
import type * as gmailActions from "../gmailActions.js";
import type * as gmailHttp from "../gmailHttp.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as journalists from "../journalists.js";
import type * as lib_agencyAuth from "../lib/agencyAuth.js";
import type * as lib_anthropicEnhance from "../lib/anthropicEnhance.js";
import type * as lib_byoAi from "../lib/byoAi.js";
import type * as lib_byoCli from "../lib/byoCli.js";
import type * as lib_emailCompliance from "../lib/emailCompliance.js";
import type * as lib_emailTemplate from "../lib/emailTemplate.js";
import type * as lib_followUp from "../lib/followUp.js";
import type * as lib_gmailMime from "../lib/gmailMime.js";
import type * as lib_googleOAuthEnv from "../lib/googleOAuthEnv.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_interviewSlots from "../lib/interviewSlots.js";
import type * as lib_llm from "../lib/llm.js";
import type * as lib_mask from "../lib/mask.js";
import type * as lib_mcpAuth from "../lib/mcpAuth.js";
import type * as lib_mcpHttpAuth from "../lib/mcpHttpAuth.js";
import type * as lib_opencrabClient from "../lib/opencrabClient.js";
import type * as lib_opencrabMap from "../lib/opencrabMap.js";
import type * as lib_mediaKitCompleteness from "../lib/mediaKitCompleteness.js";
import type * as lib_mediaKitEnhance from "../lib/mediaKitEnhance.js";
import type * as lib_packRegistry from "../lib/packRegistry.js";
import type * as lib_packSync from "../lib/packSync.js";
import type * as lib_plans from "../lib/plans.js";
import type * as lib_platformAdmin from "../lib/platformAdmin.js";
import type * as lib_pressLint from "../lib/pressLint.js";
import type * as lib_pressGuide from "../lib/pressGuide.js";
import type * as lib_replyLlm from "../lib/replyLlm.js";
import type * as lib_replyClassifier from "../lib/replyClassifier.js";
import type * as lib_sendGuard from "../lib/sendGuard.js";
import type * as lib_scoring from "../lib/scoring.js";
import type * as mcpHttp from "../mcpHttp.js";
import type * as mcpInternal from "../mcpInternal.js";
import type * as mediaKits from "../mediaKits.js";
import type * as model from "../model.js";
import type * as opencrab from "../opencrab.js";
import type * as opencrabActions from "../opencrabActions.js";
import type * as pressReleases from "../pressReleases.js";
import type * as profiles from "../profiles.js";
import type * as replies from "../replies.js";
import type * as seed from "../seed.js";
import type * as suppression from "../suppression.js";
import type * as usage from "../usage.js";
import type * as userMcpKeys from "../userMcpKeys.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  agency: typeof agency;
  agencyHttp: typeof agencyHttp;
  aiActions: typeof aiActions;
  aiKeys: typeof aiKeys;
  auth: typeof auth;
  byoAi: typeof byoAi;
  campaigns: typeof campaigns;
  crons: typeof crons;
  drafts: typeof drafts;
  emailTemplates: typeof emailTemplates;
  gmailAccounts: typeof gmailAccounts;
  gmailActions: typeof gmailActions;
  gmailHttp: typeof gmailHttp;
  http: typeof http;
  integrations: typeof integrations;
  journalists: typeof journalists;
  "lib/agencyAuth": typeof lib_agencyAuth;
  "lib/anthropicEnhance": typeof lib_anthropicEnhance;
  "lib/byoAi": typeof lib_byoAi;
  "lib/byoCli": typeof lib_byoCli;
  "lib/emailCompliance": typeof lib_emailCompliance;
  "lib/emailTemplate": typeof lib_emailTemplate;
  "lib/followUp": typeof lib_followUp;
  "lib/gmailMime": typeof lib_gmailMime;
  "lib/googleOAuthEnv": typeof lib_googleOAuthEnv;
  "lib/http": typeof lib_http;
  "lib/interviewSlots": typeof lib_interviewSlots;
  "lib/llm": typeof lib_llm;
  "lib/mask": typeof lib_mask;
  "lib/mcpAuth": typeof lib_mcpAuth;
  "lib/mcpHttpAuth": typeof lib_mcpHttpAuth;
  "lib/opencrabClient": typeof lib_opencrabClient;
  "lib/opencrabMap": typeof lib_opencrabMap;
  "lib/mediaKitCompleteness": typeof lib_mediaKitCompleteness;
  "lib/mediaKitEnhance": typeof lib_mediaKitEnhance;
  "lib/packRegistry": typeof lib_packRegistry;
  "lib/packSync": typeof lib_packSync;
  "lib/plans": typeof lib_plans;
  "lib/platformAdmin": typeof lib_platformAdmin;
  "lib/pressGuide": typeof lib_pressGuide;
  "lib/pressLint": typeof lib_pressLint;
  "lib/replyLlm": typeof lib_replyLlm;
  "lib/replyClassifier": typeof lib_replyClassifier;
  "lib/sendGuard": typeof lib_sendGuard;
  "lib/scoring": typeof lib_scoring;
  mcpHttp: typeof mcpHttp;
  mcpInternal: typeof mcpInternal;
  mediaKits: typeof mediaKits;
  model: typeof model;
  opencrab: typeof opencrab;
  opencrabActions: typeof opencrabActions;
  pressReleases: typeof pressReleases;
  profiles: typeof profiles;
  replies: typeof replies;
  seed: typeof seed;
  suppression: typeof suppression;
  usage: typeof usage;
  userMcpKeys: typeof userMcpKeys;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
