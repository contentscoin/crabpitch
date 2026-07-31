"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AlertTriangle,
  CalendarClock,
  Database,
  KeyRound,
  Plug,
  RefreshCw,
  Shield,
  Trash2,
  Users,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader, StatCard } from "@/components/app/bits";
import { PLANS } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";

type PlanId = "free" | "solo" | "growth" | "agency";

/* ── 오픈크랩 팩 동기화 (A-4) ────────────────────────────────
 * ⚠️ 이 섹션은 **집계·메타데이터 전용**이다. 기자 개인의 이름·이메일·연락처를
 *    노출하는 UI를 추가하지 않는다(백엔드도 PII를 반환하지 않는다).
 */

type PackStatus = "ok" | "partial" | "failed";

const PACK_STATUS: Record<
  PackStatus,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  ok: { label: "정상", variant: "success" },
  partial: { label: "결손", variant: "warning" },
  failed: { label: "실패", variant: "danger" },
};

const SERIES_LABEL: Record<string, string> = {
  "journalist-contacts": "기자단 배치",
  "journalist-reference": "기자 레퍼런스",
  "pr-presskit": "프레스킷",
  other: "기타",
};

/**
 * 재동기화로 복구되지 않는 **상류(인제스트) 결손**.
 * 근거: `convex/lib/packSync.ts` — batch-025는 원문 17,726자 중 약 41%만 저장됐다.
 * 운영자가 "재시도하면 채워진다"고 오해하지 않도록 별도로 표기한다.
 */
const UNRECOVERABLE_PACKS: Record<string, string> = {
  "batch-025":
    "상류 인제스트 단계에서 원문 17,726자 중 약 41%만 저장돼 원리적으로 복원 불가(선언 8건 중 완전 복원 2건). 재동기화로 채워지지 않습니다.",
};

function packLabel(p: {
  batch?: string;
  name?: string;
  packageId: string;
}): string {
  return p.batch ?? p.name ?? `${p.packageId.slice(0, 8)}…`;
}

function fmtDate(ts?: number): string {
  return ts ? new Date(ts).toLocaleDateString("ko-KR") : "—";
}

function fmtDateTime(ts?: number): string {
  return ts ? new Date(ts).toLocaleString("ko-KR") : "—";
}

function summarizeSync(res: {
  packsAttempted: number;
  ok: number;
  partial: number;
  failed: number;
  inserted: number;
  updated: number;
  message?: string;
}): string {
  return (
    res.message ??
    `팩 ${res.packsAttempted}개 · 정상 ${res.ok} · 결손 ${res.partial} · 실패 ${res.failed} (신규 ${res.inserted} · 갱신 ${res.updated})`
  );
}

/** 목록이 길어지면 화면이 세로로 끝없이 늘어난다 — 한 번에 이만큼만 보여준다. */
const PACK_PAGE_SIZE = 10;

function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-muted">
      <span className="tabular-nums">
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="subtle"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
        >
          이전
        </Button>
        <span className="tabular-nums">
          {page + 1} / {pages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="subtle"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
        >
          다음
        </Button>
      </div>
    </div>
  );
}

