"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Target,
  PenLine,
  ShieldCheck,
  Send,
  Inbox,
  ChevronDown,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, ConfidenceBadge } from "@/components/ui/Badge";
import { Label, Textarea } from "@/components/ui/Input";
import {
  CampaignStatusBadge,
  ScoreBar,
  ReplyTypeBadge,
  REPLY_TYPES,
} from "@/components/app/bits";

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"campaigns">;

  const data = useQuery(api.campaigns.get, { id });
  const matches = useQuery(api.journalists.listMatches, { campaignId: id });
  const drafts = useQuery(api.drafts.listByCampaign, { campaignId: id });
  const replies = useQuery(api.replies.listByCampaign, { campaignId: id });
  const usage = useQuery(api.usage.getMyUsage);
  const gmail = useQuery(api.gmailAccounts.getConnection);

  const runMatch = useMutation(api.journalists.matchForCampaign);
  const syncOpenCrab = useAction(api.opencrabActions.syncJournalists);
  const toggleInclude = useMutation(api.journalists.toggleInclude);
  const genDrafts = useMutation(api.drafts.generateForCampaign);
  const sendCampaign = useMutation(api.drafts.sendCampaign);
  const pushGmail = useAction(api.gmailActions.pushCampaignToGmail);

  const [busy, setBusy] = useState<string | null>(null);
  const [optOutConfirmed, setOptOutConfirmed] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  if (data === undefined) {
    return <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />;
  }
  if (data === null || !data.campaign) {
    return <p className="text-foreground-muted">캠페인을 찾을 수 없습니다.</p>;
  }

  const { campaign, pressRelease } = data;
  const includedCount = (matches ?? []).filter((m) => m.included).length;
  const sentCount = (drafts ?? []).filter((d) => d.status === "sent" || d.status === "published").length;

  async function wrap(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setSendError(null);
    try {
      await fn();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">{campaign.name}</h1>
          <CampaignStatusBadge status={campaign.status} />
        </div>
        {pressRelease && (
          <Card className="mt-4">
            <CardContent className="pt-5">
              <div className="flex flex-wrap gap-1.5">
                {pressRelease.topicTags.map((t) => (
                  <Badge key={t} variant="brand">
                    {t}
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground-muted">{pressRelease.body}</p>
              {pressRelease.numbers && (
                <p className="mt-2 text-xs text-muted">근거: {pressRelease.numbers}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ② 기자 매칭 */}
      <StepSection icon={Target} step="②" title="기자 매칭" desc="주제 기반 적합도 점수와 매칭 이유로 현역 기자를 제시합니다.">
        <div className="mb-4">
          <Button
            variant={matches && matches.length ? "subtle" : "brand"}
            onClick={() =>
              wrap("match", async () => {
                const tags = pressRelease?.topicTags ?? [];
                const sync = await syncOpenCrab({ topicTags: tags, topK: 15 });
                setSyncNote(sync.message ?? null);
                await runMatch({ campaignId: id });
              })
            }
            disabled={busy === "match"}
          >
            <Target className="h-4 w-4" /> {busy === "match" ? "매칭 중…" : matches && matches.length ? "다시 매칭" : "기자 매칭 실행"}
          </Button>
          {syncNote && <p className="mt-2 text-xs text-muted">{syncNote}</p>}
        </div>

        {matches && matches.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs font-semibold text-foreground-muted">
                <tr>
                  <th className="px-3 py-2.5">포함</th>
                  <th className="px-3 py-2.5">기자 · 매체</th>
                  <th className="px-3 py-2.5">적합도</th>
                  <th className="hidden px-3 py-2.5 lg:table-cell">매칭 이유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {matches.map((m) => (
                  <tr key={m._id} className="align-top hover:bg-surface">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={m.included}
                        onChange={() => toggleInclude({ matchId: m._id })}
                        className="h-4 w-4 accent-brand"
                        aria-label="발송 포함"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold tabular-nums">
                        {m.code} <span className="text-xs font-normal text-muted">· {m.outlet}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-xs text-muted">{m.beatPrimary}</span>
                        <ConfidenceBadge level={m.contactConfidence as "high" | "medium" | "low"} />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBar score={m.score} />
                    </td>
                    <td className="hidden max-w-xs px-3 py-3 text-xs text-foreground-muted lg:table-cell">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {matches && matches.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            🔒 기자 실명·이메일·연락처는 표시하지 않습니다(익명 코드). 실제 연락처는 발송 시점에만 사용됩니다.
          </p>
        )}
      </StepSection>

      {/* ③ 개인화 메일 초안 */}
      <StepSection icon={PenLine} step="③" title="개인화 메일 초안" desc="기자별 최근 기사를 언급한 서로 다른 메일. 무작위 대량발송이 아닙니다.">
        <div className="mb-4">
          <Button
            variant={drafts && drafts.length ? "subtle" : "brand"}
            onClick={() => wrap("gen", () => genDrafts({ campaignId: id }))}
            disabled={busy === "gen" || includedCount === 0}
          >
            <PenLine className="h-4 w-4" /> {busy === "gen" ? "생성 중…" : "개인화 메일 초안 생성"}
            {includedCount > 0 && <span className="opacity-80">({includedCount}명)</span>}
          </Button>
          {includedCount === 0 && <p className="mt-2 text-xs text-muted">먼저 매칭에서 발송할 기자를 포함하세요.</p>}
        </div>

        {drafts && drafts.length > 0 && (
          <div className="space-y-3">
            {drafts.map((d) => (
              <DraftItem key={d._id} draft={d} />
            ))}
          </div>
        )}
      </StepSection>

      {/* ④ 승인 게이트 + 발송 */}
      <StepSection icon={ShieldCheck} step="④" title="동의·승인 게이트" desc="사용자 승인 없이 자동 발송하지 않습니다. 산출물 기본값은 초안입니다.">
        <Card className="border-brand/20 bg-brand-soft/40">
          <CardContent className="space-y-4 pt-5">
            <ul className="space-y-1.5 text-sm text-foreground-muted">
              <li>· 발송 대상: <b className="text-foreground">{drafts?.length ?? 0}명</b> (매칭 포함 기준)</li>
              <li>· 이번 달 잔여: <b className="text-foreground">{usage ? `${usage.sendsRemaining}통` : "…"}</b> / {usage?.limits.label}</li>
              <li>· 모든 메일에 <b className="text-foreground">수신거부 문구</b> 자동 삽입 · 수신거부 회신은 억제 리스트 등록</li>
            </ul>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={optOutConfirmed}
                onChange={(e) => setOptOutConfirmed(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              수신자·수신거부 문구를 확인했으며, 발송으로 기록하는 데 동의합니다.
            </label>

            {sendError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{sendError}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() =>
                  wrap("send", async () => {
                    if (gmail?.connected) {
                      const result = await pushGmail({ campaignId: id });
                      if (result.message) setSyncNote(result.message);
                    } else {
                      await sendCampaign({ campaignId: id });
                    }
                  })
                }
                disabled={!optOutConfirmed || busy === "send" || !drafts || drafts.length === 0}
              >
                <Send className="h-4 w-4" />{" "}
                {busy === "send"
                  ? "처리 중…"
                  : gmail?.connected
                    ? "Gmail 초안 생성 (승인)"
                    : "발송 기록 (승인)"}
              </Button>
              <span className="text-xs text-muted">
                {gmail?.connected
                  ? `* 연결된 Gmail(${gmail.email})의 ‘언론홍보’ 라벨에 초안을 만듭니다. 실발송은 Gmail에서 확인 후.`
                  : "* Gmail 미연결 시 ‘발송됨’으로만 기록합니다. 설정에서 BYO Gmail을 연결하면 초안이 생성됩니다."}
              </span>
            </div>
            {sentCount > 0 && (
              <p className="text-sm font-semibold text-success">✓ {sentCount}통 발송 기록 완료 — 3·7일 뒤 게재 확인을 권장합니다.</p>
            )}
          </CardContent>
        </Card>
      </StepSection>

      {/* 회신 처리 */}
      <StepSection icon={Inbox} step="⑤" title="회신 응대" desc="기자 회신을 붙여넣으면 7유형으로 분류하고 답장 초안을 만듭니다.">
        <ReplyComposer campaignId={id} drafts={drafts ?? []} />
        {replies && replies.length > 0 && (
          <div className="mt-4 space-y-3">
            {replies.map((r) => (
              <ReplyItem key={r._id} reply={r} />
            ))}
          </div>
        )}
      </StepSection>
    </div>
  );
}

/* ── 하위 컴포넌트 ── */

function StepSection({
  icon: Icon,
  step,
  title,
  desc,
  children,
}: {
  icon: typeof Target;
  step: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-deep text-deep-foreground">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div>
          <h2 className="text-lg font-bold">
            <span className="text-brand">{step}</span> {title}
          </h2>
          <p className="text-sm text-foreground-muted">{desc}</p>
        </div>
      </div>
      <div className="sm:pl-12">{children}</div>
    </section>
  );
}

function DraftItem({
  draft,
}: {
  draft: { _id: string; subject: string; body: string; code: string; outlet: string; status: string };
}) {
  const [open, setOpen] = useState(false);
  const hasOptOut = draft.body.includes("수신거부");
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{draft.subject}</div>
          <div className="mt-0.5 text-xs text-muted">→ {draft.code} · {draft.outlet}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasOptOut && (
            <Badge variant="success">
              <Check className="h-3 w-3" /> 수신거부 포함
            </Badge>
          )}
          <ChevronDown className={"h-4 w-4 text-muted transition-transform " + (open ? "rotate-180" : "")} />
        </div>
      </button>
      {open && (
        <pre className="whitespace-pre-wrap border-t border-border bg-surface/50 px-4 py-3 text-sm leading-relaxed text-foreground-muted">
          {draft.body}
        </pre>
      )}
    </div>
  );
}

function ReplyComposer({
  campaignId,
  drafts,
}: {
  campaignId: Id<"campaigns">;
  drafts: { journalistId: string; code: string; outlet: string }[];
}) {
  const addReply = useMutation(api.replies.add);
  const [journalistId, setJournalistId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const options = Array.from(
    new Map(drafts.map((d) => [d.journalistId, `${d.code} · ${d.outlet}`])).entries(),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!journalistId || !body.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await addReply({
        campaignId,
        journalistId: journalistId as Id<"journalists">,
        rawBody: body,
      });
      setResult(REPLY_TYPES[res.type]?.label ?? res.type);
      setBody("");
    } finally {
      setBusy(false);
    }
  }

  if (options.length === 0) {
    return <p className="text-sm text-muted">먼저 메일 초안을 생성하면 회신을 처리할 수 있습니다.</p>;
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <div>
          <Label htmlFor="j">기자</Label>
          <select
            id="j"
            value={journalistId}
            onChange={(e) => setJournalistId(e.target.value)}
            className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">선택…</option>
            {options.map(([jid, name]) => (
              <option key={jid} value={jid}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="rb">회신 원문</Label>
          <Textarea id="rb" value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="기자 회신을 붙여넣으세요. 예) 인터뷰 가능한 시간 알려주세요." />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy || !journalistId || !body.trim()}>
          {busy ? "분류 중…" : "분류 + 답장 초안"}
        </Button>
        {result && <span className="text-sm text-foreground-muted">→ 분류: <b className="text-foreground">{result}</b></span>}
      </div>
    </form>
  );
}

function ReplyItem({
  reply,
}: {
  reply: {
    _id: string;
    type: string;
    rawBody: string;
    draftResponse: string;
    handled: boolean;
    code: string;
    outlet: string;
  };
}) {
  const markHandled = useMutation(api.replies.markHandled);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ReplyTypeBadge type={reply.type} />
          <span className="text-sm font-semibold tabular-nums">{reply.code}</span>
          <span className="text-xs text-muted">· {reply.outlet}</span>
        </div>
        {reply.handled ? (
          <Badge variant="success">
            <Check className="h-3 w-3" /> 처리됨
          </Badge>
        ) : (
          <Button size="sm" variant="subtle" onClick={() => markHandled({ id: reply._id as Id<"replies"> })}>
            처리 완료
          </Button>
        )}
      </div>
      <p className="mt-2 rounded-md bg-surface px-3 py-2 text-sm text-foreground-muted">“{reply.rawBody}”</p>
      <div className="mt-2">
        <div className="text-xs font-semibold text-muted">답장 초안</div>
        <pre className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{reply.draftResponse}</pre>
      </div>
    </div>
  );
}
