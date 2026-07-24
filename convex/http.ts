import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { gmailOAuthCallback } from "./gmailHttp";
import {
  agencyApiOptions,
  agencyCampaignsHttp,
  agencyClientsHttp,
  agencyPressReleasesHttp,
} from "./agencyHttp";

const http = httpRouter();

// Convex Auth 콜백/토큰 라우트 등록
auth.addHttpRoutes(http);

// BYO Gmail OAuth 콜백 (로그인용 Google Auth 와 별개)
http.route({
  path: "/gmail/callback",
  method: "GET",
  handler: gmailOAuthCallback,
});

// Agency REST API (Bearer cp_live_…)
http.route({ path: "/api/v1/clients", method: "OPTIONS", handler: agencyApiOptions });
http.route({ path: "/api/v1/clients", method: "GET", handler: agencyClientsHttp });
http.route({ path: "/api/v1/clients", method: "POST", handler: agencyClientsHttp });

http.route({ path: "/api/v1/campaigns", method: "OPTIONS", handler: agencyApiOptions });
http.route({ path: "/api/v1/campaigns", method: "GET", handler: agencyCampaignsHttp });

http.route({
  path: "/api/v1/press-releases",
  method: "OPTIONS",
  handler: agencyApiOptions,
});
http.route({
  path: "/api/v1/press-releases",
  method: "POST",
  handler: agencyPressReleasesHttp,
});

export default http;