function PackStatusBadge({ status }: { status?: string }) {
  const s = status ? PACK_STATUS[status as PackStatus] : undefined;
  if (!s) return <Badge variant="outline">{status ?? "미실행"}</Badge>;
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export default function AdminPage() {
  const access = useQuery(api.admin.getAccess);
  const overview = useQuery(
    api.admin.getOverview,
    access?.allowed ? {} : "skip",
  );
  const users = useQuery(api.admin.listUsers, access?.allowed ? {} : "skip");
  const mcpKeys = useQuery(
    api.admin.listMcpKeys,
    access?.allowed ? {} : "skip",
  );
  const packSync = useQuery(
    api.admin.packSyncOverview,
    access?.allowed ? {} : "skip",
  );
  const journalists = useQuery(
    api.admin.listJournalists,
    access?.allowed ? {} : "skip",
  );
  const setPlan = useMutation(api.admin.setUserPlan);
  const setAdmin = useMutation(api.admin.setPlatformAdminFlag);
  const revokeKey = useMutation(api.admin.revokeMcpKey);
  const setPackEnabled = useMutation(api.admin.setPackSyncEnabled);
  const matchingPolicy = useQuery(api.admin.getMatchingPolicy);
  const setMatchingPolicy = useMutation(api.admin.setMatchingPolicy);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [brokenPage, setBrokenPage] = useState(0);
  const [packPage, setPackPage] = useState(0);
  const syncPacks = useAction(api.opencrabActions.syncPacksManual);
  const seedTestJournalist = useMutation(api.admin.seedTestJournalist);

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [packMsg, setPackMsg] = useState<string | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  const [packBusy, setPackBusy] = useState(false);

  const packs = useMemo(() => packSync?.packs ?? [], [packSync]);
  /** 재시도 대상 — 마지막 상태가 ok가 아닌 팩. 승인 꺼진 팩은 관리자 승인 게이트를 우회하지 않도록 제외. */
  const retryTargets = useMemo(
    () =>
      packs
        .filter((p) => p.syncEnabled && p.lastStatus !== "ok")
        .map((p) => p.packageId),
    [packs],
  );
  const brokenPacks = useMemo(
    () =>
      packs.filter(
        (p) => p.lastStatus === "partial" || p.lastStatus === "failed",
      ),
    [packs],
  );
  // 동기화로 목록이 줄면 보고 있던 페이지가 범위를 벗어나 빈 화면이 된다 — 마지막 페이지로 당긴다.
  const brokenPageSafe = Math.min(
    brokenPage,
    Math.max(0, Math.ceil(brokenPacks.length / PACK_PAGE_SIZE) - 1),
  );
  const packPageSafe = Math.min(
    packPage,
    Math.max(0, Math.ceil(packs.length / PACK_PAGE_SIZE) - 1),
  );

  const packNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of packs) m.set(p.packageId, packLabel(p));
    return m;
  }, [packs]);

  async function runPackJob(label: string, fn: () => Promise<string | void>) {
    setPackBusy(true);
    setPackMsg(null);
    setPackError(null);
    try {
      const detail = await fn();
      setPackMsg(detail ? detail : `${label} 완료`);
    } catch (e) {
      setPackError(e instanceof Error ? e.message : `${label}에 실패했습니다.`);
    } finally {
      setPackBusy(false);
    }
  }

  function runSync(label: string, packageIds?: string[]) {
    void runPackJob(label, async () => {
      const res = await syncPacks(packageIds ? { packageIds } : {});
      if (res.mode === "error") {
        throw new Error(res.message ?? "팩 동기화에 실패했습니다.");
      }
      return `${label} — ${summarizeSync(res)}`;
    });
  }

  function togglePack(packageId: string, label: string, enabled: boolean) {
    void runPackJob(enabled ? "동기화 켜기" : "동기화 끄기", async () => {
      await setPackEnabled({ packageId, enabled });
      return `${label} 자동 동기화를 ${enabled ? "켰습니다" : "껐습니다"}.`;
    });
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(label);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (access === undefined) {
    return <Skeleton className="h-64" />;
  }

  if (!access.allowed) {
    return (
      <div className="max-w-2xl space-y-4">
        <PageHeader
          title="관리자"
          description="플랫폼 운영 콘솔입니다. 권한이 있는 계정만 접근할 수 있습니다."
        />
        <Card>
          <CardContent className="space-y-3 pt-6 text-sm text-foreground-muted">
            <p>이 계정에는 플랫폼 관리자 권한이 없습니다.</p>
            <p className="text-xs text-muted">
              운영자 이메일: {access.email ?? "(없음)"} · Convex 환경변수{" "}
              <code className="rounded bg-surface px-1">ADMIN_EMAILS</code> 에
              이메일을 추가하거나, 기존 관리자가 권한을 부여해야 합니다.
            </p>
            <Link href="/dashboard" className={buttonClasses({ size: "sm", variant: "subtle" })}>
              대시보드로
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader
        title="관리자"
        description="사용자·요금제·MCP 키·연동 상태를 운영합니다. 에이전시 admin과 별개의 플랫폼 권한입니다."
        action={
          <Badge variant="brand">
            {access.via === "profile" ? "프로필 권한" : "이메일 허용목록"}
          </Badge>
        }
      />

      {msg && <p className="text-sm text-foreground-muted">{msg}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="사용자"
          value={overview ? `${overview.users}` : "…"}
          hint={overview ? `프로필 ${overview.profiles}` : undefined}
          icon={Users}
        />
        <StatCard
          label="활성 MCP 키"
          value={overview ? `${overview.activeMcpKeys}` : "…"}
          hint="폐기 제외"
          icon={KeyRound}
        />
        <StatCard
          label="기자 DB"
          value={overview ? `${overview.journalists}` : "…"}
          hint={
            overview
              ? `캠페인 ${overview.campaigns} · 보도자료 ${overview.pressReleases}`
              : undefined
          }
          icon={BarChart3}
        />
        <StatCard
          label="에이전시"
          value={overview ? `${overview.agencies}` : "…"}
          hint={overview ? `기준월 ${overview.month}` : undefined}
          icon={Shield}
        />
      </div>

      {overview && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">요금제 분포 · 연동</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-2 pt-5 text-sm">
                {(Object.keys(overview.plans) as PlanId[]).map((plan) => (
                  <div
                    key={plan}
                    className="flex items-center justify-between border-b border-border py-2 last:border-0"
                  >
                    <span className="font-semibold capitalize">{plan}</span>
                    <span className="text-foreground-muted">
                      {overview.plans[plan]}명
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 pt-5 text-sm">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <Plug className="h-4 w-4 text-brand" /> 서버 연동
                </div>
                {(
                  [
                    ["OpenCrab", overview.integrations.opencrab],
                    ["Gmail OAuth", overview.integrations.gmailOAuth],
                    ["Anthropic", overview.integrations.anthropic],
                    ["MCP HTTP", overview.integrations.mcpHttp],
                    [
                      "ADMIN_EMAILS",
                      overview.integrations.adminEmailsConfigured,
                    ],
                  ] as const
                ).map(([label, ok]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-b border-border py-2 last:border-0"
                  >
                    <span>{label}</span>
                    <Badge variant={ok ? "success" : "outline"}>
                      {ok ? "설정됨" : "미설정"}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Database className="h-5 w-5" /> 오픈크랩 팩 동기화
            </h2>
            <p className="mt-1 text-xs text-muted">
              집계·메타데이터만 표시합니다. 기자 개인 정보는 이 화면에서 열람할
              수 없습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="brand"
              disabled={packBusy}
              onClick={() => runSync("전체 동기화")}
            >
              <RefreshCw className={cn("h-4 w-4", packBusy && "animate-spin")} />
              전체 동기화
            </Button>
            <Button
              type="button"
              size="sm"
              variant="subtle"
              disabled={packBusy || retryTargets.length === 0}
              onClick={() => runSync("실패·결손 재시도", retryTargets)}
            >
              실패·결손만 재시도
              {retryTargets.length > 0 ? ` (${retryTargets.length})` : ""}
            </Button>
          </div>
        </div>

        {packBusy && (
          <p className="text-sm text-foreground-muted">동기화 실행 중…</p>
        )}
        {packMsg && <p className="text-sm text-foreground-muted">{packMsg}</p>}
        {packError && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
            {packError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="기자 총원"
            value={packSync ? `${packSync.journalistTotal}` : "…"}
            hint={
              packSync
                ? `소스 ${Object.keys(packSync.bySource).length}종`
                : undefined
            }
            icon={Users}
          />
          <StatCard
            label="데이터 기준일"
            value={packSync ? fmtDate(packSync.latestArticleAt) : "…"}
            hint="근거 기사 최신일"
            icon={CalendarClock}
          />
          <StatCard
            label="팩 미확인 레코드"
            value={packSync ? `${packSync.staleCount}` : "…"}
            hint="30일 이상 팩에서 미확인 · 이직·퇴사 추정"
            icon={AlertTriangle}
          />
          <StatCard
            label="결손·실패 팩"
            value={packSync ? `${brokenPacks.length}` : "…"}
            hint={
              packSync
                ? `전체 ${packs.length}개 · 매체 분류 미상 ${packSync.missingCategory}건`
                : undefined
            }
            icon={Database}
          />
        </div>

        {packSync && Object.keys(packSync.bySource).length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">소스별</span>
            {Object.entries(packSync.bySource)
              .sort((a, b) => b[1] - a[1])
              .map(([src, n]) => (
                <Badge key={src} variant="outline">
                  {src} {n}
                </Badge>
              ))}
          </div>
        )}

        {brokenPacks.length > 0 && (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-center gap-2 text-sm font-bold text-warning">
                <AlertTriangle className="h-4 w-4" /> 결손·실패 팩{" "}
                {brokenPacks.length}개 — 확인이 필요합니다
              </div>
              <ul className="space-y-2 text-sm">
                {brokenPacks
                  .slice(brokenPageSafe * PACK_PAGE_SIZE, (brokenPageSafe + 1) * PACK_PAGE_SIZE)
                  .map((p) => {
                  const known = p.batch
                    ? UNRECOVERABLE_PACKS[p.batch]
                    : undefined;
                  return (
                    <li
                      key={p.packageId}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <PackStatusBadge status={p.lastStatus} />
                      <span className="font-semibold">{packLabel(p)}</span>
                      <span className="text-foreground-muted tabular-nums">
                        취득 {p.lastFetched ?? 0} / 선언 {p.recordCount ?? "?"}
                      </span>
                      {p.lastError && (
                        <span className="text-xs text-foreground-muted">
                          {p.lastError}
                        </span>
                      )}
                      {known && (
                        <span className="w-full text-xs font-semibold text-warning">
                          복구 불가 — {known}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Pager
                page={brokenPageSafe}
                total={brokenPacks.length}
                pageSize={PACK_PAGE_SIZE}
                onPage={setBrokenPage}
              />
              <p className="text-xs text-muted">
                다시 동기화해 성공하면 이 목록에서 자동으로 빠집니다 — 마지막 실행 상태만 봅니다.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-3 pt-5">
            {packSync === undefined ? (
              <Skeleton className="h-32" />
            ) : packs.length === 0 ? (
              <p className="text-sm text-muted">
                등록된 팩이 없습니다. 「전체 동기화」로 팩 목록을 먼저 가져오세요.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="py-2 pr-3 font-semibold">배치 · 시리즈</th>
                      <th className="py-2 pr-3 font-semibold">마지막 동기화</th>
                      <th className="py-2 pr-3 font-semibold">상태</th>
                      <th className="py-2 pr-3 font-semibold">취득 / 선언</th>
                      <th className="py-2 pr-3 font-semibold">자동 동기화</th>
                      <th className="py-2 font-semibold">오류 요약</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packs
                      .slice(packPageSafe * PACK_PAGE_SIZE, (packPageSafe + 1) * PACK_PAGE_SIZE)
                      .map((p) => {
                      const known = p.batch
                        ? UNRECOVERABLE_PACKS[p.batch]
                        : undefined;
                      return (
                        <tr
                          key={p.packageId}
                          className={cn(
                            "border-b border-border align-top",
                            p.lastStatus === "partial" &&
                              "bg-warning/10 border-l-2 border-l-warning",
                            p.lastStatus === "failed" &&
                              "bg-danger/10 border-l-2 border-l-danger",
                          )}
                        >
                          <td className="py-3 pr-3 pl-2">
                            <div className="font-medium">{packLabel(p)}</div>
                            <div className="text-xs text-muted">
                              {SERIES_LABEL[p.series] ?? p.series}
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-xs text-foreground-muted">
                            {fmtDateTime(p.lastSyncedAt)}
                            {p.capturedAt && (
                              <div className="text-muted">
                                스냅샷 {p.capturedAt.slice(0, 10)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-3">
                            <PackStatusBadge status={p.lastStatus} />
                          </td>
                          <td className="py-3 pr-3 tabular-nums">
                            {p.lastFetched ?? "—"} / {p.recordCount ?? "—"}
                          </td>
                          <td className="py-3 pr-3">
                            <Button
                              type="button"
                              size="sm"
                              variant={p.syncEnabled ? "brand" : "subtle"}
                              disabled={packBusy}
                              onClick={() =>
                                togglePack(
                                  p.packageId,
                                  packLabel(p),
                                  !p.syncEnabled,
                                )
                              }
                            >
                              {p.syncEnabled ? "켬" : "꺼짐"}
                            </Button>
                          </td>
                          <td className="py-3 text-xs text-foreground-muted">
                            {p.lastError ?? "—"}
                            {known && (
                              <div className="mt-1 font-semibold text-warning">
                                복구 불가 — {known}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pager
                  page={packPageSafe}
                  total={packs.length}
                  pageSize={PACK_PAGE_SIZE}
                  onPage={setPackPage}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {packSync && packSync.pressGuideRecheck.length > 0 && (
          <Card>
            <CardContent className="space-y-2 pt-5">
              <div className="text-sm font-bold text-warning">
                PR 지식 팩 새 시리즈 {packSync.pressGuideRecheck.length}건 — 규범 재대조 필요
              </div>
              <p className="text-xs text-muted">
                보도자료·표시광고법 규범의 정본은 <code>convex/lib/pressGuide.ts</code>이고, 각 상수
                블록에 추출 근거 문서 ID가 주석으로 적혀 있습니다. 새 시리즈가 나오면 그 주석을
                기준으로 값이 바뀌었는지 확인한 뒤 반영하세요. 자동 전환은 하지 않습니다.
              </p>
              <ul className="space-y-1 text-xs text-foreground-muted">
                {packSync.pressGuideRecheck.map((p) => (
                  <li key={p.packageId}>
                    · {p.name ?? p.packageId}
                    {p.capturedAt ? ` (${p.capturedAt.slice(0, 10)})` : ""}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {packSync?.integrity.expected !== undefined &&
          packSync.integrity.actual < packSync.integrity.expected && (
            <Card>
              <CardContent className="space-y-1 pt-5">
                <div className="text-sm font-bold text-warning">
                  정합성 — 반입 {packSync.integrity.actual}명 / 기준 {packSync.integrity.expected}명
                </div>
                <p className="text-xs text-muted">
                  기자단 reference 팩이 선언한 인원보다 적게 반입됐습니다. 위 팩 표에서 결손(partial)
                  팩을 확인하세요. 상류 인제스트 단계에서 청크가 유실된 팩은 재동기화로 채워지지
                  않습니다.
                </p>
              </CardContent>
            </Card>
          )}

        <Card>
          <CardContent className="space-y-3 pt-5">
            <div>
              <div className="text-sm font-bold">매칭 정책</div>
              <p className="mt-1 text-xs text-muted">
                기자단 자료에서 오래 확인되지 않은 레코드는 이직·부서 이동으로 이메일이
                유효하지 않을 수 있습니다. 켜 두면 매칭 후보에서 아예 빠집니다.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={matchingPolicy?.excludeStaleMatches ?? false}
                disabled={matchingPolicy === undefined || policyBusy}
                onChange={async (e) => {
                  setPolicyBusy(true);
                  setPackError(null);
                  try {
                    await setMatchingPolicy({ excludeStaleMatches: e.target.checked });
                  } catch (err) {
                    setPackError(err instanceof Error ? err.message : "설정 변경 실패");
                  } finally {
                    setPolicyBusy(false);
                  }
                }}
              />
              <span>
                팩에서 {matchingPolicy?.staleDays ?? 30}일 이상 확인되지 않은 기자를 매칭에서 제외
              </span>
            </label>
          </CardContent>
        </Card>

        {packSync && packSync.pendingApproval.length > 0 && (
          <Card>
            <CardContent className="space-y-3 pt-5">
              <div>
                <div className="text-sm font-bold">
                  승인 대기 팩 {packSync.pendingApproval.length}개
                </div>
                <p className="mt-1 text-xs text-muted">
                  신규·파생 시리즈는 관리자가 켜기 전까지 자동 동기화되지
                  않습니다.
                </p>
              </div>
              <ul className="space-y-2">
                {packSync.pendingApproval.map((p) => (
                  <li
                    key={p.packageId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {p.name ?? `${p.packageId.slice(0, 8)}…`}
                      </div>
                      <div className="text-xs text-muted">
                        {SERIES_LABEL[p.series] ?? p.series} ·{" "}
                        {p.packageId.slice(0, 8)}…
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="subtle"
                      disabled={packBusy}
                      onClick={() =>
                        togglePack(
                          p.packageId,
                          p.name ?? p.packageId.slice(0, 8),
                          true,
                        )
                      }
                    >
                      동기화 켜기
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-2 pt-5">
            <div className="text-sm font-bold">최근 실행 기록</div>
            {packSync === undefined ? (
              <Skeleton className="h-24" />
            ) : packSync.recentRuns.length === 0 ? (
              <p className="text-sm text-muted">실행 기록이 없습니다.</p>
            ) : (
              <ul>
                {packSync.recentRuns.map((r, i) => (
                  <li
                    key={`${r.packageId}-${r.startedAt}-${i}`}
                    className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm last:border-0"
                  >
                    <PackStatusBadge status={r.status} />
                    <span className="font-medium">
                      {packNames.get(r.packageId) ??
                        `${r.packageId.slice(0, 8)}…`}
                    </span>
                    <span className="text-xs text-muted">
                      {fmtDateTime(r.startedAt)} ·{" "}
                      {r.trigger === "cron" ? "크론" : "수동"}
                    </span>
                    <span className="text-xs text-foreground-muted tabular-nums">
                      취득 {r.fetched}
                      {r.recordCount != null ? `/${r.recordCount}` : ""} · 신규{" "}
                      {r.inserted} · 갱신 {r.updated}
                    </span>
                    {r.error && (
                      <span className="w-full text-xs text-warning">
                        {r.error}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Users className="h-5 w-5" /> 사용자 · 플랜
        </h2>
        <Card>
          <CardContent className="space-y-3 pt-5">
            {users === undefined ? (
              <Skeleton className="h-32" />
            ) : users.length === 0 ? (
              <p className="text-sm text-muted">사용자가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="py-2 pr-3 font-semibold">이메일</th>
                      <th className="py-2 pr-3 font-semibold">회사</th>
                      <th className="py-2 pr-3 font-semibold">플랜</th>
                      <th className="py-2 pr-3 font-semibold">사용량</th>
                      <th className="py-2 pr-3 font-semibold">MCP</th>
                      <th className="py-2 font-semibold">관리자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.userId}
                        className="border-b border-border align-top"
                      >
                        <td className="py-3 pr-3">
                          <div className="font-medium">
                            {u.email ?? "(이메일 없음)"}
                          </div>
                          <div className="text-xs text-muted">
                            {u.name ?? "—"}
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-foreground-muted">
                          {u.companyName ?? "—"}
                          {u.gmailConnected && (
                            <div className="text-xs text-success">Gmail</div>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <select
                            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-semibold"
                            value={u.plan}
                            disabled={busy || !u.profileId}
                            onChange={(e) => {
                              const plan = e.target.value as PlanId;
                              void run(`${u.email ?? u.userId} → ${plan}`, () =>
                                setPlan({ userId: u.userId, plan }),
                              );
                            }}
                          >
                            {PLANS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted">
                          발송 {u.sendsUsed} · 보도자료 {u.pressReleasesUsed}
                        </td>
                        <td className="py-3 pr-3 text-xs">{u.mcpKeyCount}개</td>
                        <td className="py-3">
                          <Button
                            type="button"
                            size="sm"
                            variant={u.isPlatformAdmin ? "brand" : "subtle"}
                            disabled={busy}
                            onClick={() =>
                              void run(
                                u.isPlatformAdmin
                                  ? "관리자 해제"
                                  : "관리자 부여",
                                () =>
                                  setAdmin({
                                    userId: u.userId,
                                    isPlatformAdmin: !u.isPlatformAdmin,
                                  }),
                              )
                            }
                          >
                            {u.isPlatformAdmin ? "관리자" : "일반"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <KeyRound className="h-5 w-5" /> MCP 키
        </h2>
        <Card>
          <CardContent className="space-y-3 pt-5">
            {mcpKeys === undefined ? (
              <Skeleton className="h-24" />
            ) : mcpKeys.length === 0 ? (
              <p className="text-sm text-muted">발급된 MCP 키가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {mcpKeys.map((k) => (
                  <li
                    key={k._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {k.email ?? k.userId}
                        </span>
                        <Badge variant={k.revoked ? "outline" : "brand"}>
                          {k.revoked ? "폐기됨" : k.plan}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted">
                        {k.name} · {k.keyPrefix}… ·{" "}
                        {new Date(k.createdAt).toLocaleString("ko-KR")}
                        {k.lastUsedAt
                          ? ` · 사용 ${new Date(k.lastUsedAt).toLocaleString("ko-KR")}`
                          : ""}
                      </div>
                    </div>
                    {!k.revoked && (
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() =>
                          void run("키 폐기", () =>
                            revokeKey({
                              keyId: k._id as Id<"userMcpKeys">,
                            }),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                        폐기
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">기자 디렉터리</h2>
          <div className="flex flex-wrap items-center gap-2">
            {journalists && (
              <span className="text-xs text-foreground-muted">
                전체 {journalists.total}명 · 표시 {journalists.shown}명
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="subtle"
              disabled={packBusy}
              onClick={() =>
                // run()은 콜백 뒤에 label로 메시지를 덮어써 결과별 안내가 사라진다.
                // runPackJob은 반환 문자열을 그대로 쓴다.
                void runPackJob("테스트 기자 시드", async () => {
                  const r = await seedTestJournalist({});
                  return r.created
                    ? "테스트 기자(김테스트 · hiway@kakao.com)를 추가했습니다."
                    : "이미 있습니다 — 중복 생성하지 않았습니다.";
                })
              }
            >
              테스트 기자 시드
            </Button>
          </div>
        </div>

        {journalists === undefined ? (
          <Skeleton className="h-40" />
        ) : journalists.total === 0 ? (
          <Card>
            <CardContent className="space-y-2 pt-5 text-sm">
              <p className="font-semibold">기자 데이터가 없습니다.</p>
              <p className="text-foreground-muted">
                오픈크랩 연동이 꺼져 있거나 팩 동기화가 한 번도 돌지 않은 상태입니다. 위
                「오픈크랩 팩 동기화」에서 수동 동기화를 실행해 보세요.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="전체" value={String(journalists.total)} />
              <StatCard
                label="팩(오픈크랩)"
                value={String(journalists.bySource.opencrab ?? 0)}
              />
              <StatCard
                label="시드·수동"
                value={String(
                  (journalists.bySource.seed ?? 0) +
                    (journalists.bySource.manual ?? 0) +
                    (journalists.bySource.unknown ?? 0),
                )}
              />
              <StatCard
                label="stale (30일+)"
                value={String(journalists.staleCount)}
              />
            </div>

            {/* "왜 N명만 뜨지"의 실제 원인을 숫자로 보여준다. 총계만으로는 못 가린다. */}
            <Card>
              <CardContent className="space-y-2 pt-5 text-sm">
                <p className="font-semibold">매칭에 몇 명이 뜨는지</p>
                <p className="text-foreground-muted">
                  매칭 1회는{" "}
                  <b className="text-foreground">
                    최대 {journalists.matchTopKDefault}명
                  </b>
                  을 만듭니다. 디렉터리에 {journalists.total}명이 있어도 그 이상은 나오지
                  않습니다. 여기에{" "}
                  <b className="text-foreground">주제 태그가 하나도 겹치지 않는 기자</b>는
                  점수 0으로 아예 빠지고, 수신거부·재접근 제외도 추가로 걸립니다.
                  {journalists.excludeStale && journalists.staleCount > 0 ? (
                    <>
                      {" "}
                      지금은 stale 제외가 켜져 있어{" "}
                      <b className="text-foreground">{journalists.staleCount}명</b>이 더
                      빠집니다.
                    </>
                  ) : null}
                </p>
                <p className="text-xs text-muted">
                  신뢰도 low인 기자는 목록에는 나오지만 승인 화면에서 기본 해제됩니다 —{" "}
                  {journalists.byConfidence.low ?? 0}명.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
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
                      {journalists.journalists.map((j) => (
                        <tr key={j._id} className="border-b border-border/50">
                          <td className="py-2 pr-3 font-mono text-xs">{j.code}</td>
                          <td className="py-2 pr-3">{j.outlet}</td>
                          <td className="py-2 pr-3 text-foreground-muted">
                            {j.beatPrimary}
                          </td>
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
                          <td className="py-2 pr-3 text-xs text-foreground-muted">
                            {j.source}
                          </td>
                          <td className="py-2 text-xs text-foreground-muted">
                            {j.stale ? (
                              <span className="text-warning">
                                {fmtDate(j.lastSeenInPackAt ?? undefined)} (stale)
                              </span>
                            ) : (
                              fmtDate(j.lastSeenInPackAt ?? undefined)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted">
                  기자 실명·이메일·연락처는 관리자 화면에도 표시하지 않습니다. 발송 시점의
                  Gmail 수신자로만 사용됩니다.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </section>
    </div>
  );
}
