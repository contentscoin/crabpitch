"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signUp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
      router.push("/dashboard");
    } catch (err) {
      setError(
        flow === "signUp"
          ? "가입에 실패했습니다. 이미 등록된 이메일이거나 비밀번호가 너무 짧습니다."
          : "로그인에 실패했습니다. 이메일/비밀번호를 확인하세요.",
      );
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

      {/* 우: 폼 */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-extrabold lg:hidden">
            <span className="text-xl">🦀</span> 크랩피치
          </Link>
          <h2 className="text-2xl font-extrabold">
            {flow === "signUp" ? "무료로 시작하기" : "다시 오셨네요"}
          </h2>
          <p className="mt-1.5 text-sm text-foreground-muted">
            {flow === "signUp"
              ? "이메일과 비밀번호로 계정을 만드세요."
              : "계정에 로그인하세요."}
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            {flow === "signUp" && (
              <div>
                <Label htmlFor="name">이름 / 회사명</Label>
                <Input id="name" name="name" placeholder="예) 큐레잇" autoComplete="name" />
              </div>
            )}
            <div>
              <Label htmlFor="email">이메일</Label>
              <Input id="email" name="email" type="email" required placeholder="you@company.com" autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                placeholder="8자 이상"
                autoComplete={flow === "signUp" ? "new-password" : "current-password"}
              />
            </div>

            {error && (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "처리 중…" : flow === "signUp" ? "무료 계정 만들기" : "로그인"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-foreground-muted">
            {flow === "signUp" ? "이미 계정이 있으신가요?" : "계정이 없으신가요?"}{" "}
            <button
              type="button"
              onClick={() => {
                setFlow(flow === "signUp" ? "signIn" : "signUp");
                setError(null);
              }}
              className="font-bold text-brand hover:underline"
            >
              {flow === "signUp" ? "로그인" : "가입하기"}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
