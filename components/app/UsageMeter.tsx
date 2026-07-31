"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Progress } from "@/components/ui/Progress";
import { cn } from "@/lib/utils";

const UNLIMITED = 1000000;

/**
 * 이번 달 발송 사용량.
 *
 * ⚠️ 모바일에서 **숨기지 않는다.** 이전에는 `hidden sm:block`이라 한도에 걸린 사용자가
 *    작은 화면에서는 이유를 볼 수 없었다 — 발송이 막히는 가장 흔한 원인인데 그 정보가
 *    화면에서 사라지는 것이다. 작은 화면에서는 막대를 접고 숫자 배지만 남긴다.
 */
export function UsageMeter() {
  const usage = useQuery(api.usage.getMyUsage);
  if (!usage) return null;

  const unlimited = usage.limits.sends >= UNLIMITED;
  const pct = usage.limits.sends > 0 ? (usage.sendsUsed / usage.limits.sends) * 100 : 0;
  const tone = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "brand";
  const limitText = unlimited ? "∞" : String(usage.limits.sends);
  const countText = `${usage.sendsUsed}/${limitText}`;

  return (
    <>
      {/* 좁은 화면: 숫자 배지만. 색으로만 알리지 않도록 값을 항상 글자로 보여 준다. */}
      <span
        className={cn(
          "rounded-md border px-2 py-1 text-[11px] font-bold tabular-nums sm:hidden",
          tone === "danger"
            ? "border-danger/40 bg-danger/10 text-danger"
            : tone === "warning"
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-border bg-surface text-foreground-muted",
        )}
        // 배지만 보면 "7/10"이 무엇인지 알 수 없다.
        title={`이번 달 발송 사용량 ${countText}`}
      >
        <span className="sr-only">이번 달 발송 </span>
        {countText}
      </span>

      <div className="hidden w-44 sm:block">
        <div className="mb-1 flex justify-between text-[11px] font-semibold text-foreground-muted">
          <span>{usage.limits.label} · 발송</span>
          <span className="tabular-nums">{countText}</span>
        </div>
        {/*
          한도가 무제한이면 진행률은 의미가 없다(항상 0%에 붙어 있다).
          `aria-valuenow=0`을 계속 낭독시키지 않고 막대를 빼는 쪽이 맞다.
        */}
        {!unlimited && <Progress value={pct} tone={tone} label="이번 달 발송 사용량" />}
      </div>
    </>
  );
}
