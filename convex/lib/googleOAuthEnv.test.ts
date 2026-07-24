import { describe, expect, it } from "vitest";
import { requireGoogleOAuthClient } from "./googleOAuthEnv";

describe("googleOAuthEnv", () => {
  it("GMAIL_* 를 우선한다", () => {
    const prev = {
      gId: process.env.GMAIL_OAUTH_CLIENT_ID,
      gSec: process.env.GMAIL_OAUTH_CLIENT_SECRET,
      aId: process.env.AUTH_GOOGLE_ID,
      aSec: process.env.AUTH_GOOGLE_SECRET,
    };
    try {
      process.env.GMAIL_OAUTH_CLIENT_ID = "gmail-id";
      process.env.GMAIL_OAUTH_CLIENT_SECRET = "gmail-secret";
      process.env.AUTH_GOOGLE_ID = "auth-id";
      process.env.AUTH_GOOGLE_SECRET = "auth-secret";
      const r = requireGoogleOAuthClient();
      expect(r.source).toBe("gmail");
      expect(r.clientId).toBe("gmail-id");
    } finally {
      process.env.GMAIL_OAUTH_CLIENT_ID = prev.gId;
      process.env.GMAIL_OAUTH_CLIENT_SECRET = prev.gSec;
      process.env.AUTH_GOOGLE_ID = prev.aId;
      process.env.AUTH_GOOGLE_SECRET = prev.aSec;
    }
  });

  it("GMAIL 없으면 AUTH_GOOGLE 로 폴백한다", () => {
    const prev = {
      gId: process.env.GMAIL_OAUTH_CLIENT_ID,
      gSec: process.env.GMAIL_OAUTH_CLIENT_SECRET,
      aId: process.env.AUTH_GOOGLE_ID,
      aSec: process.env.AUTH_GOOGLE_SECRET,
    };
    try {
      delete process.env.GMAIL_OAUTH_CLIENT_ID;
      delete process.env.GMAIL_OAUTH_CLIENT_SECRET;
      process.env.AUTH_GOOGLE_ID = "auth-id";
      process.env.AUTH_GOOGLE_SECRET = "auth-secret";
      const r = requireGoogleOAuthClient();
      expect(r.source).toBe("auth");
      expect(r.clientId).toBe("auth-id");
    } finally {
      process.env.GMAIL_OAUTH_CLIENT_ID = prev.gId;
      process.env.GMAIL_OAUTH_CLIENT_SECRET = prev.gSec;
      process.env.AUTH_GOOGLE_ID = prev.aId;
      process.env.AUTH_GOOGLE_SECRET = prev.aSec;
    }
  });
});
