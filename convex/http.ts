import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { gmailOAuthCallback } from "./gmailHttp";

const http = httpRouter();

// Convex Auth 콜백/토큰 라우트 등록
auth.addHttpRoutes(http);

// BYO Gmail OAuth 콜백 (로그인용 Google Auth 와 별개)
http.route({
  path: "/gmail/callback",
  method: "GET",
  handler: gmailOAuthCallback,
});

export default http;
