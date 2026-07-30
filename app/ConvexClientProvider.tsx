"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/Dialog";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://placeholder-deployment.convex.cloud",
);

/**
 * 앱 전체의 **유일한 클라이언트 경계**. 랜딩·signin·앱이 모두 이 트리를 공유한다.
 *
 * Toast·Confirm Provider를 여기 둔다 — `AppShell`(인증된 트리) 안에 두면 랜딩과 signin에서
 * 쓸 수 없고, signin 실패 문구를 토스트로 옮기는 것이 범위에 포함된다.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </ConvexAuthNextjsProvider>
  );
}
