"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Send } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
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
          <Link href="/campaigns/new" className={buttonClasses()}>
            <Send className="h-4 w-4" aria-hidden="true" /> 새 캠페인
          </Link>
        }
      />

      {campaigns === undefined ? (
        <SkeletonRows rows={4} />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Send}
          // PageHeader의 h1 바로 아래다 — 기본값 h3이면 h2를 건너뛴다.
          as="h2"
          title="캠페인이 없습니다"
          description="보도자료를 정리하면 알맞은 기자 매칭부터 시작됩니다."
          action={
            <Link href="/campaigns/new" className={buttonClasses()}>
              새 보도자료 배포
            </Link>
          }
        />
      ) : (
        <>
          {/*
            좁은 화면에서는 카드로 바꾼다. 표를 그대로 두면 매칭·초안·발송 컬럼이
            `sm:table-cell`로 숨어 **"회신 3"만 남고 그 3이 무엇 중 3인지 알 수 없다.**
            카드에서는 네 숫자를 라벨과 함께 모두 보여 준다.

            공통 컴포넌트로 뽑지 않는다 — 기자 목록의 행 구조가 다르고(비링크),
            지금 추출하면 두 화면의 우연한 유사성을 계약으로 굳힌다.
          */}
          <ul className="space-y-2 sm:hidden">
            {campaigns.map((c) => (
              <li key={c._id}>
                <Link
                  href={`/campaigns/${c._id}`}
                  /*
                    카드 전체를 링크로 둔다(터치 타깃). 다만 그러면 링크의 접근 가능한 이름이
                    카드 안 모든 텍스트를 이어 붙인 것("… 발송중 매칭 12 초안 8 …")이 되므로
                    `aria-label`로 이름을 캠페인명으로 고정한다. 숫자는 링크를 펼쳐 읽으면 된다.
                  */
                  aria-label={c.name}
                  className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-surface"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-semibold">{c.name}</span>
                    <CampaignStatusBadge status={c.status} />
                  </div>
                  <dl className="mt-2.5 grid grid-cols-4 gap-2 text-center">
                    {[
                      ["매칭", c.matchCount],
                      ["초안", c.draftCount],
                      ["발송", c.sentCount],
                      ["회신", c.replyCount],
                    ].map(([label, n]) => (
                      <div key={label}>
                        <dt className="text-[11px] text-muted">{label}</dt>
                        <dd className="text-sm font-bold tabular-nums">{n}</dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-lg border border-border bg-card sm:block">
            <table className="w-full text-sm">
              <caption className="sr-only">캠페인 목록 — 상태와 매칭·초안·발송·회신 건수</caption>
              <thead className="bg-surface text-left text-xs font-semibold text-foreground-muted">
                <tr>
                  <th scope="col" className="px-5 py-3">
                    캠페인
                  </th>
                  <th scope="col" className="px-4 py-3">
                    상태
                  </th>
                  <th scope="col" className="px-4 py-3">
                    매칭
                  </th>
                  <th scope="col" className="px-4 py-3">
                    초안
                  </th>
                  <th scope="col" className="px-4 py-3">
                    발송
                  </th>
                  <th scope="col" className="px-4 py-3">
                    회신
                  </th>
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
                    <td className="px-4 py-3.5 tabular-nums">{c.matchCount}</td>
                    <td className="px-4 py-3.5 tabular-nums">{c.draftCount}</td>
                    <td className="px-4 py-3.5 tabular-nums">{c.sentCount}</td>
                    <td className="px-4 py-3.5 tabular-nums">{c.replyCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
