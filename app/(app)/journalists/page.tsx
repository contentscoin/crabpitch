"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Users, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfidenceBadge } from "@/components/ui/Badge";
import { PageHeader, EmptyState } from "@/components/app/bits";
import { SkeletonRows } from "@/components/ui/Skeleton";

export default function JournalistsPage() {
  const [search, setSearch] = useState("");
  const journalists = useQuery(api.journalists.list, { search: search || undefined });
  const seed = useMutation(api.seed.run);
  const [seeding, setSeeding] = useState(false);

  return (
    <div>
      <PageHeader
        title="기자 DB"
        description="OpenCrab 기자 온톨로지(candidate). 실명·이메일·연락처는 화면에 표시하지 않습니다."
        action={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="매체·beat 검색"
              className="w-56 pl-9"
            />
          </div>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand/20 bg-brand-soft/50 px-4 py-3 text-sm text-foreground-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        기자 개인정보 보호 — 실명·이메일·연락처는 익명 코드로 대체되며, 실제 연락처는 메일 발송 시점에만 사용됩니다.
      </div>

      {journalists === undefined ? (
        <SkeletonRows rows={5} />
      ) : journalists.length === 0 ? (
        <EmptyState
          icon={Users}
          as="h2"
          title={search ? "검색 결과가 없습니다" : "기자 DB가 비어 있습니다"}
          description={search ? "다른 키워드로 검색해 보세요." : "데모 기자 온톨로지를 불러오세요. (실서비스는 OpenCrab 연동)"}
          action={
            !search && (
              <Button
                onClick={async () => {
                  setSeeding(true);
                  try {
                    await seed({});
                  } finally {
                    setSeeding(false);
                  }
                }}
                disabled={seeding}
              >
                {seeding ? "불러오는 중…" : "기자 온톨로지 시드"}
              </Button>
            )
          }
        />
      ) : (
        <>
          {/*
            ⚠️ 전환 기준이 `lg`다(캠페인 목록은 `sm`). 가장 늦게 숨는 컬럼이
            `lg:table-cell`(기사수)이므로 `sm` 기준으로 하면 640~1024px 구간에서
            beat·기사수가 계속 사라진 표를 보게 된다 — 그 구간이 태블릿 세로다.
          */}
          <ul className="space-y-2 lg:hidden">
            {journalists.map((j) => (
              <li key={j._id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold tabular-nums">{j.code}</div>
                    <div className="mt-0.5 text-sm text-foreground-muted">{j.outlet}</div>
                  </div>
                  <ConfidenceBadge level={j.contactConfidence as "high" | "medium" | "low"} />
                </div>
                <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <div className="flex gap-1.5">
                    <dt className="text-muted">beat</dt>
                    <dd className="text-foreground-muted">{j.beatPrimary}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted">기사수</dt>
                    <dd className="tabular-nums text-foreground-muted">
                      {j.referenceArticleCount}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-lg border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <caption className="sr-only">
                기자 목록 — 익명 코드·매체·beat·연락처 신뢰도·기사수
              </caption>
              <thead className="bg-surface text-left text-xs font-semibold text-foreground-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    기자
                  </th>
                  <th scope="col" className="px-4 py-3">
                    매체
                  </th>
                  <th scope="col" className="px-4 py-3">
                    beat
                  </th>
                  <th scope="col" className="px-4 py-3">
                    신뢰도
                  </th>
                  <th scope="col" className="px-4 py-3">
                    기사수
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {journalists.map((j) => (
                  <tr key={j._id} className="hover:bg-surface">
                    <td className="px-4 py-3 font-semibold tabular-nums">{j.code}</td>
                    <td className="px-4 py-3">{j.outlet}</td>
                    <td className="px-4 py-3 text-xs text-foreground-muted">{j.beatPrimary}</td>
                    <td className="px-4 py-3">
                      <ConfidenceBadge level={j.contactConfidence as "high" | "medium" | "low"} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground-muted">
                      {j.referenceArticleCount}
                    </td>
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
