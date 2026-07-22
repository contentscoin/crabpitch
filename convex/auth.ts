import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Convex Auth — Google 로그인으로 통일(OAuth).
 * Convex 배포에 아래 환경변수가 있어야 한다:
 *   AUTH_GOOGLE_ID      (Google OAuth 클라이언트 ID)
 *   AUTH_GOOGLE_SECRET  (Google OAuth 클라이언트 시크릿)
 * 설정: `npx convex env set AUTH_GOOGLE_ID <id>` / `... AUTH_GOOGLE_SECRET <secret>`
 * 콜백 URL(Google Cloud 콘솔): https://<deployment>.convex.site/api/auth/callback/google
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
});
