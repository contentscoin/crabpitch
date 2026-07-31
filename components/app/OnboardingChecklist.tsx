"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  buildOnboardingChecklist,
  toCampaignState,
  type OnboardingStep,
} from "@/lib/onboarding";

/**
 * 가입 직후 "다음에 할 일"을 알려 주는 체크리스트.
 *
 * 없던 동안 사용자는 첫 발송까지 화면 7개를 스스로 찾아다녀야 했고, 대시보드에는
 * "데모 데이터 생성" 버튼만 있었다.
 *
 * ⚠️ 판정 규칙은 이 파일에 두지 않는다 — `lib/onboarding.ts`의 순수 함수가 정본이다.
 *    렌더 테스트 하네스가 없어서(`environment: "node"`) 컴포넌트 안의 규칙은 검증할 수 없다.
 *
 * `campaigns`를 prop으로 받는 이유: 대시보드가 이미 `campaigns.list`를 구독한다.
 * 여기서 또 구독하면 같은 데이터에 대한 쿼리가 둘로 늘어난다.
 */
export function OnboardingChecklist({
  campaigns,
}: {
  campaigns: Array<{ matchCount: number; sentCount: number }> | undefined;
}) {
  const server = useQuery(api.onboarding.getMyChecklist);
  const campaignState = toCampaignState(campaigns);

  if (server === undefined || campaignState === null) {
    return <SkeletonCard lines={4} className="mt-6" />;
  }

  const checklist = buildOnboardingChecklist(server, campaignState);

  // 다 끝났으면 **렌더하지 않는다.** "완료" 상태로 남기면 영구히 자리를 먹는다.
  if (checklist.allDone) return null;

  const { steps, doneCount, totalCount, nextStep } = checklist;
  const hasAccountScoped = steps.some((s) => s.accountScoped);
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  return (
    <Card className="mt-6 border-brand/20 bg-brand-soft/30">
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">시작하기</h2>
          {/* 진행률은 **보이는 텍스트**로 전달한다. 막대는 장식이다. */}
          <span className="text-sm font-semibold tabular-nums text-brand">
            {doneCount}/{totalCount}
            {hasAccountScoped && (
              <span className="ml-1 font-normal text-muted">(이 클라이언트)</span>
            )}
          </span>
        </div>

        {/*
          `Progress`에는 아직 `role="progressbar"`가 없다. 여기서 붙이면 기존 사용처
          3곳(사용량 미터·미디어킷 완성도·보도자료 점수)이 **이름 없는 progressbar**가 되어
          새 위반을 만든다. 접근성 작업(라벨 필수화 + 4곳 문구 지정)은 별도로 한다.
          그때까지는 장식으로 감춰 두고 위의 "n/m" 텍스트가 의미를 전달한다.
        */}
        <div aria-hidden="true" className="mt-3">
          <Progress value={percent} />
        </div>

        {/*
          ⚠️ 단계 목록을 둘로 쪼개지 않는다. 쪼개면 순서 번호가 각각 1부터 다시 시작해
          스크린리더가 "1 of 3" 다음에 다시 "1 of 2"를 읽고, "5단계 중 어디"라는 정보가
          마크업에서 사라진다. 하나의 목록에 정본 순서대로 두고, 진행률에서 빠지는 단계는
          항목 안의 "계정 공통" 표시로 알린다.
        */}
        <ol className="mt-4 space-y-2">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} isNext={step.id === nextStep?.id} />
          ))}
        </ol>

        {hasAccountScoped && (
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
            <span className="font-semibold">계정 공통</span> 표시된 단계는 클라이언트별로 나뉘지
            않아 위 진행률에서 빠집니다 — 계정에 한 번만 설정하면 됩니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 단계 한 줄.
 *
 * **미완료 단계 중 첫 번째만** CTA를 강조한다. 전부 강조하면 다음 한 걸음이 무엇인지
 * 알 수 없고, 온보딩의 목적이 사라진다.
 */
function StepRow({ step, isNext }: { step: OnboardingStep; isNext: boolean }) {
  /*
    링크 이름에 단계 라벨을 넣는다. "지금 하기"/"이동"/"확인"만 있으면 링크 목록으로
    훑는 스크린리더 사용자에게 "이동, 이동, 확인"만 남아 어느 단계인지 알 수 없다
    (WCAG 2.4.9 — 링크 목적을 링크 텍스트만으로 알 수 있어야 한다).
  */
  const actionText = step.done ? "확인" : isNext ? "지금 하기" : "이동";

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
          step.done
            ? step.warn
              ? "border-warning bg-warning/15 text-warning"
              : "border-success bg-success/15 text-success"
            : "border-border text-muted",
        )}
        aria-hidden="true"
      >
        {step.done ? (
          step.warn ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "text-sm font-semibold",
            step.done && !step.warn ? "text-foreground-muted" : "text-foreground",
          )}
        >
          {step.label}
          {/* 상태를 색·아이콘에만 의존하지 않는다. */}
          <span className="sr-only">{step.done ? " (완료)" : " (미완료)"}</span>
        </span>
        {step.accountScoped && (
          <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted">
            계정 공통
          </span>
        )}
        <span
          className={cn(
            "ml-2 text-xs",
            step.warn ? "text-warning" : "text-foreground-muted",
          )}
        >
          {step.description}
        </span>
      </span>

      {/* 완료 단계는 경고가 있을 때만 링크를 남긴다 — 고칠 것이 있는 경우다. */}
      {(!step.done || step.warn) && (
        <Link
          href={step.href}
          aria-label={`${step.label} — ${actionText}`}
          className={
            isNext
              ? buttonClasses({ size: "sm" })
              : buttonClasses({ size: "sm", variant: "subtle" })
          }
        >
          {actionText}
          {isNext && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
        </Link>
      )}
    </li>
  );
}
