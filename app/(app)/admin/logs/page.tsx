"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/app/bits";
import {
  AdminNav,
  ListToolbar,
  PackStatusBadge,
  Pager,
  fmtDateTime,
} from "@/components/app/adminBits";

/**
 * 팩 동기화 실행 이력.
 *
 * 요약 화면에서 떼어 낸 이유: 목적이 다르다. 요약에서는 "지금 정상인가"만 알면 되고,
 * 여기서는 "언제 무엇이 왜 실패했나"를 파고든다. 한 화면에 두면 요약은 스크롤이 길어지고
 * 추적은 30건에서 끊긴다.
 */
export default function AdminLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);

  const access = useQuery(api.admin.getAccess);
  const data = useQuery(
    api.admin.listPackSyncRuns,
    access?.allowed
      ? {
          page,
          pageSize: 30,
          status: status || undefined,
          problemsOnly: problemsOnly || undefined,
        }
      : "skip",
  );

  if (access && !access.allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="동기화 로그" />
        <p className="text-sm text-muted">플랫폼 관리자만 볼 수 있습니다.</p>
      </div>
    );
  }

  // 팩 이름 검색은 서버가 받지 않는다(이력에는 이름이 없다). 받아 온 페이지 안에서 거른다 —
  // 전체 검색이 필요하면 서버에 붙여야 하고, 그때는 이 필터를 지운다.
  const rows = (data?.runs ?? []).filter((r) =>
    search.trim() ? r.packName.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="동기화 로그"
        description="오픈크랩 팩 동기화 실행 이력. 최근 1,000건까지 봅니다."
      />
      <AdminNav current="logs" />

      <Card>
        <CardContent className="space-y-3 pt-5">
          <ListToolbar
            placeholder="팩 이름으로 찾기 (현재 쪽 안에서)"
            value={search}
            onChange={setSearch}
            total={data?.total ?? 0}
            matched={data?.matched ?? 0}
            note={
              data
                ? `정상 ${data.byStatus.ok ?? 0} · 결손 ${data.byStatus.partial ?? 0} · 실패 ${
                    data.byStatus.failed ?? 0
                  }`
                : undefined
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {/* 상태별 필터는 서버가 처리한다 — 전체 이력에서 걸러야 의미가 있다. */}
              {([
                ["", "전체"],
                ["ok", "정상"],
                ["partial", "결손"],
                ["failed", "실패"],
              ] as const).map(([id, label]) => (
                <Button
                  key={id || "all"}
                  type="button"
                  size="sm"
                  variant={status === id && !problemsOnly ? "brand" : "subtle"}
                  onClick={() => {
                    setStatus(id);
                    setProblemsOnly(false);
                    setPage(1);
                  }}
                >
                  {label}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={problemsOnly ? "brand" : "subtle"}
                onClick={() => {
                  setProblemsOnly((v) => !v);
                  setStatus("");
                  setPage(1);
                }}
              >
                문제만
              </Button>
            </div>
          </ListToolbar>

          {data === undefined ? (
            <p className="text-sm text-muted">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted">
              {search || status || problemsOnly
                ? "조건에 맞는 실행 기록이 없습니다."
                : "실행 기록이 없습니다."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-foreground-muted">
                    <th className="pb-2 pr-3 font-medium">상태</th>
                    <th className="pb-2 pr-3 font-medium">팩</th>
                    <th className="pb-2 pr-3 font-medium">시작</th>
                    <th className="pb-2 pr-3 font-medium">경로</th>
                    <th className="pb-2 pr-3 font-medium">취득</th>
                    <th className="pb-2 font-medium">신규 / 갱신</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._id} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-3">
                        <PackStatusBadge status={r.status} />
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.packName}</div>
                        {r.error && (
                          // 실패 사유는 접거나 말줄임하지 않는다 — 이 화면에 온 이유가 그것이다.
                          <div className="mt-1 text-xs text-warning">{r.error}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs tabular-nums text-foreground-muted">
                        {fmtDateTime(r.startedAt)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-foreground-muted">
                        {r.trigger === "cron" ? "크론" : "수동"}
                      </td>
                      <td className="py-2 pr-3 text-xs tabular-nums">
                        {r.fetched}
                        {r.recordCount != null ? ` / ${r.recordCount}` : ""}
                      </td>
                      <td className="py-2 text-xs tabular-nums text-foreground-muted">
                        +{r.inserted} / ~{r.updated}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && (
            <Pager
              page={data.page - 1}
              total={data.matched}
              pageSize={data.pageSize}
              onPage={(p) => setPage(p + 1)}
            />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted">
        저장 전에 이메일은 마스킹됩니다 — 실패 사유에 기자 주소가 그대로 남지 않습니다.
      </p>
    </div>
  );
}
