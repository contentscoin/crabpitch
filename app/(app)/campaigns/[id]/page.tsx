"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
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
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, ConfidenceBadge } from "@/components/ui/Badge";
import { Input, Label, Textarea } from "@/components/ui/Input";
import {
  CampaignStatusBadge,
  ScoreBar,
  ReplyTypeBadge,
  REPLY_TYPES,
} from "@/components/app/bits";
import {
  EMAIL_TEMPLATE_PRESETS,
  TEMPLATE_PLACEHOLDERS,
  hasOptOut as hasUsableOptOut,
  isEmailTemplatePresetId,
  type EmailTemplatePresetId,
} from "@/convex/lib/emailTemplate";
import { REPLY_TEMPLATE_VARIANTS } from "@/convex/lib/replyClassifier";
import type { ReplyType } from "@/convex/lib/replyClassifier";

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"campaigns">;

  const data = useQuery(api.campaigns.get, { id });
  const matches = useQuery(api.journalists.listMatches, { campaignId: id });
  const drafts = useQuery(api.drafts.listByCampaign, { campaignId: id });
  const replies = useQuery(api.replies.listByCampaign, { campaignId: id });
  const usage = useQuery(api.usage.getMyUsage);
  const gmail = useQuery(api.gmailAccounts.getConnection);
  const aiStatus = useQuery(api.aiKeys.status);
  const customTemplates = useQuery(api.emailTemplates.list);

  const runMatch = useMutation(api.journalists.matchForCampaign);
  const syncOpenCrab = useAction(api.opencrabActions.syncJournalists);
  const toggleInclude = useMutation(api.journalists.toggleInclude);
  const genDrafts = useMutation(api.drafts.generateForCampaign);
  const enhanceDrafts = useAction(api.aiActions.enhanceCampaignDrafts);
  const sendCampaign = useMutation(api.drafts.sendCampaign);
  const scheduleCampaign = useMutation(api.drafts.scheduleCampaign);
  const pushGmail = useAction(api.gmailActions.pushCampaignToGmail);

  const [busy, setBusy] = useState<string | null>(null);
  const [optOutConfirmed, setOptOutConfirmed] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [scheduleLocal, setScheduleLocal] = useState("");
  /** 프리셋 id 또는 "custom:<docId>" */
  const [templateChoice, setTemplateChoice] = useState("standard");

  // 선택한 커스텀 템플릿이 (다른 탭 등에서) 삭제되면 standard로 폴백.
  useEffect(() => {
    if (
      templateChoice.startsWith("custom:") &&
      customTemplates !== undefined &&
      !customTemplates.some((t) => `custom:${t._id}` === templateChoice)
    ) {
      setTemplateChoice("standard");
    }
  }, [templateChoice, customTemplates]);

  const aiLoading = aiStatus === undefined;
  const aiConnected = !!aiStatus?.activeProvider;

  const blockedCount =
    drafts?.filter((d) => d.complianceLevel === "fail" || d.complianceLevel === "blocked").length ?? 0;
  const warnCount = drafts?.filter((d) => d.complianceLevel === "warn").length ?? 0;

  function templateArgs(): {
    preset?: EmailTemplatePresetId;
    customTemplateId?: Id<"userEmailTemplates">;
  } {
    if (templateChoice.startsWith("custom:")) {
      return { customTemplateId: templateChoice.slice("custom:".length) as Id<"userEmailTemplates"> };
    }
    return { preset: isEmailTemplatePresetId(templateChoice) ? templateChoice : "standard" };
  }

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
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted">{m.beatPrimary}</span>
                        <ConfidenceBadge level={m.contactConfidence as "high" | "medium" | "low"} />
                        <StaleBadge days={m.packAgeDays} />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBar score={m.score} />
                    </td>
                    <td className="hidden max-w-xs px-3 py-3 text-xs text-foreground-muted lg:table-cell">
                      {m.reason}
                      {m.packAgeDays !== undefined && m.packAgeDays >= STALE_PACK_DAYS && (
                        <span className="block text-warning">
                          · 기자단 자료에서 {m.packAgeDays}일째 확인되지 않았습니다(이직·부서 이동 가능).
                        </span>
                      )}
                    </td>
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
        <TemplatePicker
          value={templateChoice}
          onChange={setTemplateChoice}
          customTemplates={customTemplates ?? []}
        />

        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            variant={drafts && drafts.length ? "subtle" : "brand"}
            onClick={() =>
              wrap("gen", async () => {
                await genDrafts({ campaignId: id, ...templateArgs() });
                // 로딩 중에는 서버가 안전하게 skipped를 반환하므로 호출해 둔다.
                if (aiLoading || aiConnected) {
                  const enhanced = await enhanceDrafts({ campaignId: id });
                  if (enhanced.message) setDraftNote(enhanced.message);
                }
              })
            }
            disabled={busy === "gen" || includedCount === 0}
          >
            <PenLine className="h-4 w-4" /> {busy === "gen" ? "생성 중…" : "개인화 메일 초안 생성"}
            {includedCount > 0 && <span className="opacity-80">({includedCount}명)</span>}
          </Button>
          {drafts && drafts.length > 0 && !aiLoading && aiConnected && (
            <Button
              variant="subtle"
              onClick={() =>
                wrap("ai", async () => {
                  const enhanced = await enhanceDrafts({ campaignId: id });
                  if (enhanced.message) setDraftNote(enhanced.message);
                })
              }
              disabled={busy === "ai"}
            >
              <Wand2 className="h-4 w-4" /> {busy === "ai" ? "AI 다듬는 중…" : "내 AI로 다듬기"}
            </Button>
          )}
          {drafts && drafts.length > 0 && !aiLoading && !aiConnected && (
            <Link href="/ai">
              <Button
                variant="ghost"
                title="내 AI에서 본인 GPT·Claude·Gemini API 키를 등록하면 초안을 AI로 개인화할 수 있습니다."
              >
                <Wand2 className="h-4 w-4" /> AI 연결하고 다듬기
              </Button>
            </Link>
          )}
          {includedCount === 0 && <p className="mt-2 w-full text-xs text-muted">먼저 매칭에서 발송할 기자를 포함하세요.</p>}
          {draftNote && <p className="mt-2 w-full text-xs text-muted">{draftNote}</p>}
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
              <li>
                · 발송 시점에 <b className="text-foreground">수신거부·7일 쿨다운·표현 규정</b>을 서버가 다시 확인합니다.
                걸린 초안은 삭제하지 않고 사유를 남긴 채 남겨 둡니다.
              </li>
              {blockedCount > 0 && (
                <li className="text-danger">
                  · 표현 규정 위반으로 <b>{blockedCount}건</b>이 발송에서 제외됩니다. 위 초안 목록에서 사유를 확인하세요.
                </li>
              )}
              {warnCount > 0 && (
                <li className="text-warning">· 확인이 필요한 초안 <b>{warnCount}건</b>이 있습니다(발송은 가능합니다).</li>
              )}
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

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="sched">예약 발송 (선택)</Label>
                <input
                  id="sched"
                  type="datetime-local"
                  value={scheduleLocal}
                  onChange={(e) => setScheduleLocal(e.target.value)}
                  className="mt-1 block rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() =>
                  wrap("send", async () => {
                    if (scheduleLocal) {
                      const at = new Date(scheduleLocal).getTime();
                      if (Number.isNaN(at)) throw new Error("예약 시각이 올바르지 않습니다.");
                      const result = await scheduleCampaign({
                        campaignId: id,
                        scheduledSendAt: at,
                      });
                      setSendNote(
                        `${result.count}통 예약됨 · ${new Date(result.scheduledSendAt).toLocaleString("ko-KR")}`,
                      );
                      return;
                    }
                    if (gmail?.connected) {
                      const result = await pushGmail({ campaignId: id });
                      if (result.message) setSendNote(result.message);
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
                  : scheduleLocal
                    ? "예약 발송 (승인)"
                    : gmail?.connected
                      ? "Gmail 초안 생성 (승인)"
                      : "발송 기록 (승인)"}
              </Button>
              <span className="text-xs text-muted">
                {scheduleLocal
                  ? "* 예약 시각에 발송 기록으로 확정됩니다(매분 크론·스케줄러)."
                  : gmail?.connected
                    ? `* 연결된 Gmail(${gmail.email})의 ‘언론홍보’ 라벨에 초안을 만듭니다. 실발송은 Gmail에서 확인 후.`
                    : "* Gmail 미연결 시 ‘발송됨’으로만 기록합니다. 설정에서 BYO Gmail을 연결하면 초안이 생성됩니다."}
              </span>
            </div>
            {sendNote && <p className="text-xs text-muted">{sendNote}</p>}
            {campaign.scheduledSendAt && campaign.status === "sending" && (
              <p className="text-sm font-semibold text-brand">
                예약됨 · {new Date(campaign.scheduledSendAt).toLocaleString("ko-KR")}
              </p>
            )}
            {sentCount > 0 && (
              <p className="text-sm font-semibold text-success">✓ {sentCount}통 발송 기록 완료 — 3·7일 뒤 게재 확인을 권장합니다.</p>
            )}
          </CardContent>
        </Card>
      </StepSection>

      {sentCount > 0 && <FollowUpSection campaignId={id} />}

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

/** 팩에서 이 기간 이상 확인되지 않으면 배지를 띄운다. */
const STALE_PACK_DAYS = 30;

const QUESTION_SUBTYPE_LABELS: Record<string, string> = {
  numbers: "수치 검증",
  competitor: "경쟁사 비교",
  intent: "전략 의도",
  roadmap: "향후 계획",
  negative: "부정적 맥락",
};

function StaleBadge({ days }: { days?: number }) {
  if (days === undefined || days < STALE_PACK_DAYS) return null;
  return (
    <Badge variant="warning" title="기자단 자료에서 최근 확인되지 않았습니다. 이직·부서 이동 가능성이 있습니다.">
      팩 확인 {days}일 경과
    </Badge>
  );
}

function DraftItem({
  draft,
}: {
  draft: {
    _id: string;
    subject: string;
    body: string;
    code: string;
    outlet: string;
    status: string;
    complianceLevel?: string;
    complianceNotes?: string[];
  };
}) {
  const [open, setOpen] = useState(false);
  const hasOptOut = hasUsableOptOut(draft.body);
  const level = draft.complianceLevel;
  const notes = draft.complianceNotes ?? [];
  // "blocked"는 쿨다운 등으로 이번 회차에 나가지 않은 초안(삭제하지 않고 사유만 남긴다).
  const blocking = level === "fail" || level === "blocked";
  return (
    <div
      className={
        "overflow-hidden rounded-lg border bg-card " +
        (blocking ? "border-danger/60" : "border-border")
      }
    >
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{draft.subject}</div>
          <div className="mt-0.5 text-xs text-muted">→ {draft.code} · {draft.outlet}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {level === "fail" && <Badge variant="danger">발송 차단</Badge>}
          {level === "blocked" && <Badge variant="warning">이번 회차 제외</Badge>}
          {level === "warn" && <Badge variant="warning">확인 필요</Badge>}
          {hasOptOut && (
            <Badge variant="success">
              <Check className="h-3 w-3" /> 수신거부 포함
            </Badge>
          )}
          <ChevronDown className={"h-4 w-4 text-muted transition-transform " + (open ? "rotate-180" : "")} />
        </div>
      </button>
      {notes.length > 0 && (
        <ul className="border-t border-border bg-surface/30 px-4 py-2 text-xs text-foreground-muted">
          {notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}
      {open && (
        <pre className="whitespace-pre-wrap border-t border-border bg-surface/50 px-4 py-3 text-sm leading-relaxed text-foreground-muted">
          {draft.body}
        </pre>
      )}
    </div>
  );
}

const CUSTOM_BODY_SCAFFOLD = `{{후킹}}

{{회사명}}은(는) {{헤드라인}}. {{핵심수치}}

{{인용문}}

{{자료링크}}

추가 자료나 대표 인터뷰가 필요하시면 편하게 회신 주세요.

{{발신자}} 드림
{{연락처}}`;

/** 메일 초안 템플릿 선택 + 커스텀 템플릿 편집. */
function TemplatePicker({
  value,
  onChange,
  customTemplates,
}: {
  value: string;
  onChange: (v: string) => void;
  customTemplates: { _id: string; name: string; subject: string; body: string }[];
}) {
  const saveTemplate = useMutation(api.emailTemplates.save);
  const removeTemplate = useMutation(api.emailTemplates.remove);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const selectedCustom = value.startsWith("custom:")
    ? customTemplates.find((t) => `custom:${t._id}` === value) ?? null
    : null;

  function openEditor(tpl: { _id: string; name: string; subject: string; body: string } | null) {
    if (tpl) {
      setEditingId(tpl._id);
      setName(tpl.name);
      setSubject(tpl.subject);
      setBody(tpl.body);
    } else {
      setEditingId(null);
      setName("");
      setSubject("[{{회사명}}] {{헤드라인}}");
      setBody(CUSTOM_BODY_SCAFFOLD);
    }
    setNote(null);
    setEditorOpen(true);
  }

  async function onSave() {
    setBusy(true);
    setNote(null);
    try {
      const savedId = await saveTemplate({
        id: editingId ? (editingId as Id<"userEmailTemplates">) : undefined,
        name,
        subject,
        body,
      });
      onChange(`custom:${savedId}`);
      setEditorOpen(false);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(tplId: string) {
    if (!window.confirm("이 템플릿을 삭제할까요?")) return;
    setNote(null);
    try {
      await removeTemplate({ id: tplId as Id<"userEmailTemplates"> });
      if (value === `custom:${tplId}`) onChange("standard");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="text-sm font-semibold">메일 템플릿</div>
      <p className="mt-0.5 text-xs text-muted">
        초안 생성에 쓸 골격을 고르세요. 어떤 템플릿이든 「기자님」 호칭과 수신거부 문구는 자동으로
        보장됩니다.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {EMAIL_TEMPLATE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.description}
            aria-pressed={value === p.id}
            onClick={() => onChange(p.id)}
            className={
              "rounded-md border px-3 py-1.5 text-sm transition-colors " +
              (value === p.id
                ? "border-brand bg-brand-soft/40 font-semibold"
                : "border-border bg-card hover:bg-surface")
            }
          >
            {p.label}
          </button>
        ))}
        {customTemplates.map((t) => (
          <button
            key={t._id}
            type="button"
            title={t.subject}
            aria-pressed={value === `custom:${t._id}`}
            onClick={() => onChange(`custom:${t._id}`)}
            className={
              "rounded-md border px-3 py-1.5 text-sm transition-colors " +
              (value === `custom:${t._id}`
                ? "border-brand bg-brand-soft/40 font-semibold"
                : "border-border bg-card hover:bg-surface")
            }
          >
            ✎ {t.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => openEditor(null)}
          className="rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-foreground-muted hover:bg-surface"
        >
          ＋ 새 템플릿
        </button>
      </div>
      {selectedCustom && !editorOpen && (
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" variant="subtle" onClick={() => openEditor(selectedCustom)}>
            템플릿 편집
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(selectedCustom._id)}>
            삭제
          </Button>
        </div>
      )}
      {note && !editorOpen && <p className="mt-2 text-xs text-danger">{note}</p>}

      {editorOpen && (
        <div className="mt-4 space-y-3 rounded-md border border-border bg-surface/50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tpl-name">템플릿 이름</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예) 우리 회사 기본형"
              />
            </div>
            <div>
              <Label htmlFor="tpl-subject">제목 템플릿</Label>
              <Input
                id="tpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="[{{회사명}}] {{헤드라인}}"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="tpl-body">본문 템플릿</Label>
            <Textarea
              id="tpl-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
            />
          </div>
          <details className="text-xs text-foreground-muted">
            <summary className="cursor-pointer font-semibold">사용 가능한 자리표시자</summary>
            <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">
              {TEMPLATE_PLACEHOLDERS.map((p) => (
                <li key={p.key}>
                  <code>{`{{${p.key}}}`}</code> — {p.description}
                </li>
              ))}
            </ul>
          </details>
          {note && <p className="text-xs text-danger">{note}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy || !body.trim()} onClick={onSave}>
              {busy ? "저장 중…" : editingId ? "수정 저장" : "템플릿 저장"}
            </Button>
            <Button type="button" size="sm" variant="subtle" onClick={() => setEditorOpen(false)}>
              닫기
            </Button>
          </div>
        </div>
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
    templateVariant?: string;
    handled: boolean;
    code: string;
    outlet: string;
    interviewSlots?: string[];
    interviewPickedSlot?: string;
    questionSubtype?: string;
    needsEscalation?: boolean;
    correctionRequestedAt?: number;
    reapproachOk?: boolean;
  };
}) {
  const markHandled = useMutation(api.replies.markHandled);
  const confirmSlot = useMutation(api.replies.confirmInterviewSlot);
  const refreshSlots = useMutation(api.replies.refreshInterviewSlots);
  const applyTemplate = useMutation(api.replies.applyReplyTemplate);
  const requestCorrection = useMutation(api.replies.requestCorrection);
  const setReapproach = useMutation(api.replies.setReapproach);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");
  const [variantBusy, setVariantBusy] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);
  const variants = REPLY_TEMPLATE_VARIANTS[reply.type as ReplyType] ?? [];
  const activeVariant = reply.templateVariant ?? "default";

  async function onApplyVariant(variantId: string) {
    setVariantBusy(true);
    setVariantError(null);
    try {
      await applyTemplate({ id: reply._id as Id<"replies">, variantId });
    } catch (e) {
      setVariantError(e instanceof Error ? e.message : "템플릿 적용에 실패했습니다.");
    } finally {
      setVariantBusy(false);
    }
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ReplyTypeBadge type={reply.type} />
          <span className="text-sm font-semibold tabular-nums">{reply.code}</span>
          <span className="text-xs text-muted">· {reply.outlet}</span>
          {reply.questionSubtype && (
            <span className="text-xs text-muted">
              · {QUESTION_SUBTYPE_LABELS[reply.questionSubtype] ?? reply.questionSubtype}
            </span>
          )}
          {reply.needsEscalation && (
            <Badge variant="danger" title="초안을 그대로 보내지 말고 담당자가 사실관계를 확인하세요.">
              담당자 확인 필요
            </Badge>
          )}
        </div>
        {reply.handled ? (
          <Badge variant="success">
            <Check className="h-3 w-3" /> 처리됨
            {reply.interviewPickedSlot ? ` · ${reply.interviewPickedSlot}` : ""}
          </Badge>
        ) : (
          <Button size="sm" variant="subtle" onClick={() => markHandled({ id: reply._id as Id<"replies"> })}>
            처리 완료
          </Button>
        )}
      </div>
      <p className="mt-2 rounded-md bg-surface px-3 py-2 text-sm text-foreground-muted">“{reply.rawBody}”</p>
      {variants.length > 1 && !reply.handled && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted">응대 톤:</span>
          {variants.map((v) => (
            <button
              key={v.id}
              type="button"
              title={v.description}
              aria-pressed={activeVariant === v.id}
              disabled={variantBusy}
              onClick={() => onApplyVariant(v.id)}
              className={
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-60 " +
                (activeVariant === v.id
                  ? "border-brand bg-brand-soft/40 font-semibold text-foreground"
                  : "border-border text-foreground-muted hover:bg-surface")
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      {variantError && <p className="mt-1 text-xs text-danger">{variantError}</p>}
      {reply.handled && variants.length > 1 && (
        <p className="mt-2 text-xs text-muted">
          응대 톤: {variants.find((v) => v.id === activeVariant)?.label ?? activeVariant}
        </p>
      )}
      <div className="mt-2">
        <div className="text-xs font-semibold text-muted">답장 초안</div>
        <pre className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{reply.draftResponse}</pre>
      </div>
      {reply.type === "interview" && !reply.handled && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(reply.interviewSlots ?? []).map((slot) => (
            <Button
              key={slot}
              size="sm"
              variant="brand"
              onClick={() => confirmSlot({ id: reply._id as Id<"replies">, slot })}
            >
              {slot}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => refreshSlots({ id: reply._id as Id<"replies"> })}>
            일정 다시 제안
          </Button>
        </div>
      )}

      {reply.type === "published" && (
        <div className="mt-3">
          {reply.correctionRequestedAt ? (
            <p className="text-xs text-warning">
              정정 요청 초안을 만들었습니다. 사실관계가 걸린 사안이니 보내기 전에 직접 확인하세요.
            </p>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCorrectionOpen((v) => !v);
                  setVariantError(null);
                }}
              >
                기사에 사실과 다른 내용이 있나요?
              </Button>
              {correctionOpen && (
                <div className="mt-2 space-y-2">
                  <Textarea
                    rows={2}
                    value={correctionNote}
                    onChange={(e) => setCorrectionNote(e.target.value)}
                    placeholder="무엇이 어떻게 다른지 한 문장으로. 예) 투자 규모가 5억인데 기사에는 50억으로 표기됐습니다."
                  />
                  <Button
                    size="sm"
                    disabled={variantBusy || correctionNote.trim().length < 5}
                    onClick={async () => {
                      setVariantBusy(true);
                      setVariantError(null);
                      try {
                        await requestCorrection({
                          id: reply._id as Id<"replies">,
                          correctionNote,
                        });
                        setCorrectionOpen(false);
                        setCorrectionNote("");
                      } catch (e) {
                        setVariantError(e instanceof Error ? e.message : "정정 요청에 실패했습니다.");
                      } finally {
                        setVariantBusy(false);
                      }
                    }}
                  >
                    정정 요청 초안 만들기
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {reply.type === "hold" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-muted">다음 소식 때 다시 연락해도 될까요?</span>
          {([
            { value: true, label: "가능" },
            { value: false, label: "연락 안 함" },
          ] as const).map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              aria-pressed={reply.reapproachOk === opt.value}
              disabled={variantBusy}
              onClick={async () => {
                setVariantBusy(true);
                setVariantError(null);
                try {
                  await setReapproach({
                    id: reply._id as Id<"replies">,
                    reapproachOk: opt.value,
                  });
                } catch (e) {
                  setVariantError(e instanceof Error ? e.message : "저장에 실패했습니다.");
                } finally {
                  setVariantBusy(false);
                }
              }}
              className={
                "rounded-full border px-2.5 py-0.5 transition-colors disabled:opacity-60 " +
                (reply.reapproachOk === opt.value
                  ? "border-brand bg-brand-soft/40 font-semibold text-foreground"
                  : "border-border text-foreground-muted hover:bg-surface")
              }
            >
              {opt.label}
            </button>
          ))}
          {reply.reapproachOk === false && (
            <span className="text-muted">· 이후 매칭 후보에서 제외됩니다</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 팔로업 — 무회신 발송 건에 **새 정보를 담아** 한 번 더 접촉한다.
 * 최소 간격·새 정보·재탕 여부는 서버가 판정하므로 여기서는 안내와 입력만 다룬다.
 */
function FollowUpSection({ campaignId }: { campaignId: Id<"campaigns"> }) {
  const candidates = useQuery(api.drafts.listFollowUpCandidates, { campaignId });
  const createFollowUp = useMutation(api.drafts.createFollowUp);
  const [openId, setOpenId] = useState<string | null>(null);
  const [news, setNews] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!candidates || candidates.length === 0) return null;
  const eligible = candidates.filter((c) => c.eligible);

  async function submit(draftId: string) {
    setBusy(true);
    setNote(null);
    try {
      await createFollowUp({ draftId: draftId as Id<"emailDrafts">, newsUpdate: news });
      setNews("");
      setOpenId(null);
      setNote("팔로업 초안을 만들었습니다. ③단계 초안 목록에서 확인하고 발송하세요.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "팔로업 초안 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepSection
      icon={Send}
      step="④-b"
      title="팔로업"
      desc="회신이 없는 건에 한해, 새로 생긴 사실이 있을 때만 한 번 더 보냅니다."
    >
      <p className="mb-3 text-xs text-muted">
        같은 내용을 다시 보내는 것은 스팸입니다. 지난 메일 이후 새로 확정된 사실이 없으면
        팔로업하지 않는 편이 낫습니다. 최소 간격·재탕 여부는 서버가 확인합니다.
      </p>
      {eligible.length === 0 ? (
        <p className="text-sm text-muted">
          아직 팔로업할 수 있는 건이 없습니다. ({candidates[0]?.reason ?? "대기 중"})
        </p>
      ) : (
        <ul className="space-y-2">
          {eligible.map((c) => (
            <li key={c.draftId} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{c.subject}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    → {c.code} · {c.outlet} · 발송 {c.daysSinceSent}일 경과 · 무회신
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => {
                    setOpenId(openId === c.draftId ? null : c.draftId);
                    setNote(null);
                  }}
                >
                  {openId === c.draftId ? "닫기" : "팔로업 작성"}
                </Button>
              </div>
              {openId === c.draftId && (
                <div className="mt-3 space-y-2">
                  <Label htmlFor={`news-${c.draftId}`}>지난 메일 이후 새로 생긴 사실</Label>
                  <Textarea
                    id={`news-${c.draftId}`}
                    rows={3}
                    value={news}
                    onChange={(e) => setNews(e.target.value)}
                    placeholder="예) 어제 대형 유통사와 공급 계약을 체결했습니다. 계약 규모 12억 원(계약서 기준), 내년 1월 납품 시작."
                  />
                  <Button size="sm" disabled={busy || news.trim().length < 20} onClick={() => submit(c.draftId)}>
                    {busy ? "만드는 중…" : "팔로업 초안 만들기"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-2 text-xs text-foreground-muted">{note}</p>}
    </StepSection>
  );
}
