import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

function siteUrl() {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function requireGmailOAuthEnv() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("oauth_env");
  }
  return { clientId, clientSecret };
}

/** OAuth 콜백 — http.ts 에서 `/gmail/callback` 에 등록. */
export const gmailOAuthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const app = siteUrl();

  if (err) {
    return Response.redirect(`${app}/settings?gmail=error&reason=${encodeURIComponent(err)}`, 302);
  }
  if (!code || !state) {
    return Response.redirect(`${app}/settings?gmail=error&reason=missing_code`, 302);
  }

  const userId = await ctx.runMutation(internal.gmailAccounts.consumeOauthState, { state });
  if (!userId) {
    return Response.redirect(`${app}/settings?gmail=error&reason=invalid_state`, 302);
  }

  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = requireGmailOAuthEnv());
  } catch {
    return Response.redirect(`${app}/settings?gmail=error&reason=oauth_env`, 302);
  }

  const redirectUri = `${url.origin}/gmail/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    return Response.redirect(
      `${app}/settings?gmail=error&reason=${encodeURIComponent(text.slice(0, 80))}`,
      302,
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = (await profileRes.json()) as { email?: string };
  if (!profile.email) {
    return Response.redirect(`${app}/settings?gmail=error&reason=no_email`, 302);
  }

  await ctx.runMutation(internal.gmailAccounts.upsertAccount, {
    userId,
    email: profile.email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
    scope: tokens.scope,
  });

  return Response.redirect(`${app}/settings?gmail=connected`, 302);
});
