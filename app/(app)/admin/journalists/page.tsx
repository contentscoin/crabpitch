"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/app/bits";
import { toUserMessage } from "@/lib/errorMessage";
import { AdminNav, fmtDate } from "@/components/app/adminBits";
import { ListToolbar, Pager, PageSizeSelect } from "@/components/app/listBits";

/**
 * 기자 디렉터리.
 *
 * 요약 화면에서 떼어 낸 이유는 로그와 같다 — 목적이 다르다. 요약에서는 "몇 명 있나"만
 * 알면 되고, 여기서는 "이 매체 기자가 왜 매칭에 안 뜨나"를 파고든다.
 *
 * ⚠️ 실명·이메일·연락처는 **관리자 화면에도** 내려오지 않는다. 서버 쿼리가 익명 코드만
 *    돌려준다(`admin.listJournalists`). 여기서 마스킹하는 게 아니라 애초에 오지 않는다.
 */
export default function AdminJournalistsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [staleOnly, setStaleOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [seedEmail, setSeedEmail] = useState("");
  const [seedName, setSeedName] = useState("");

  const access = useQuery(api.admin.getAccess);
  const data = useQuery(
    api.admin.listJournalists,
    access?.allowed
      ? {
          page,
          pageSize,
          search,
          source: source || undefined,
          staleOnly: staleOnly || undefined,
        }
      : "skip",
  );
  const seedTestJournalist = useMutation(api.admin.seedTestJournalist);

  if (access && !access.allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="기자 디렉터리" />
        <p className="text-sm text-muted">플랫폼 관리자만 볼 수 있습니다.</p>
      </div>
    );
  }

  /** 필터를 바꾸면 결과가 달라진다 — 3쪽에 머물러 있으면 빈 화면을 본다. */
  function applyFilter(fn: () => void) {
    fn();
    setPage(1);
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="기자 디렉터리"
        description="반입된 기자 레코드 전체. 실명·이메일은 표시하지 않습니다."
      />
      <AdminNav current="journalists" />

      {data === undefined ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : data.total === 0 ? (
        <Card>
          <CardContent className="space-y-2 pt-5 text-sm">
            <p className="font-semibold">기자 데이터가 없습니다.</p>
            <p className="text-foreground-muted">
              오픈크랩 연동이 꺼져 있거나 팩 동기화가 한 번도 돌지 않은 상태입니다. 요약
              화면의 「오픈크랩 팩 동기화」에서 수동 동기화를 실행해 보세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-3 pt-5">
              <ListToolbar
                placeholder="매체명으로 찾기"
                value={search}
                onChange={(v) => applyFilter(() => setSearch(v))}
                total={data.total}
                matched={data.matched}
                note={`stale ${data.staleCount}`}
              >
                <PageSizeSelect
                  value={pageSize}
                  onChange={(n) => applyFilter(() => setPageSize(n))}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ["", "전체"],
                      ["opencrab", "팩"],
                      ["manual", "수동"],
                      ["seed", "시드"],
                    ] as const
                  ).map(([id, label]) => (
                    <Button
                      key={id || "all"}
                      type="button"
                      size="sm"
                      variant={source === id && !staleOnly ? "brand" : "subtle"}
                      onClick={() =>
                        applyFilter(() => {
                          setSource(id);
                          setStaleOnly(false);
                        })
                      }
                    >
                      {label}
                      {id ? ` ${data.bySource[id] ?? 0}` : ""}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant={staleOnly ? "brand" : "subtle"}
                    onClick={() =>
                      applyFilter(() => {
                        setStaleOnly((v) => !v);
                        setSource("");
                      })
                    }
                  >
                    stale만
                  </Button>
                </div>
              </ListToolbar>

              {data.journalists.length === 0 ? (
                <p className="text-sm text-muted">
                  {search || source || staleOnly
                    ? "조건에 맞는 기자가 없습니다."
                    : "표시할 기자가 없습니다."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[42rem] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-foreground-muted">
                        <th className="pb-2 pr-3 font-medium">코드</th>
                        <th className="pb-2 pr-3 font-medium">매체</th>
                        <th className="pb-2 pr-3 font-medium">beat</th>
                        <th className="pb-2 pr-3 font-medium">신뢰도</th>
                        <th className="pb-2 pr-3 font-medium">근거</th>
                        <th className="pb-2 pr-3 font-medium">출처</th>
                        <th className="pb-2 font-medium">팩 확인</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.journalists.map((j) => (
                        <tr key={j._id} className="border-b border-border/50">
                          <td className="py-2 pr-3 font-mono text-xs">{j.code}</td>
                          <td className="py-2 pr-3">{j.outlet}</td>
                          <td className="py-2 pr-3 text-foreground-muted">{j.beatPrimary}</td>
                          <td className="py-2 pr-3">
                            <Badge
                              variant={
                                j.contactConfidence === "high"
                                  ? "brand"
                                  : j.contactConfidence === "low"
                                    ? "warning"
                                    : "outline"
                              }
                            >
                              {j.contactConfidence}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-foreground-muted">
                            {j.referenceArticleCount}
                          </td>
                          <td className="py-2 pr-3 text-xs text-foreground-muted">{j.source}</td>
                          <td className="py-2 text-xs text-foreground-muted">
                            {j.stale ? (
                              <span className="text-warning">
                                {fmtDate(j.lastSeenInPackAt)} (stale)
                              </span>
                            ) : (
                              fmtDate(j.lastSeenInPackAt)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Pager
                page={data.page - 1}
                total={data.matched}
                pageSize={data.pageSize}
                onPage={(p) => setPage(p + 1)}
              />
            </CardContent>
          </Card>

          {/* "왜 N명만 뜨지"의 실제 원인을 숫자로 보여준다. 총계만으로는 못 가린다. */}
          <Card>
            <CardContent className="space-y-2 pt-5 text-sm">
              <p className="font-semibold">매칭에 몇 명이 뜨는지</p>
              <p className="text-foreground-muted">
                매칭 1회는{" "}
                <b className="text-foreground">최대 {data.matchTopKDefault}명</b>을 만듭니다.
                디렉터리에 {data.total}명이 있어도 그 이상은 나오지 않습니다. 여기에{" "}
                <b className="text-foreground">주제 태그가 하나도 겹치지 않는 기자</b>는 점수
                0으로 아예 빠지고, 수신거부·재접근 제외도 추가로 걸립니다.
                {data.excludeStale && data.staleCount > 0 ? (
                  <>
                    {" "}
                    지금은 stale 제외가 켜져 있어{" "}
                    <b className="text-foreground">{data.staleCount}명</b>이 더 빠집니다.
                  </>
                ) : null}
              </p>
              <p className="text-xs text-muted">
                신뢰도 low인 기자는 목록에는 나오지만 승인 화면에서 기본 해제됩니다 —{" "}
                {data.byConfidence.low ?? 0}명.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs text-muted">수신 주소 (비우면 기본 테스트 주소)</span>
            <Input
              value={seedEmail}
              onChange={(e) => setSeedEmail(e.target.value)}
              placeholder="hiway@kakao.com"
              className="w-64"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted">이름</span>
            <Input
              value={seedName}
              onChange={(e) => setSeedName(e.target.value)}
              placeholder="김테스트"
              className="w-40"
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="subtle"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              try {
                const r = await seedTestJournalist({
                  email: seedEmail.trim() || undefined,
                  name: seedName.trim() || undefined,
                });
                setMsg(
                  r.created
                    ? `테스트 기자 ${r.code} 를 추가했습니다. 캠페인 매칭에서 이 코드로 대상을 좁히세요.`
                    : `이미 있습니다 — ${r.code} 로 등록돼 있어 중복 생성하지 않았습니다.`,
                );
              } catch (e) {
                setMsg(toUserMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            테스트 기자 시드
          </Button>
        </div>
        {msg && <p className="text-xs text-foreground-muted">{msg}</p>}
        <p className="text-xs text-muted">
          발송 쿨다운은 기자별 7일입니다. 같은 주소로 연달아 시험 발송할 수 없으므로, 문안을
          고친 뒤 바로 확인하려면 수신 주소를 다르게 준 테스트 기자를 하나 더 만드세요.
        </p>
      </div>

      <p className="text-xs text-muted">
        기자 실명·이메일·연락처는 관리자 화면에도 표시하지 않습니다. 발송 시점의 수신자로만
        사용됩니다.
      </p>
    </div>
  );
}
