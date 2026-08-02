"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Button, buttonClasses } from "@/components/ui/Button";
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
  buildEmailContext,
  findUnknownPlaceholders,
  hasOptOut as hasUsableOptOut,
  isEmailTemplatePresetId,
  renderCustomTemplate,
  type EmailContext,
  type EmailTemplatePresetId,
  type JournalistContext,
} from "@/convex/lib/emailTemplate";
import { checkEmailCompliance, EMAIL_BODY_CHAR_MAX } from "@/convex/lib/emailCompliance";
import { useConfirm } from "@/components/ui/Dialog";
import { toUserMessage } from "@/lib/errorMessage";
import { needsPilotApproval } from "@/convex/lib/pilotGate";
import { REPLY_TEMPLATE_VARIANTS } from "@/convex/lib/replyClassifier";
import type { ReplyType } from "@/convex/lib/replyClassifier";
import { SkeletonCard } from "@/components/ui/Skeleton";

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"campaigns">;

  const data = useQuery(api.campaigns.get, { id });
  const matches = useQuery(api.journalists.listMatches, { campaignId: id });
  const beyond = useQuery(api.journalists.listBeyondMatches, { campaignId: id });
  const drafts = useQuery(api.drafts.listByCampaign, { campaignId: id });
  const replies = useQuery(api.replies.listByCampaign, { campaignId: id });
  const usage = useQuery(api.usage.getMyUsage);
  const gmail = useQuery(api.gmailAccounts.getConnection);
  const smtp = useQuery(api.smtpAccounts.getConnection);
  const aiStatus = useQuery(api.aiKeys.status);
  const customTemplates = useQuery(api.emailTemplates.list);
  // 템플릿 미리보기에 쓸 발신 정보(회사명·보내는 사람·연락처).
  const myProfile = useQuery(api.profiles.getMyProfile);
  const similarity = useQuery(api.drafts.campaignSimilarity, { campaignId: id });

  const runMatch = useMutation(api.journalists.matchForCampaign);
  const syncOpenCrab = useAction(api.opencrabActions.syncJournalists);
  const toggleInclude = useMutation(api.journalists.toggleInclude);
  const addToMatches = useMutation(api.journalists.addToMatches);
  const [showAll, setShowAll] = useState(false);
  const genDrafts = useMutation(api.drafts.generateForCampaign);
  const enhanceDrafts = useAction(api.aiActions.enhanceCampaignDrafts);
  const sendCampaign = useMutation(api.drafts.sendCampaign);
  const scheduleCampaign = useMutation(api.drafts.scheduleCampaign);
  const cancelSchedule = useMutation(api.drafts.cancelSchedule);
  const pushGmail = useAction(api.gmailActions.pushCampaignToGmail);
  const sendSmtp = useAction(api.smtpActions.sendCampaign);

  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [optOutConfirmed, setOptOutConfirmed] = useState(false);
  /**
   * 발신 수단 미연결 상태에서 "발송됨"으로만 기록하는 것에 대한 명시적 동의.
   *
   * 이 경로는 메일을 **한 통도 보내지 않는다**. 그런데 초안이 sent로 잠겨
   * 재생성도 막히므로(generateForCampaign이 sent를 보존한다) 되돌릴 수 없다.
   * 크랩피치 밖에서 직접 보낸 사용자를 위한 기능이지 기본 경로가 아니다.
   */
  const [recordOnlyConfirmed, setRecordOnlyConfirmed] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [scheduleLocal, setScheduleLocal] = useState("");
  /**
   * 발송 수단. 사용자가 고르지 않았으면 null이고, 그때는 아래 `effectiveSendMode`가
   * **더 안전한 쪽**(되돌릴 수 있는 Gmail 초안)을 먼저 고른다.
   */
  const [sendMode, setSendMode] = useState<"gmail" | "smtp" | null>(null);
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
  // 파일럿 게이트 — 판정은 서버와 같은 함수를 쓴다(임계값을 화면에 복제하지 않는다).
  const pendingDrafts = drafts?.filter((d) => d.status === "draft" || d.status === "queued") ?? [];
  const pilotBlocked = needsPilotApproval(pendingDrafts);

  /**
   * 발송 수단 결정.
   *
   * 둘 다 쓸 수 있으면 **되돌릴 수 있는 쪽**(Gmail 초안)이 기본이다. SMTP는 누르는
   * 즉시 기자 메일함으로 나가므로, 그쪽을 쓰려면 사용자가 명시적으로 골라야 한다.
   * 하나만 있으면 고를 것이 없으므로 그것을 쓴다.
   *
   * ⚠️ `connected`만 보면 안 된다. Gmail 연동은 Agency 전용이라, 다운그레이드한
   *    사용자는 계정이 남아 있어도 쓸 수 없다(서버도 발송 시점에 다시 막는다).
   */
  const gmailUsable = gmail?.connected === true && gmail.allowed;
  const bothConnected = gmailUsable && smtp?.connected === true;
  const effectiveSendMode: "gmail" | "smtp" | null = bothConnected
    ? (sendMode ?? "gmail")
    : gmailUsable
      ? "gmail"
      : smtp?.connected
        ? "smtp"
        : null;

  /**
   * 연결 상태를 아직 모르는 동안(쿼리 로딩)에도 effectiveSendMode는 null이다.
   * "미연결"과 "모름"을 구분하지 않으면 로딩 중에 경고를 띄우게 된다.
   */
  const senderLoading = gmail === undefined || smtp === undefined;
  const senderConnected = effectiveSendMode !== null;
  /** 실제 발송이 일어나지 않는 경로 — 명시적 동의 없이는 실행을 막는다. */
  const recordOnlyBlocked = !senderLoading && !senderConnected && !recordOnlyConfirmed;

  /**
   * 예약 실행 시점에 쓸 수단.
   *
   * 즉시 발송과 **같은 수단**이어야 한다. 예약이 수단을 무시하고 기록만 남기던 것이
   * 이 화면의 가장 큰 함정이었다(SMTP를 연결해 둬도 예약하면 메일이 안 나갔다).
   */
  const scheduledSendMode: "smtp" | "gmail_drafts" | "record_only" =
    effectiveSendMode === "smtp"
      ? "smtp"
      : effectiveSendMode === "gmail"
        ? "gmail_drafts"
        : "record_only";

  /**
   * 템플릿 미리보기 컨텍스트.
   *
   * 서버 초안 생성과 **같은** `buildEmailContext`를 쓴다 — 매핑을 화면에서 다시 구현하면
   * 미리보기가 실제 초안과 다른 문장을 보여 주고, 그건 미리보기가 없는 것보다 나쁘다.
   * 표본 기자는 매칭 1순위(포함된 기자 우선)다. 매칭 전이면 예시 기자로 렌더해
   * 편집기가 첫 사용에도 빈 화면을 보이지 않게 한다.
   */
  const previewContext = useMemo((): {
    email: EmailContext;
    journalist: JournalistContext;
    label: string;
    isSample: boolean;
  } | null => {
    const pr = data?.pressRelease;
    if (!pr) return null;
    const sample = (matches ?? []).find((m) => m.included) ?? (matches ?? [])[0];
    return {
      email: buildEmailContext(pr, myProfile?.profile),
      journalist: sample
        ? {
            beatPrimary: sample.beatPrimary || "IT·스타트업",
            topReferenceTitle: sample.topReferenceTitle,
            outletCategory: sample.outletCategory as JournalistContext["outletCategory"],
            // 후킹 문장·beat 앵글 분기가 이 값들로 갈린다 — 빠지면 미리보기가
            // 실제 초안과 다른 문장을 보여 준다.
            beatSecondary: sample.beatSecondary,
            beatDistribution: sample.beatDistribution,
            referenceArticles: sample.referenceArticles,
          }
        : { beatPrimary: "IT·스타트업", outletCategory: "it" },
      label: sample ? `${sample.code} · ${sample.outlet}` : "예시 기자 · IT 전문지",
      isSample: !sample,
    };
  }, [data?.pressRelease, matches, myProfile?.profile]);

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
    return <SkeletonCard lines={5} />;
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
      // 발송·예약·초안 생성 실패를 전부 받는 자리다 — 저장소에서 오류 노출도가 가장 높다.
      setSendError(toUserMessage(e));
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

        {/* 매칭은 상한이 있어 그 위는 보이지 않는다 — 매처가 놓친 기자를 직접 고를 수 있어야 한다. */}
        {beyond && beyond.total > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-surface/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <b className="font-semibold">전체 기자 {beyond.total}명</b>
                <span className="text-foreground-muted"> · 매칭에 없는 기자를 추천순으로 봅니다</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="subtle"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "접기" : "전체 기자 보기"}
              </Button>
            </div>

            {showAll && (
              <>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-foreground-muted">
                        <th className="pb-2 pr-3 font-medium">기자</th>
                        <th className="pb-2 pr-3 font-medium">매체</th>
                        <th className="hidden pb-2 pr-3 font-medium md:table-cell">beat</th>
                        <th className="pb-2 pr-3 font-medium">적합도</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {beyond.journalists.map((j) => (
                        <tr key={j.journalistId} className="border-b border-border/50">
                          <td className="py-2 pr-3 font-semibold tabular-nums">{j.code}</td>
                          <td className="py-2 pr-3">{j.outlet}</td>
                          <td className="hidden py-2 pr-3 text-xs text-foreground-muted md:table-cell">
                            {j.beatPrimary}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {j.score > 0 ? (
                              j.score
                            ) : (
                              <span className="text-muted">주제 무관</span>
                            )}
                          </td>
                          <td className="py-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="subtle"
                              onClick={() =>
                                void addToMatches({
                                  campaignId: id,
                                  journalistId: j.journalistId,
                                })
                              }
                            >
                              후보 추가
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {beyond.lockedCount > 0 && (
                  <p className="mt-3 text-xs text-foreground-muted">
                    {beyond.lockedCount}명이 더 있습니다 — 무료 플랜은 {beyond.journalists.length}명까지
                    표시됩니다.{" "}
                    <Link href="/settings" className="underline underline-offset-2">
                      Solo 이상으로 바꾸면
                    </Link>{" "}
                    전체가 보입니다.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </StepSection>

      {/* ③ 개인화 메일 초안 */}
      <StepSection icon={PenLine} step="③" title="개인화 메일 초안" desc="기자별 최근 기사를 언급한 서로 다른 메일. 무작위 대량발송이 아닙니다.">
        <TemplatePicker
          value={templateChoice}
          onChange={setTemplateChoice}
          customTemplates={customTemplates ?? []}
          preview={previewContext}
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
            icon={PenLine}
            loading={busy === "gen"}
            disabled={includedCount === 0}
          >
            {busy === "gen" ? "생성 중…" : "개인화 메일 초안 생성"}
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
              icon={Wand2}
              loading={busy === "ai"}
            >
              {busy === "ai" ? "AI 다듬는 중…" : "내 AI로 다듬기"}
            </Button>
          )}
          {drafts && drafts.length > 0 && !aiLoading && !aiConnected && (
            <Link
              href="/ai"
              className={buttonClasses({ variant: "ghost" })}
              title="내 AI에서 본인 GPT·Claude·Gemini API 키를 등록하면 초안을 AI로 개인화할 수 있습니다."
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" /> AI 연결하고 다듬기
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
              {similarity?.status === "warn" &&
                similarity.notes.map((n) => (
                  <li key={n} className="text-warning">· {n}</li>
                ))}
            </ul>

            {pilotBlocked && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
                <p className="font-semibold text-warning">초안을 아직 한 건도 확인하지 않았습니다.</p>
                <p className="mt-1 text-foreground-muted">
                  위 초안 목록에서 하나를 펼쳐 내용을 읽고 <b>‘이 초안 확인함’</b>을 누르면 발송이 열립니다.
                  규칙 검사는 표현·수치·구조만 봅니다. 톤이 맞는지는 사람만 판정할 수 있습니다.
                </p>
              </div>
            )}

            {!senderLoading && !senderConnected && (
              <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm">
                <p className="font-semibold text-danger">발신 수단이 연결되지 않았습니다 — 메일이 나가지 않습니다.</p>
                <p className="mt-1 text-foreground-muted">
                  지금 발송하면 <b>메일은 한 통도 보내지지 않고</b> 초안만 ‘발송됨’으로 기록됩니다. 기록된
                  초안은 감사 추적을 위해 다시 생성할 수 없으니, 먼저 발신 수단을 연결하세요.
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Link href="/settings" className={buttonClasses({ size: "sm" })}>
                    발신 수단 연결하기
                  </Link>
                  <span className="text-xs text-muted">Gmail 1클릭 또는 SMTP(회사 메일)</span>
                </div>
                <label className="mt-3 flex items-start gap-2 text-xs text-foreground-muted">
                  <input
                    type="checkbox"
                    checked={recordOnlyConfirmed}
                    onChange={(e) => setRecordOnlyConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  <span>
                    이미 크랩피치 밖에서 직접 보냈습니다. <b>발송 없이 기록만</b> 남기는 것에 동의합니다.
                  </span>
                </label>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={optOutConfirmed}
                onChange={(e) => setOptOutConfirmed(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              수신자·수신거부 문구를 확인했으며, 발송으로 기록하는 데 동의합니다.
            </label>

            {/*
              발송·예약·초안 생성 실패를 전부 받는 자리다 — 저장소에서 오류 노출도가 가장 높다.
              성공 문구(`sendNote`)만 낭독되고 여기가 침묵하면, 스크린리더 사용자는 발송이
              성공한 경우에만 결과를 듣게 된다. 실패는 assertive로 끊고 알린다.
            */}
            <p role="alert" className="sr-only">
              {sendError ?? ""}
            </p>
            {sendError && (
              <p
                aria-hidden="true"
                className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {sendError}
              </p>
            )}

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

            {/*
              예약 시각을 입력해도 숨기지 않는다. 예약이 수단을 무시하던 동안에는 무해했지만,
              이제 예약이 이 선택을 그대로 쓴다 — 숨기면 두 수단을 모두 연결한 사용자가
              예약 실발송에 도달할 방법이 없다.
            */}
            {bothConnected && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-foreground">
                  {scheduleLocal ? "예약 시각에 실행할 방법" : "발송 방법"}
                </span>
                {(
                  [
                    ["gmail", "Gmail 초안 (검토 후 발송)"],
                    ["smtp", `${smtp!.email} 로 즉시 발송`],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSendMode(mode)}
                    className={
                      effectiveSendMode === mode
                        ? "rounded-full border border-brand bg-brand-soft px-3 py-1 font-semibold text-brand"
                        : "rounded-full border border-border px-3 py-1 text-muted"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() =>
                  wrap("send", async () => {
                    if (scheduleLocal) {
                      const at = new Date(scheduleLocal).getTime();
                      if (Number.isNaN(at)) throw new Error("예약 시각이 올바르지 않습니다.");
                      // 예약 시점에 수단을 **확정해서** 넘긴다. 실행 시점에는 사용자가
                      // 없으므로 그때 추론하면 동의하지 않은 수단으로 나갈 수 있다.
                      if (scheduledSendMode === "smtp") {
                        // 예약된 실발송도 되돌릴 수 없다 — 즉시 발송과 같은 확인을 받는다.
                        // 오히려 사용자가 자리에 없을 때 나가므로 더 분명히 알려야 한다.
                        const ok = await confirm({
                          title: "예약 발송을 확정할까요?",
                          description: `${new Date(at).toLocaleString("ko-KR")}에 ${smtp!.email} 에서 기자에게 메일이 실제로 나갑니다. 되돌릴 수 없습니다.`,
                          confirmLabel: "예약",
                          variant: "danger",
                        });
                        if (!ok) return;
                      }
                      const result = await scheduleCampaign({
                        campaignId: id,
                        scheduledSendAt: at,
                        sendMode: scheduledSendMode,
                      });
                      setSendNote(
                        `${result.count}통 예약됨 · ${new Date(result.scheduledSendAt).toLocaleString("ko-KR")} · ${SEND_MODE_LABELS[result.sendMode]}`,
                      );
                      return;
                    }
                    if (effectiveSendMode === "smtp") {
                      // 되돌릴 수 없는 발송이다 — 누른 뒤 물어볼 수 없으므로 지금 확인한다.
                      const ok = await confirm({
                        title: "지금 발송할까요?",
                        description: `${smtp!.email} 에서 기자에게 메일이 즉시 나갑니다. 되돌릴 수 없습니다.`,
                        confirmLabel: "발송",
                        variant: "danger",
                      });
                      if (!ok) return;
                      const result = await sendSmtp({ campaignId: id });
                      if (result.message) setSendNote(result.message);
                    } else if (effectiveSendMode === "gmail") {
                      const result = await pushGmail({ campaignId: id });
                      if (result.message) setSendNote(result.message);
                    } else {
                      // 발신 수단 미연결 — 메일은 나가지 않는다. 서버도 명시적 동의를 요구한다.
                      await sendCampaign({ campaignId: id, recordOnly: true });
                    }
                  })
                }
                icon={Send}
                loading={busy === "send"}
                disabled={
                  !optOutConfirmed ||
                  !drafts ||
                  drafts.length === 0 ||
                  pilotBlocked ||
                  senderLoading ||
                  recordOnlyBlocked
                }
              >
                {busy === "send"
                  ? "처리 중…"
                  : pilotBlocked
                    ? "초안 확인 필요"
                    : recordOnlyBlocked
                      ? "발신 수단 연결 필요"
                      : scheduleLocal
                        ? "예약 발송 (승인)"
                        : effectiveSendMode === "smtp"
                          ? "메일 발송 (승인)"
                          : effectiveSendMode === "gmail"
                            ? "Gmail 초안 생성 (승인)"
                            : "발송 없이 기록만 (승인)"}
              </Button>
              <span className="text-xs text-muted">
                {senderLoading
                  ? "* 발신 수단을 확인하고 있습니다…"
                  : !senderConnected
                    ? "* 메일은 나가지 않습니다. 위에서 발신 수단을 연결하세요."
                    : scheduleLocal
                      ? scheduledSendMode === "smtp"
                        ? `* 예약 시각에 ${smtp!.email} 에서 기자에게 메일이 실제로 나갑니다. 되돌릴 수 없습니다.`
                        : `* 예약 시각에 Gmail(${gmail!.email})의 ‘언론홍보’ 라벨에 초안을 만듭니다. 실발송은 Gmail에서 확인 후.`
                      : effectiveSendMode === "smtp"
                        ? `* ${smtp!.email} 에서 기자에게 메일이 즉시 나갑니다. 되돌릴 수 없습니다.`
                        : `* 연결된 Gmail(${gmail!.email})의 ‘언론홍보’ 라벨에 초안을 만듭니다. 실발송은 Gmail에서 확인 후.`}
              </span>
            </div>
            {/*
              발송·예약 결과는 화면에 남아야 하는 정보라 Toast로 옮기지 않았다(PR#1 판단).
              대신 라이브 리전으로 낭독되게 한다.

              ⚠️ 항상 마운트 + `sr-only`. 조건부 렌더는 스크린리더가 변화를 놓치고,
                 `display:none`으로 감춘 라이브 리전은 내용이 들어와도 낭독되지 않는다.
                 `sr-only`는 `position:absolute`라 부모의 `space-y-4`도 건드리지 않는다.
            */}
            <p role="status" className="sr-only">
              {sendNote ?? ""}
            </p>
            {sendNote && (
              <p aria-hidden="true" className="text-xs text-muted">
                {sendNote}
              </p>
            )}
            {campaign.scheduledSendAt && campaign.status === "sending" && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-brand">
                  예약됨 · {new Date(campaign.scheduledSendAt).toLocaleString("ko-KR")}
                  {campaign.sendMode ? ` · ${SEND_MODE_LABELS[campaign.sendMode]}` : ""}
                </p>
                {/* 실발송 예약을 되돌릴 수단이 없으면 사용자는 시각이 지나기를 기다릴 수밖에 없다. */}
                <Button
                  type="button"
                  size="sm"
                  variant="subtle"
                  loading={busy === "cancel"}
                  onClick={() =>
                    wrap("cancel", async () => {
                      const result = await cancelSchedule({ campaignId: id });
                      setSendNote(`예약을 취소했습니다 (${result.cancelled}건이 초안으로 돌아갔습니다).`);
                    })
                  }
                >
                  {busy === "cancel" ? "취소 중…" : "예약 취소"}
                </Button>
              </div>
            )}
            {/*
              예약 실행은 사용자가 화면에 없을 때 일어난다 — 실패를 여기서 보여 주지 않으면
              캠페인이 '예약됨'에 멈춘 이유를 아무도 알 수 없다.
            */}
            {campaign.lastSendError && (
              <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm">
                <p className="font-semibold text-danger">예약 발송이 실패했습니다.</p>
                <p className="mt-1 text-foreground-muted">{campaign.lastSendError}</p>
                <p className="mt-1 text-xs text-muted">
                  {campaign.status === "sending" && campaign.scheduledSendAt
                    ? "예약이 아직 살아 있어 자동으로 다시 시도됩니다. 먼저 원인을 고치거나 예약을 취소하세요."
                    : "예약은 해제됐습니다. 초안은 그대로 남아 있으니 원인을 고친 뒤 다시 예약하거나 즉시 발송하세요."}
                </p>
              </div>
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
    approvedAt?: number;
  };
}) {
  const [open, setOpen] = useState(false);
  const approveDraft = useMutation(api.drafts.approveDraft);
  const [approving, setApproving] = useState(false);
  const hasOptOut = hasUsableOptOut(draft.body);
  const level = draft.complianceLevel;
  const notes = draft.complianceNotes ?? [];
  // "blocked"는 쿨다운 등으로 이번 회차에 나가지 않은 초안(삭제하지 않고 사유만 남긴다).
  const blocking = level === "fail" || level === "blocked";
  const approved = draft.approvedAt !== undefined;
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
          {approved && (
            <Badge variant="success">
              <Check className="h-3 w-3" /> 확인함
            </Badge>
          )}
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
        <>
          <pre className="whitespace-pre-wrap border-t border-border bg-surface/50 px-4 py-3 text-sm leading-relaxed text-foreground-muted">
            {draft.body}
          </pre>
          {draft.status !== "sent" && draft.status !== "published" && (
            <div className="flex items-center gap-3 border-t border-border px-4 py-2.5">
              <Button
                variant={approved ? "ghost" : "subtle"}
                onClick={() => {
                  setApproving(true);
                  approveDraft({ draftId: draft._id as Id<"emailDrafts"> }).finally(() =>
                    setApproving(false),
                  );
                }}
                disabled={approved || approving}
              >
                <Check className="h-4 w-4" />{" "}
                {approved ? "확인 완료" : approving ? "기록 중…" : "이 초안 확인함"}
              </Button>
              <span className="text-xs text-muted">
                {approved
                  ? `${new Date(draft.approvedAt!).toLocaleString("ko-KR")} 확인`
                  : "캠페인 전체 발송 전 최소 1건은 실제로 읽고 확인해야 합니다."}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 새 템플릿의 기본 골격.
 *
 * ⚠️ 행동 요청은 반드시 `{{매체CTA}}`로 둔다. 직접 문장을 쓰면("추가 자료나 대표 인터뷰가
 *    필요하시면…") 컴플라이언스 게이트의 ASK_PATTERNS가 자료·인터뷰를 **각각** 세어
 *    'CTA 중복' 경고를 만든다. 아무것도 고치지 않은 새 템플릿이 스스로 경고를 띄우면
 *    사용자는 자기가 뭘 잘못했는지 찾게 된다.
 *    `{{매체CTA}}`는 매체 유형에 맞는 요청 1개로 치환되므로 규칙 위반이 원천 차단된다.
 */
const CUSTOM_BODY_SCAFFOLD = `{{후킹}}

{{회사명}}은(는) {{헤드라인}}. {{핵심수치}}

{{인용문}}

{{자료링크}}

{{매체CTA}}

{{발신자}} 드림
{{연락처}}`;

/** 예약 결과 안내 — 무엇이 일어날지 사용자가 알아야 한다. */
const SEND_MODE_LABELS: Record<"smtp" | "gmail_drafts" | "record_only", string> = {
  smtp: "기자에게 실제 발송",
  gmail_drafts: "Gmail 초안 생성",
  record_only: "발송 없이 기록만",
};

interface TemplatePreviewContext {
  email: EmailContext;
  journalist: JournalistContext;
  label: string;
  isSample: boolean;
}

/** 메일 초안 템플릿 선택 + 커스텀 템플릿 편집. */
function TemplatePicker({
  value,
  onChange,
  customTemplates,
  preview,
}: {
  value: string;
  onChange: (v: string) => void;
  customTemplates: { _id: string; name: string; subject: string; body: string }[];
  /** 미리보기용 컨텍스트. 보도자료가 없으면 null(미리보기 숨김). */
  preview: TemplatePreviewContext | null;
}) {
  const confirm = useConfirm();
  const saveTemplate = useMutation(api.emailTemplates.save);
  const removeTemplate = useMutation(api.emailTemplates.remove);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 자리표시자를 커서 위치에 넣는다.
   *
   * 손으로 `{{...}}`를 타이핑하면 오타가 생기고, 렌더러는 모르는 키를 원문 그대로 남기므로
   * 오타가 기자에게 나가는 본문에 리터럴로 실린다. 버튼 삽입이 그 경로를 없앤다.
   */
  function insertPlaceholder(key: string) {
    const token = `{{${key}}}`;
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => `${b}${token}`);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? start;
    setBody(`${body.slice(0, start)}${token}${body.slice(end)}`);
    // 연속 삽입이 자연스럽도록 커서를 토큰 뒤로 옮긴다(상태 반영 후여야 한다).
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const selectedCustom = value.startsWith("custom:")
    ? customTemplates.find((t) => `custom:${t._id}` === value) ?? null
    : null;

  /**
   * 실시간 미리보기 + 규정 검사.
   *
   * `renderCustomTemplate`·`checkEmailCompliance`는 의존성 없는 순수 함수라 서버 왕복 없이
   * 브라우저에서 그대로 돌린다. 디바운스도 필요 없다(문자열 치환 1패스 + 정규식 몇 개).
   * 저장 전에 결과를 볼 수 없어서 사용자가 13개 자리표시자 문법을 머릿속으로
   * 시뮬레이션해야 했던 것이 이 편집기의 가장 큰 문제였다.
   */
  const rendered = useMemo(() => {
    if (!preview || !editorOpen) return null;
    const unknown = findUnknownPlaceholders(subject, body);
    try {
      const out = renderCustomTemplate(subject, body, preview.email, preview.journalist);
      return {
        ...out,
        unknown,
        compliance: checkEmailCompliance(out.subject, out.body),
        chars: out.body.replace(/\s/g, "").length,
      };
    } catch {
      // 렌더러가 던질 경로는 없지만, 편집 중 입력으로 화면이 통째로 죽는 것만은 막는다.
      return null;
    }
  }, [preview, editorOpen, subject, body]);

  /**
   * 오타 자리표시자가 있으면 저장을 막는다.
   *
   * `rendered`는 미리보기 컨텍스트가 없으면 null이므로 검사도 따로 계산한다 —
   * 보도자료가 없다고 해서 오타 검증을 건너뛰면 안 된다.
   */
  const hasUnknown = findUnknownPlaceholders(subject, body).length > 0;

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
      setNote(toUserMessage(e, "저장에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(tplId: string) {
    const ok = await confirm({
      title: "이 템플릿을 삭제할까요?",
      description: "되돌릴 수 없습니다. 이 템플릿으로 만든 기존 초안은 그대로 남습니다.",
      confirmLabel: "삭제",
      variant: "danger",
    });
    if (!ok) return;
    setNote(null);
    try {
      await removeTemplate({ id: tplId as Id<"userEmailTemplates"> });
      if (value === `custom:${tplId}`) onChange("standard");
    } catch (e) {
      setNote(toUserMessage(e));
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
                aria-invalid={hasUnknown || undefined}
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {/* 왼쪽: 편집 */}
            <div>
              <Label htmlFor="tpl-body">본문 템플릿</Label>
              <Textarea
                id="tpl-body"
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                className="font-mono text-xs"
                aria-invalid={hasUnknown || undefined}
                aria-describedby="tpl-placeholder-help"
              />
              <p id="tpl-placeholder-help" className="mt-1.5 text-xs text-muted">
                아래를 눌러 넣으세요 — 직접 타이핑하면 오타가 그대로 메일에 실립니다.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {TEMPLATE_PLACEHOLDERS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    title={p.description}
                    onClick={() => insertPlaceholder(p.key)}
                    className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground-muted hover:border-brand hover:text-brand"
                  >
                    {`{{${p.key}}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* 오른쪽: 실시간 미리보기 */}
            <div>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1">
                <span className="text-sm font-semibold">미리보기</span>
                {preview && (
                  <span className="text-xs text-muted">
                    {preview.label}
                    {preview.isSample && " (매칭 후 실제 기자로 바뀝니다)"}
                  </span>
                )}
              </div>
              {!rendered ? (
                <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
                  보도자료를 불러오면 실제 발송될 문장을 여기서 바로 보여 드립니다.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="text-[11px] font-semibold text-muted">제목</p>
                    <p className="text-sm font-semibold">{rendered.subject}</p>
                  </div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card px-3 py-2 text-xs leading-relaxed">
                    {rendered.body}
                  </pre>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {hasUsableOptOut(rendered.body) ? (
                      <Badge variant="success">수신거부 포함</Badge>
                    ) : (
                      <Badge variant="danger">수신거부 없음</Badge>
                    )}
                    <Badge
                      variant={
                        rendered.compliance.status === "pass"
                          ? "success"
                          : rendered.compliance.status === "warn"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {rendered.compliance.status === "pass"
                        ? "규정 통과"
                        : rendered.compliance.status === "warn"
                          ? "확인 필요"
                          : "발송 차단"}
                    </Badge>
                    <span className="text-muted">
                      공백 제외 {rendered.chars}자 (최대 {EMAIL_BODY_CHAR_MAX}자)
                    </span>
                  </div>
                  {rendered.unknown.length > 0 && (
                    <p className="rounded-md bg-danger/10 px-2.5 py-2 text-xs text-danger">
                      지원하지 않는 자리표시자{" "}
                      <b>{rendered.unknown.map((k) => `{{${k}}}`).join(", ")}</b> — 치환되지 않고
                      그대로 발송됩니다. 위 버튼에서 골라 넣으세요.
                    </p>
                  )}
                  {rendered.compliance.violations.length > 0 && (
                    <ul className="space-y-1 text-xs text-foreground-muted">
                      {rendered.compliance.violations.map((v, i) => (
                        <li key={`${v.label}-${i}`}>
                          · <b>{v.label}</b>
                          {v.suggestion ? ` — ${v.suggestion}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {note && <p className="text-xs text-danger">{note}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !body.trim() || hasUnknown}
              onClick={onSave}
            >
              {busy ? "저장 중…" : editingId ? "수정 저장" : "템플릿 저장"}
            </Button>
            <Button type="button" size="sm" variant="subtle" onClick={() => setEditorOpen(false)}>
              닫기
            </Button>
            {hasUnknown && (
              <span className="text-xs text-danger">
                자리표시자 오타를 고치면 저장할 수 있습니다.
              </span>
            )}
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
      setVariantError(toUserMessage(e, "템플릿 적용에 실패했습니다."));
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
      <p role="alert" className="sr-only">
        {variantError ?? ""}
      </p>
      {variantError && (
        <p aria-hidden="true" className="mt-1 text-xs text-danger">
          {variantError}
        </p>
      )}
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
                        setVariantError(toUserMessage(e, "정정 요청에 실패했습니다."));
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
                  setVariantError(toUserMessage(e, "저장에 실패했습니다."));
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
      setNote(toUserMessage(e, "팔로업 초안 생성에 실패했습니다."));
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
