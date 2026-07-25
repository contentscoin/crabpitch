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

export default function DashboardPage() {
  const usage = useQuery(api.usage.getMyUsage);
  const analytics = useQuery(api.usage.getAnalytics);
  const campaigns = useQuery(api.campaigns.list);
  const profile = useQuery(api.profiles.getMyProfile);
  const seedDemo = useMutation(api.seed.seedDemoForMe);
  const [seeding, setSeeding] = useState(false);

  const companyName = profile?.profile?.companyName ?? profile?.user?.name ?? "";

  async function runSeed() {
    setSeeding(true);
    try {
      await seedDemo({});
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

      <div className="mt-6">
        <h2 className="mb-3 text-lg font-bold">내 AI · MCP</h2>
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
          <div className="h-40 animate-pulse rounded-lg border border-border bg-card" />
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="아직 캠페인이 없습니다"
            description="데모 데이터로 매칭·초안 흐름을 바로 체험하거나, 새 보도자료로 시작하세요."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={runSeed} disabled={seeding} variant="brand">
                  <Sparkles className="h-4 w-4" /> {seeding ? "생성 중…" : "데모 데이터 생성"}
                </Button>
                <Link href="/campaigns/new">
                  <Button variant="subtle">새 보도자료 작성</Button>
                </Link>
              </div>
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
