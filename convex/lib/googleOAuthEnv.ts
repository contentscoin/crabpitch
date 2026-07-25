/**
 * Google OAuth 클라이언트 — Gmail BYO 우선, 없으면 로그인용 AUTH_GOOGLE_* 재사용.
 * 프로덕션에 로그인 OAuth만 있는 경우에도 Gmail 연결이 동작하도록 한다.
 * (Google 콘솔에 `/gmail/callback` 리디렉션 URI는 별도 등록 필요)
 */
export function requireGoogleOAuthClient(): {
  clientId: string;
  clientSecret: string;
  source: "gmail" | "auth";
} {
  const gmailId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  const gmailSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
  if (gmailId && gmailSecret) {
    return { clientId: gmailId, clientSecret: gmailSecret, source: "gmail" };
  }

  const authId = process.env.AUTH_GOOGLE_ID?.trim();
  const authSecret = process.env.AUTH_GOOGLE_SECRET?.trim();
  if (authId && authSecret) {
    return { clientId: authId, clientSecret: authSecret, source: "auth" };
  }

  throw new Error(
    "Google OAuth 미설정: GMAIL_OAUTH_CLIENT_ID/SECRET 또는 AUTH_GOOGLE_ID/SECRET 를 Convex에 설정하세요.",
  );
}
