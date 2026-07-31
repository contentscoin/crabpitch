"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader, EmptyState, CampaignStatusBadge } from "@/components/app/bits";
import { SkeletonRows } from "@/components/ui/Skeleton";

export default function CampaignsPage() {
  const campaigns = useQuery(api.campaigns.list);

  return (
    <div>
      <PageHeader
        title="캠페인"
        description="보도자료 배포 실행 단위입니다. 각 캠페인에서 매칭·초안·발송·회신을 관리하세요."
        action={
          <Link href="/campaigns/new">
            <Button>
              <Send className="h-4 w-4" /> 새 캠페인
            </Button>
          </Link>
        }
      />

      {campaigns === undefined ? (
        <SkeletonRows rows={4} />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Send}
          title="캠페인이 없습니다"
          description="보도자료를 정리하면 알맞은 기자 매칭부터 시작됩니다."
          action={
            <Link href="/campaigns/new">
              <Button>새 보도자료 배포</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs font-semibold text-foreground-muted">
              <tr>
                <th className="px-5 py-3">캠페인</th>
                <th className="px-4 py-3">상태</th>
                <th className="hidden px-4 py-3 sm:table-cell">매칭</th>
                <th className="hidden px-4 py-3 sm:table-cell">초안</th>
                <th className="hidden px-4 py-3 sm:table-cell">발송</th>
                <th className="px-4 py-3">회신</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((c) => (
                <tr key={c._id} className="transition-colors hover:bg-surface">
                  <td className="px-5 py-3.5">
                    <Link href={`/campaigns/${c._id}`} className="font-semibold hover:text-brand">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <CampaignStatusBadge status={c.status} />
                  </td>
                  <td className="hidden px-4 py-3.5 tabular-nums sm:table-cell">{c.matchCount}</td>
                  <td className="hidden px-4 py-3.5 tabular-nums sm:table-cell">{c.draftCount}</td>
                  <td className="hidden px-4 py-3.5 tabular-nums sm:table-cell">{c.sentCount}</td>
                  <td className="px-4 py-3.5 tabular-nums">{c.replyCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
