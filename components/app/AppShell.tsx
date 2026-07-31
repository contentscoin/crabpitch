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
        <div className="min-h-screen bg-background">
          <Sidebar />
          <div className="md:pl-64">
            <Topbar />
            {/*
              Topbar 바로 아래 · MobileNav 위. 발송이 불가능하다는 사실은 어느 화면에서든
              보여야 하므로 셸에 둔다(대시보드·설정 화면은 배너 쪽에서 제외한다).
            */}
            <SenderBanner />
            <MobileNav />
            <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          </div>
        </div>
      </Authenticated>
    </>
  );
}
