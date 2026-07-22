"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Users, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfidenceBadge } from "@/components/ui/Badge";
import { PageHeader, EmptyState } from "@/components/app/bits";

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
        <div className="h-40 animate-pulse rounded-lg border border-border bg-card" />
      ) : journalists.length === 0 ? (
        <EmptyState
          icon={Users}
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
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs font-semibold text-foreground-muted">
              <tr>
                <th className="px-4 py-3">기자</th>
                <th className="px-4 py-3">매체</th>
                <th className="hidden px-4 py-3 md:table-cell">beat</th>
                <th className="px-4 py-3">신뢰도</th>
                <th className="hidden px-4 py-3 lg:table-cell">기사수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {journalists.map((j) => (
                <tr key={j._id} className="hover:bg-surface">
                  <td className="px-4 py-3 font-semibold tabular-nums">{j.code}</td>
                  <td className="px-4 py-3">{j.outlet}</td>
                  <td className="hidden px-4 py-3 text-xs text-foreground-muted md:table-cell">{j.beatPrimary}</td>
                  <td className="px-4 py-3">
                    <ConfidenceBadge level={j.contactConfidence as "high" | "medium" | "low"} />
                  </td>
                  <td className="hidden px-4 py-3 tabular-nums text-foreground-muted lg:table-cell">{j.referenceArticleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
