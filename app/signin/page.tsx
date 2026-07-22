"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleGoogle() {
    setLoading(true);
    setError(null);
    try {
      void signIn("google", { redirectTo: "/dashboard" });
    } catch {
      setError("로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* 좌: 브랜드 패널 */}
      <div className="hero-glow hidden flex-col justify-between p-12 lg:flex">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold">
          <span className="text-xl">🦀</span> 크랩피치
        </Link>
        <div>
          <h1 className="max-w-md text-4xl font-extrabold leading-tight">
            말만 하면,<br />
            <span className="text-gradient-brand">알맞은 기자에게</span><br />
            보도자료가 갑니다.
          </h1>
          <p className="mt-5 max-w-md text-foreground-muted">
            검증된 한국 기자 온톨로지와 당신의 Gmail을 연결해, 매칭 → 작성 → 발송 → 응대까지
            대화 한 번으로. 승인 게이트·수신거부·억제 리스트가 기본 탑재됩니다.
          </p>
        </div>
        <div className="text-[13px] text-muted">
          ✓ 신용카드 불필요 · ✓ 내 Gmail(BYO-Email) · ✓ 무료 월 10통
        </div>
      </div>

      {/* 우: Google 로그인 */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-extrabold lg:hidden">
            <span className="text-xl">🦀</span> 크랩피치
          </Link>
          <h2 className="text-2xl font-extrabold">무료로 시작하기</h2>
          <p className="mt-1.5 text-sm text-foreground-muted">
            Google 계정으로 3초 만에 시작하세요. 발송은 본인 Gmail로 나갑니다.
          </p>

          <Button
            onClick={handleGoogle}
            disabled={loading}
            size="lg"
            variant="outline"
            className="mt-7 w-full gap-3"
          >
            <GoogleIcon />
            {loading ? "이동 중…" : "Google로 계속하기"}
          </Button>

          {error && (
            <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <p className="mt-5 text-center text-xs text-muted">
            계속하면 서비스 약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
          </p>
        </div>
      </div>
    </main>
  );
}
