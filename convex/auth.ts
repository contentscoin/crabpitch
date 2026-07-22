import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Convex Auth — MVP 는 이메일/비밀번호(Password) 제공자.
 * Google OAuth(Gmail BYO-Email) 는 GOOGLE_CLIENT_ID/SECRET 설정 후 providers 에 추가.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
