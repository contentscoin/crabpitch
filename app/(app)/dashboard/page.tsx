"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Mail,
  Megaphone,
  Send,
  Sparkles,
  Inbox,
  ShieldCheck,
  BarChart3,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader, StatCard, EmptyState, CampaignStatusBadge, REPLY_TYPES } from "@/components/app/bits";
import { McpDashboardCard } from "@/components/app/McpGuide";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { toUserMessage } from "@/lib/errorMessage";
import { OnboardingChecklist } from "@/components/app/OnboardingChecklist";

export default function DashboardPage() {
  const usage = useQuery(api.usage.getMyUsage);
  const analytics = useQuery(api.usage.getAnalytics);
  const campaigns = useQuery(api.campaigns.list);
  const profile = useQuery(api.profiles.getMyProfile);
  const onboarding = useQuery(api.onboarding.getMyChecklist);
  const seedDemo = useMutation(api.seed.seedDemoForMe);
  const toast = useToast();
  const [seeding, setSeeding] = useState(false);

  const companyName = profile?.profile?.companyName ?? profile?.user?.name ?? "";

  /*
    축 판정은 `getMyChecklist`에서 받는다 — `profile.activeClientId` 존재만 보면
    `campaigns.list`와 어긋난다(클라이언트 문서 삭제·멤버십 박탈 시 그 쿼리는 조용히
    사용자 축으로 떨어지지만 `activeClientId`는 남아 있다).
    `OnboardingChecklist`가 같은 쿼리를 구독하므로 Convex가 구독을 합쳐 추가 비용은 없다.

    로딩 중(`undefined`)에는 데모 버튼을 **숨긴 채로 둔다**. 보여 준 뒤 사라지게 하면
    누르려던 버튼이 손 밑에서 없어진다.
  */
  const isClientScoped = onboarding?.isClientScoped ?? true;

  async function runSeed() {
    setSeeding(true);
    try {
      await seedDemo({});
      toast.success("데모 캠페인과 매칭을 만들었습니다.");
    } catch (e) {
      // 기존에는 try/finally만 있어 실패해도 아무 표시가 없었다 — 버튼만 원래대로 돌아갔다.
      toast.error(toUserMessage(e));
    } finally {
      setSeeding(false);
    }
  }

  const typeEntries = analytics
    ? (Object.entries(analytics.replyByType) as Array<[keyof typeof REPLY_TYPES, number]>).filter(
        ([, n]) => n > 0,
      )
    : [];

  return (
    <div>
      <PageHeader
        title={companyName ? `${companyName} 대시보드` : "대시보드"}
        description="매칭 → 작성 → 발송 → 응대. 실행 루프와 게재·회신 성과를 한눈에 봅니다."
        action={
          <Link href="/campaigns/new">
            <Button>
              <Send className="h-4 w-4" /> 새 보도자료 배포
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="이번 달 발송 잔여"
          value={usage ? `${usage.sendsRemaining}통` : "…"}
          hint={
            usage
              ? `${usage.limits.label} · 한도 ${usage.limits.sends === 1000000 ? "무제한" : usage.limits.sends + "통"}`
              : undefined
          }
          icon={Mail}
        />
        <StatCard
          label="보도자료 잔여"
          value={
            usage
              ? `${usage.pressReleasesRemaining === 99999 || usage.pressReleasesRemaining >= 9999 ? "무제한" : usage.pressReleasesRemaining + "건"}`
              : "…"
          }
          hint="월 기준"
          icon={Megaphone}
        />
        <StatCard
          label="게재율"
          value={analytics ? `${analytics.publishRate}%` : "…"}
          hint={
            analytics
              ? `발송 ${analytics.sentCount} · 게재 ${analytics.publishedCount}`
              : undefined
          }
          icon={BarChart3}
        />
        <StatCard
          label="미처리 회신"
          value={analytics ? `${analytics.unhandledReplies}건` : "…"}
          hint={
            analytics
              ? `인터뷰 대기 ${analytics.interviewOpen} · 예약 ${analytics.scheduledCampaigns}`
              : undefined
          }
          icon={Inbox}
        />
      </div>

      {/*
        숫자(위)를 보여 준 다음 "그래서 뭘 해야 하나"(아래)를 말한다.
        `campaigns`를 넘기는 이유: 이 화면이 이미 `campaigns.list`를 구독한다 —
        체크리스트가 따로 구독하면 같은 데이터에 쿼리가 둘로 늘어난다.
      */}
      <OnboardingChecklist campaigns={campaigns} />

      <div className="mt-6">
        <h2 className="mb-3 text-lg font-bold">내 AI</h2>
        <McpDashboardCard />
      </div>

      {analytics && (analytics.queuedCount > 0 || analytics.scheduledCampaigns > 0) && (
        <Card className="mt-4 flex items-start gap-3 border-border p-4">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <p className="text-sm text-foreground-muted">
            예약·대기 중 초안 <b className="text-foreground">{analytics.queuedCount}통</b>
            {analytics.scheduledCampaigns > 0 && (
              <> · 예약 캠페인 <b className="text-foreground">{analytics.scheduledCampaigns}개</b></>
            )}
            . 시각이 되면 자동으로 발송 기록됩니다.
          </p>
        </Card>
      )}

      {typeEntries.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-bold">회신 유형 분포</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {typeEntries.map(([type, count]) => (
              <Card key={type}>
                <CardContent className="flex items-center justify-between py-3">
                  <span className="text-sm text-foreground-muted">{REPLY_TYPES[type]?.label ?? type}</span>
                  <span className="text-lg font-bold tabular-nums">{count}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card className="mt-6 flex items-start gap-3 border-brand/20 bg-brand-soft/50 p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <p className="text-sm text-foreground-muted">
          모든 기자 데이터는 <b className="text-foreground">candidate</b> 상태입니다. 매칭·리스트업은 자유롭게,
          <b className="text-foreground"> 실제 발송은 승인 게이트 통과 후에만</b> 진행됩니다. 메일에는 수신거부 문구가
          기본 삽입되고, 수신거부 회신은 억제 리스트에 영구 등록됩니다.
        </p>
      </Card>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">최근 캠페인</h2>
          {campaigns && campaigns.length > 0 && (
            <Link href="/campaigns" className="text-sm font-semibold text-brand hover:underline">
              전체 보기
            </Link>
          )}
        </div>

        {campaigns === undefined ? (
          <SkeletonRows rows={4} />
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="아직 캠페인이 없습니다"
            description={
              isClientScoped
                ? "이 클라이언트로 만든 캠페인이 없습니다. 위 시작하기에서 첫 보도자료를 작성하세요."
                : "매칭·초안 흐름을 먼저 체험하고 싶으면 데모 데이터를 만들어 보세요."
            }
            action={
              /*
                "새 보도자료 작성" CTA를 없앴다 — 상단 시작하기 체크리스트가 그 역할을 한다.
                `campaigns.length === 0`이면 체크리스트의 "첫 캠페인 만들기"가 반드시 미완료라
                체크리스트가 **항상** 함께 렌더된다. 두 곳에서 같은 데로 보내면 어느 쪽이
                다음 걸음인지 흐려진다.

                에이전시 클라이언트 컨텍스트에서는 데모 버튼도 숨긴다:
                `seed.seedDemoForMe`는 `agencyClientId`를 넣지 않는데 `campaigns.list`는
                `activeClientId`가 있으면 `by_client`로 조회한다 → 만들어도 이 목록에
                나타나지 않는다. 성공 토스트만 뜨고 화면은 그대로인 버튼은 고장으로 보인다.
              */
              isClientScoped ? undefined : (
                <Button onClick={runSeed} icon={Sparkles} loading={seeding} variant="brand">
                  {seeding ? "생성 중…" : "데모 데이터 생성"}
                </Button>
              )
            }
          />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {campaigns.slice(0, 6).map((c) => (
              <Link
                key={c._id}
                href={`/campaigns/${c._id}`}
                className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c.name}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    매칭 {c.matchCount} · 초안 {c.draftCount} · 발송 {c.sentCount} · 회신 {c.replyCount}
                  </div>
                </div>
                <CampaignStatusBadge status={c.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
