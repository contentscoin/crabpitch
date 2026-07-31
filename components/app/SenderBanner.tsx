"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AlertTriangle, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import {
  parseSnoozedUntil,
  SENDER_BANNER_SNOOZE_KEY,
  SENDER_BANNER_SNOOZE_MS,
  shouldShowSenderBanner,
} from "@/lib/onboarding";

/**
 * 발신 수단(SMTP/Gmail) 미연결 경고 배너.
 *
 * 없던 동안의 실패 경로: 사용자가 초안까지 다 만들고 발송을 눌렀을 때야 막혔다.
 * 들인 노력이 가장 큰 지점에서 처음 알려 주는 셈이었다. 앱 어디서든 미리 알린다.
 *
 * 판정은 `lib/onboarding.shouldShowSenderBanner`가 한다 — 렌더 테스트 하네스가 없으므로
 * 조건을 컴포넌트 안에 두면 검증할 수 없다.
 *
 * ⚠️ `getMyChecklist`를 대시보드의 `OnboardingChecklist`와 함께 구독하지만, Convex 클라이언트는
 *    같은 (함수, 인자) 쌍의 구독을 하나로 합친다 → 쿼리가 두 번 실행되지 않는다.
 */
export function SenderBanner() {
  const server = useQuery(api.onboarding.getMyChecklist);
  const pathname = usePathname();

  // 서버 렌더에서는 `localStorage`를 읽을 수 없다. 마운트 전에는 아무것도 렌더하지 않아
  // 하이드레이션 불일치를 피한다.
  const [mounted, setMounted] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState(0);

  useEffect(() => {
    try {
      setSnoozedUntil(parseSnoozedUntil(localStorage.getItem(SENDER_BANNER_SNOOZE_KEY)));
    } catch {
      // 사파리 프라이빗 모드 등에서 localStorage 접근이 던질 수 있다.
      // 스누즈를 못 읽는 건 배너를 못 띄우는 것보다 낫다 → 0으로 둔다.
    }
    setMounted(true);
  }, []);

  const visible = shouldShowSenderBanner({
    senderKind: server?.senderKind ?? null,
    pathname: pathname ?? "",
    mounted,
    snoozedUntil,
    now: Date.now(),
  });

  if (!visible) return null;

  function snooze() {
    const until = Date.now() + SENDER_BANNER_SNOOZE_MS;
    try {
      localStorage.setItem(SENDER_BANNER_SNOOZE_KEY, String(until));
    } catch {
      // 저장에 실패해도 이번 세션에서는 숨긴다.
    }
    setSnoozedUntil(until);
  }

  return (
    // `role="status"`가 아니라 정적 영역이다 — 페이지 진입 시점에 이미 있는 내용이라
    // 라이브 리전으로 알릴 대상이 아니다.
    <div className="border-b border-warning/30 bg-warning/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-foreground-muted">
          <b className="text-foreground">발신 수단이 연결되지 않았습니다.</b> 초안은 만들 수 있지만
          기자에게 메일은 나가지 않습니다.
        </p>
        <Link href="/settings" className={buttonClasses({ size: "sm" })}>
          연결하기
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
