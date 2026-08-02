"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AlertTriangle, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import {
  readSnoozedUntil,
  SENDER_BANNER_SNOOZE_MS,
  senderBannerState,
  writeSnoozedUntil,
} from "@/lib/onboarding";

/**
 * 발신 수단 경고 배너.
 *
 * 없던 동안의 실패 경로: 사용자가 초안까지 다 만들고 발송을 눌렀을 때야 막혔다.
 * 들인 노력이 가장 큰 지점에서 처음 알려 주는 셈이었다. 앱 어디서든 미리 알린다.
 *
 * ⚠️ 임계값은 "발신 계정 행이 있는가"가 아니라 **"기자에게 메일이 나가는가"**다.
 *    Gmail만 연결한 사용자(초안까지만 가능)와 SMTP가 고장 난 사용자도 경고를 받는다.
 *
 * 판정은 `lib/onboarding.senderBannerState`가 한다 — 렌더 테스트 하네스가 없으므로
 * 조건을 컴포넌트 안에 두면 검증할 수 없다.
 *
 * `getMyChecklist`를 대시보드의 `OnboardingChecklist`와 함께 구독하지만, Convex 클라이언트는
 * 같은 (함수, 인자) 쌍의 구독을 하나로 합친다 → 쿼리가 두 번 실행되지 않는다.
 */
export function SenderBanner() {
  const server = useQuery(api.onboarding.getMyChecklist);
  const pathname = usePathname();
  const scopeKey = server?.scopeKey;

  // 서버 렌더에서는 `localStorage`를 읽을 수 없다. 마운트 전에는 아무것도 렌더하지 않아
  // 하이드레이션 불일치를 피한다. 스누즈는 사용자별 키이므로 scopeKey가 온 뒤에 읽는다.
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);

  useEffect(() => {
    if (scopeKey === undefined) return;
    setSnoozedUntil(readSnoozedUntil(scopeKey));
  }, [scopeKey]);

  const state = senderBannerState({
    senderKind: server?.senderKind ?? null,
    smtpStatus: server?.smtpStatus ?? null,
    pathname: pathname ?? "",
    mounted: snoozedUntil !== null,
    snoozedUntil: snoozedUntil ?? 0,
    now: Date.now(),
  });

  if (!state || scopeKey === undefined) return null;

  function snooze() {
    if (scopeKey === undefined) return;
    const until = Date.now() + SENDER_BANNER_SNOOZE_MS;
    writeSnoozedUntil(scopeKey, until);
    setSnoozedUntil(until);
  }

  return (
    // 라이브 리전으로 알리지 않는다 — 페이지 진입 시점에 이미 있는 정적 내용이다.
    <div className="border-b border-warning/30 bg-warning/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-foreground-muted">{state.message}</p>
        <Link
          href="/settings"
          className={buttonClasses({ size: "sm" })}
          aria-label={
            state.tone === "blocked" ? "설정에서 발신 수단 연결하기" : "설정에서 발신 수단 확인하기"
          }
        >
          {state.tone === "blocked" ? "연결하기" : "확인하기"}
        </Link>
        <button
          type="button"
          onClick={snooze}
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-warning/15 hover:text-foreground"
          aria-label="24시간 동안 숨기기"
          title="24시간 동안 숨기기"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
