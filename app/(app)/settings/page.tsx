"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Mail, Trash2, Check, Plug, RefreshCw, Bot } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/app/bits";
import { ByoAiConnectPanel } from "@/components/app/ByoAiConnect";
import { SmtpConnectPanel } from "@/components/app/SmtpConnect";
import { McpDashboardCard } from "@/components/app/McpGuide";
import { PLANS } from "@/lib/brand";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-surface" />}>
      <SettingsInner />
    </Suspense>
  );
}

function SettingsInner() {
  const searchParams = useSearchParams();
  const data = useQuery(api.profiles.getMyProfile);
  const usage = useQuery(api.usage.getMyUsage);
  const suppression = useQuery(api.suppression.list);
  const gmail = useQuery(api.gmailAccounts.getConnection);
  const integrations = useQuery(api.integrations.getStatus);
  const update = useMutation(api.profiles.updateProfile);
  const removeSup = useMutation(api.suppression.remove);
  const disconnectGmail = useMutation(api.gmailAccounts.disconnect);
  const getGmailUrl = useAction(api.gmailActions.getConnectUrl);
  const syncOpenCrab = useAction(api.opencrabActions.syncJournalists);

  const [form, setForm] = useState({
    companyName: "",
    senderName: "",
    contactEmail: "",
    boilerplate: "",
  });
  const [saved, setSaved] = useState(false);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailMsg, setGmailMsg] = useState<string | null>(null);
  const [ocBusy, setOcBusy] = useState(false);
  const [ocMsg, setOcMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data?.profile) {
      setForm({
        companyName: data.profile.companyName ?? "",
        senderName: data.profile.senderName ?? "",
        contactEmail: data.profile.contactEmail ?? "",
        boilerplate: data.profile.boilerplate ?? "",
      });
    }
  }, [data?.profile?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const status = searchParams.get("gmail");
    if (status === "connected") setGmailMsg("Gmail 연결이 완료되었습니다.");
    if (status === "error") {
      const reason = searchParams.get("reason") ?? "unknown";
      setGmailMsg(`Gmail 연결 실패: ${reason}`);
    }
  }, [searchParams]);

  const currentPlan = usage?.plan ?? "free";

  async function saveProfile() {
    await update(form);
    setSaved(true);
  }

  async function connectGmail() {
    setGmailBusy(true);
    setGmailMsg(null);
    try {
      const { url } = await getGmailUrl({});
      window.location.href = url;
    } catch (e) {
      setGmailMsg(e instanceof Error ? e.message : "Gmail 연결을 시작할 수 없습니다.");
      setGmailBusy(false);
    }
  }

  async function testOpenCrab() {
    setOcBusy(true);
    setOcMsg(null);
    try {
      const r = await syncOpenCrab({ topicTags: ["IT·스타트업"], topK: 10 });
      setOcMsg(
        r.message ??
          `${r.mode}: synced=${r.synced} inserted=${r.inserted} updated=${r.updated}`,
      );
    } catch (e) {
      setOcMsg(e instanceof Error ? e.message : "OpenCrab 동기화 실패");
    } finally {
      setOcBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title="설정" description="발신 아이덴티티·요금제·내 AI·연동·억제 리스트를 관리합니다." />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Bot className="h-5 w-5" /> 내 AI (ChatGPT · Claude · Gemini)
          </h2>
          <Link href="/ai" className="text-xs font-semibold text-brand">
            전체 안내 →
          </Link>
        </div>
        <ByoAiConnectPanel skill="press-release-writer" compact />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">내 AI 연결</h2>
        <McpDashboardCard />
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Plug className="h-5 w-5" /> 서버 연동 상태
        </h2>
        <Card>
          <CardContent className="space-y-3 pt-6">
            {integrations === undefined ? (
              <div className="h-20 animate-pulse rounded-md bg-surface" />
            ) : (
              <ul className="space-y-2 text-sm">
                <li className="flex items-center justify-between gap-2">
                  <span>OpenCrab</span>
                  <span className="flex items-center gap-2">
                    {integrations.opencrabConfigured ? (
                      <Badge variant="success">
                        설정됨 · {integrations.opencrabTransport}
                      </Badge>
                    ) : (
                      <Badge variant="outline">미설정 (시드 폴백)</Badge>
                    )}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>Gmail OAuth</span>
                  {integrations.gmailOAuthConfigured ? (
                    <Badge variant="success">
                      설정됨 · {integrations.gmailOAuthSource}
                    </Badge>
                  ) : (
                    <Badge variant="danger">미설정</Badge>
                  )}
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>SMTP 암호화 키</span>
                  {integrations.smtpEncryptionKeySet ? (
                    <Badge variant="success">설정됨</Badge>
                  ) : (
                    // 없으면 메일 계정 저장 자체가 실패한다 — 저장을 눌러 보기 전에 알려 준다.
                    <Badge variant="warning">미설정 (SMTP 저장 불가)</Badge>
                  )}
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>Anthropic</span>
                  {integrations.anthropicConfigured ? (
                    <Badge variant="success">설정됨</Badge>
                  ) : (
                    <Badge variant="outline">미사용 (템플릿)</Badge>
                  )}
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>SITE_URL</span>
                  {integrations.siteUrlSet ? (
                    <Badge variant="success">설정됨</Badge>
                  ) : (
                    <Badge variant="warning">미설정</Badge>
                  )}
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>내 AI 연결</span>
                  <Badge variant="success">Solo 이상</Badge>
                </li>
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button size="sm" variant="subtle" disabled={ocBusy} onClick={testOpenCrab}>
                <RefreshCw className={`h-4 w-4 ${ocBusy ? "animate-spin" : ""}`} />
                OpenCrab 동기화 테스트
              </Button>
              {ocMsg && <p className="text-xs text-foreground-muted">{ocMsg}</p>}
            </div>
            <p className="text-xs text-muted">
              Convex 환경변수만 표시합니다. 키 값은 노출되지 않습니다. Google 콘솔에{" "}
              <code className="rounded bg-surface px-1">/gmail/callback</code> 리디렉션이
              등록돼 있어야 Gmail 연결이 됩니다.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">발신 아이덴티티</h2>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cn">회사/브랜드명</Label>
                <Input
                  id="cn"
                  value={form.companyName}
                  onChange={(e) => {
                    setForm({ ...form, companyName: e.target.value });
                    setSaved(false);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="sn">보내는 사람</Label>
                <Input
                  id="sn"
                  value={form.senderName}
                  onChange={(e) => {
                    setForm({ ...form, senderName: e.target.value });
                    setSaved(false);
                  }}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ce">회신용 이메일</Label>
              <Input
                id="ce"
                type="email"
                value={form.contactEmail}
                onChange={(e) => {
                  setForm({ ...form, contactEmail: e.target.value });
                  setSaved(false);
                }}
              />
            </div>
            <div>
              <Label htmlFor="bp">보일러플레이트 (보도자료 하단 공식 소개)</Label>
              <Textarea
                id="bp"
                rows={2}
                value={form.boilerplate}
                onChange={(e) => {
                  setForm({ ...form, boilerplate: e.target.value });
                  setSaved(false);
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveProfile}>저장</Button>
              {saved && <span className="text-sm text-success">✓ 저장됨</span>}
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">요금제</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => {
            const active = currentPlan === p.id;
            return (
              <div
                key={p.id}
                className={
                  "rounded-lg border p-4 " +
                  (active ? "border-2 border-brand bg-brand-soft/40" : "border-border bg-card")
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold">{p.name}</span>
                  {active && <Badge variant="brand">현재</Badge>}
                </div>
                <div className="mt-1 text-lg font-bold">
                  {p.price}
                  <span className="text-xs font-normal text-muted">{p.unit}</span>
                </div>
                <Button
                  size="sm"
                  variant={active ? "subtle" : "brand"}
                  className="mt-3 w-full"
                  disabled={active}
                  onClick={async () => {
                    await update({ plan: p.id });
                  }}
                >
                  {active ? "사용 중" : "이 플랜으로"}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          * 데모 환경에서는 결제 없이 플랜을 전환해 한도 동작을 확인할 수 있습니다.
          Solo·Growth·Agency는{" "}
          <Link href="/ai" className="underline underline-offset-2">
            내 AI
          </Link>
          에서 Claude·ChatGPT·Gemini·Cursor 연결 키를 만들 수 있습니다.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Gmail 연동 (BYO-Email)</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface">
                <Mail className="h-5 w-5 text-muted" />
              </div>
              <div>
                <div className="font-semibold">
                  {gmail?.connected ? `연결됨 · ${gmail.email}` : "Google 계정 연결"}
                </div>
                <div className="text-xs text-muted">
                  발송·초안은 사용자 본인 Gmail로 나가며, 모든 배포·회신은 Gmail{" "}
                  <b>&lsquo;언론홍보&rsquo;</b> 라벨 안에서 관리됩니다.
                </div>
                {gmailMsg && <p className="mt-1 text-xs text-foreground-muted">{gmailMsg}</p>}
              </div>
            </div>
            {gmail?.connected ? (
              <Button
                variant="subtle"
                disabled={gmailBusy}
                onClick={async () => {
                  setGmailBusy(true);
                  try {
                    await disconnectGmail({});
                    setGmailMsg("Gmail 연결을 해제했습니다.");
                  } finally {
                    setGmailBusy(false);
                  }
                }}
              >
                연결 해제
              </Button>
            ) : (
              <Button variant="brand" disabled={gmailBusy} onClick={connectGmail}>
                {gmailBusy ? "이동 중…" : "Gmail 연결"}
              </Button>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">발신 메일 (SMTP)</h2>
        <p className="mb-3 text-sm text-muted">
          Gmail 연결이 어렵거나 회사 메일로 보내야 한다면 이쪽을 씁니다. 두 방식 모두 파일럿
          승인·수신거부·쿨다운·표현 규정·발송 한도를 <b>똑같이</b> 통과합니다.
        </p>
        <SmtpConnectPanel />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">억제 리스트 (수신거부)</h2>
        <Card>
          <CardContent className="pt-6">
            {suppression === undefined ? (
              <div className="h-16 animate-pulse rounded-md bg-surface" />
            ) : suppression.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Check className="h-4 w-4 text-success" /> 억제된 기자가 없습니다. 수신거부 회신 시
                자동 등록됩니다.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {suppression.map((s) => (
                  <li key={s._id} className="flex items-center justify-between py-2.5">
                    <div>
                      <span className="text-sm font-semibold tabular-nums">{s.masked}</span>
                      <span className="ml-2 text-xs text-muted">{s.reason}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeSup({ id: s._id as Id<"suppressionList"> })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
