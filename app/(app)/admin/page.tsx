"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  KeyRound,
  Plug,
  Shield,
  Trash2,
  Users,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader, StatCard } from "@/components/app/bits";
import { PLANS } from "@/lib/brand";

type PlanId = "free" | "solo" | "growth" | "agency";

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
  const setPlan = useMutation(api.admin.setUserPlan);
  const setAdmin = useMutation(api.admin.setPlatformAdminFlag);
  const revokeKey = useMutation(api.admin.revokeMcpKey);

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    return <div className="h-64 animate-pulse rounded-lg bg-surface" />;
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
            <Link href="/dashboard">
              <Button type="button" size="sm" variant="subtle">
                대시보드로
              </Button>
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

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Users className="h-5 w-5" /> 사용자 · 플랜
        </h2>
        <Card>
          <CardContent className="space-y-3 pt-5">
            {users === undefined ? (
              <div className="h-32 animate-pulse rounded-md bg-surface" />
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
              <div className="h-24 animate-pulse rounded-md bg-surface" />
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
    </div>
  );
}
