"use client";

import { Authenticated, AuthLoading, Unauthenticated, useMutation } from "convex/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Sidebar, MobileNav } from "./Sidebar";
import { Topbar } from "./Topbar";
import { SenderBanner } from "./SenderBanner";

function EnsureProfile() {
  const ensure = useMutation(api.profiles.ensureProfile);
  useEffect(() => {
    ensure({}).catch(() => {});
  }, [ensure]);
  return null;
}

function RedirectSignin() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/signin");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-foreground-muted">
      로그인 페이지로 이동 중…
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center text-sm text-foreground-muted">
          불러오는 중…
        </div>
      </AuthLoading>
      <Unauthenticated>
        <RedirectSignin />
      </Unauthenticated>
      <Authenticated>
        <EnsureProfile />
        {/* `relative` — 아래 건너뛰기 링크의 절대 위치 기준이 된다. */}
        <div className="relative min-h-screen bg-background">
          {/*
            키보드·스크린리더 사용자는 매 화면마다 내비게이션 탭 8개를 지나야 본문에
            닿는다. 첫 포커스 대상이 되도록 DOM 최상단에 둔다.

            평소에는 `-translate-y-20`으로 화면 밖에 있고 포커스를 받으면 제자리로 온다.
            `hidden`이나 `display:none`으로 감추면 포커스를 아예 받을 수 없다.

            ⚠️ 글자색은 `text-brand-foreground` 토큰을 쓴다. `text-white`를 박으면 다크
               모드에서 브랜드 색 위 대비가 2.58:1로 떨어져 AA(4.5:1)를 못 넘는다 —
               접근성을 위해 넣은 요소가 접근성 기준을 깨는 형태가 된다.
          */}
          <a
            href="#main"
            className="absolute left-4 top-2 z-50 -translate-y-20 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-transform focus:translate-y-0"
          >
            본문으로 건너뛰기
          </a>
          <Sidebar />
          <div className="md:pl-64">
            <Topbar />
            {/*
              Topbar 바로 아래 · MobileNav 위. 발송이 불가능하다는 사실은 어느 화면에서든
              보여야 하므로 셸에 둔다(대시보드·설정 화면은 배너 쪽에서 제외한다).
            */}
            <SenderBanner />
            <MobileNav />
            {/*
              `tabIndex={-1}`이 있어야 건너뛰기 링크로 이동했을 때 포커스가 실제로
              여기 놓인다. 없으면 URL 해시만 바뀌고 다음 Tab이 문서 처음으로 돌아간다.
            */}
            <main
              id="main"
              tabIndex={-1}
              className="mx-auto max-w-6xl px-4 py-6 focus:outline-none sm:px-6 sm:py-8"
            >
              {children}
            </main>
          </div>
        </div>
      </Authenticated>
    </>
  );
}
