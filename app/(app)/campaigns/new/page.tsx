"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { PressLintResult, PressViolation } from "@/convex/lib/pressLint";
import {
  parsePressGeoFields,
  SUBHEAD_HINT,
  SUBHEAD_MAX,
  type PressFaqItem,
} from "@/convex/lib/anthropicEnhance";
import { GEO_TARGETS } from "@/convex/lib/pressGuide";
import { FileText, ListChecks, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/app/bits";
import { ByoAiConnectPanel } from "@/components/app/ByoAiConnect";

/**
 * severity → 배지. 1차 정책은 warn-only라 색만 나누고 표현은 "확인" 계열로 통일한다.
 * (차단 문구를 쓰지 않는다 — 저장·매칭은 어떤 결과에서도 그대로 진행된다.)
 */
const SEVERITY_BADGE: Record<
  PressViolation["severity"],
  { variant: React.ComponentProps<typeof Badge>["variant"]; label: string }
> = {
  critical: { variant: "danger", label: "먼저 확인" },
  high: { variant: "warning", label: "확인 권장" },
  medium: { variant: "outline", label: "참고" },
};

/** 줄바꿈 입력 → 배열. 빈 줄은 버린다. */
function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export default function NewCampaignPage() {
  const router = useRouter();
  const createPR = useMutation(api.pressReleases.create);
  const createCampaign = useMutation(api.campaigns.create);
  const polish = useAction(api.aiActions.polishPressRelease);
  const aiStatus = useQuery(api.aiKeys.status);
  const mediaKits = useQuery(api.mediaKits.list);

  const [form, setForm] = useState({
    who: "",
    headline: "",
    subheads: "",
    keyTakeaways: "",
    body: "",
    numbers: "",
    quote: "",
    topicTags: "",
    links: "",
    boilerplate: "",
  });
  /** GEO 하단 Q&A — 문항 수를 강제하지 않는다(팩에 규정 없음). 사용자가 직접 추가·삭제한다. */
  const [faq, setFaq] = useState<PressFaqItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kitId, setKitId] = useState<string>("");
  const [kitNote, setKitNote] = useState<string | null>(null);
  const [lint, setLint] = useState<PressLintResult | null>(null);
  /** 점검이 돌던 시점의 제목·본문 — 이후 수정되면 결과가 낡았음을 알린다. */
  const [lintedText, setLintedText] = useState<string>("");

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function setFaqField(i: number, k: keyof PressFaqItem, v: string) {
    setFaq((list) => list.map((item, idx) => (idx === i ? { ...item, [k]: v } : item)));
  }

  const kits = mediaKits ?? [];
  const selectedKitId = kitId || kits[0]?._id || "";
  const selectedKit = kits.find((k) => k._id === selectedKitId);

  function loadBoilerplateFromKit() {
    const kit = selectedKit;
    if (!kit) return;
    const bp = (kit.boilerplate ?? "").trim();
    if (!bp) {
      setKitNote(`「${kit.name}」에 회사 소개가 아직 비어 있습니다. 미디어킷에서 먼저 채워 주세요.`);
      return;
    }
    set("boilerplate", bp);
    setKitNote(`「${kit.name}」의 회사 소개를 불러왔습니다.`);
  }

  async function onPolish() {
    setError(null);
    setPolishing(true);
    setNote(null);
    try {
      const tags = form.topicTags
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const result = await polish({
        title: form.headline || `${form.who} 보도자료`,
        topicTags: tags.length ? tags : ["IT·스타트업"],
        who: form.who || undefined,
        numbers: form.numbers || undefined,
        quote: form.quote || undefined,
        bodyHint: form.body || undefined,
        newsValue: form.headline || undefined,
        boilerplate: form.boilerplate || undefined,
        // 선택한 미디어킷의 팩트시트를 대조 기준으로 넘긴다 — 본문에 없던 숫자가
        // 생겨나면 lint가 잡는다. 프롬프트에는 들어가지 않고 검사에만 쓰인다.
        factSheet: selectedKit?.factSheet?.length
          ? selectedKit.factSheet.map((f) => ({ label: f.label, value: f.value }))
          : undefined,
      });
      // skipped/error 폴백은 입력값 그대로라 폼을 덮어쓰지 않는다.
      if (result.mode !== "skipped" && result.mode !== "error") {
        // GEO 필드는 응답 페이로드에서 방어적으로 읽는다 — 모델이 빼먹으면 사용자가 쓰던 값을 그대로 둔다.
        const geo = parsePressGeoFields(result);
        setForm((f) => ({
          ...f,
          headline: result.headlines[0] ?? result.title,
          body: result.body,
          subheads: geo.subheads ? geo.subheads.join("\n") : f.subheads,
          keyTakeaways: geo.keyTakeaways ? geo.keyTakeaways.join("\n") : f.keyTakeaways,
        }));
        if (geo.faq) setFaq(geo.faq);
        setLintedText(`${result.headlines[0] ?? result.title}\n${result.body}`);
      } else {
        setLintedText(`${form.headline}\n${form.body}`);
      }
      // AI 미연결이어도 규칙 점검 결과는 온다 — 실패가 아니라 "점검만 돌았다"로 알린다.
      setLint(result.lint);
      setNote(
        result.mode === "skipped"
          ? "문구 점검만 실행했습니다. AI 다듬기는 「내 AI」에서 키를 연결하면 함께 실행됩니다."
          : (result.message ?? null),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 다듬기에 실패했습니다.");
    } finally {
      setPolishing(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tags = form.topicTags
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const links = form.links
        .split(/[\n,]+/)
        .map((l) => l.trim())
        .filter(Boolean);
      const title = form.headline || `${form.who} 보도자료`;
      // GEO 필드는 비어 있으면 아예 넘기지 않는다 — 기존처럼 필드 없는 레코드가 만들어진다.
      const keyTakeaways = lines(form.keyTakeaways).slice(0, GEO_TARGETS.keyTakeaways);
      const subheads = lines(form.subheads).slice(0, SUBHEAD_MAX);
      const faqItems = faq
        .map((f) => ({ q: f.q.trim(), a: f.a.trim() }))
        .filter((f) => f.q && f.a);
      const prId = await createPR({
        title,
        headlines: [form.headline, form.numbers ? `${form.headline} — 수치` : title, `${title} — 업계`].filter(
          Boolean,
        ) as string[],
        body: form.body,
        topicTags: tags.length ? tags : ["IT·스타트업"],
        who: form.who || undefined,
        numbers: form.numbers || undefined,
        quote: form.quote || undefined,
        links: links.length ? links : undefined,
        keyTakeaways: keyTakeaways.length ? keyTakeaways : undefined,
        subheads: subheads.length ? subheads : undefined,
        faq: faqItems.length ? faqItems : undefined,
      });
      const campaignId = await createCampaign({ pressReleaseId: prId });
      router.push(`/campaigns/${campaignId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성에 실패했습니다.");
      setLoading(false);
    }
  }

  const topicList = form.topicTags
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const takeawayList = lines(form.keyTakeaways);
  const subheadList = lines(form.subheads);

  const lintStale = lint !== null && lintedText !== `${form.headline}\n${form.body}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="새 보도자료 배포"
        description="본인 ChatGPT·Claude·Gemini 스킬로 보도문을 다듬거나, 아래 폼에 직접 입력한 뒤 기자 매칭으로 이어갑니다."
      />

      <ByoAiConnectPanel
        skill="press-release-writer"
        who={form.who}
        headline={form.headline}
        bodyHint={form.body}
        topicTags={topicList}
        compact
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="who">주체 (회사/브랜드)</Label>
                <Input id="who" value={form.who} onChange={(e) => set("who", e.target.value)} placeholder="예) 큐레잇" />
              </div>
              <div>
                <Label htmlFor="topicTags">주제 태그 (쉼표)</Label>
                <Input
                  id="topicTags"
                  value={form.topicTags}
                  onChange={(e) => set("topicTags", e.target.value)}
                  placeholder="예) IT·스타트업, 벤처투자, SaaS"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="headline">헤드라인 (핵심 한 줄)</Label>
              <Input
                id="headline"
                value={form.headline}
                onChange={(e) => set("headline", e.target.value)}
                placeholder='예) 매출관리 AI "큐레잇", 시드 10억 유치'
                required
              />
            </div>

            <div>
              <Label htmlFor="subheads">부제 (한 줄에 하나)</Label>
              <Textarea
                id="subheads"
                value={form.subheads}
                onChange={(e) => set("subheads", e.target.value)}
                rows={2}
                placeholder={"예) 정산 소요 시간 4시간 → 20분\n예) 도입 매장 3개월 만에 1만 곳"}
              />
              <p className="mt-1 text-xs text-muted">
                제목을 보완하는 보조 포인트입니다({SUBHEAD_HINT}). 위에서부터 {SUBHEAD_MAX}개까지 저장합니다
                {subheadList.length > SUBHEAD_MAX ? ` — 지금 ${subheadList.length}줄이라 뒤쪽은 빠집니다.` : "."}
              </p>
            </div>

            <div>
              <Label htmlFor="keyTakeaways">{GEO_TARGETS.keyTakeaways}줄 요약 (한 줄에 하나)</Label>
              <Textarea
                id="keyTakeaways"
                value={form.keyTakeaways}
                onChange={(e) => set("keyTakeaways", e.target.value)}
                rows={3}
                placeholder={"예) 큐레잇이 시드 10억 원을 유치했다.\n예) 정산 처리 시간을 4시간에서 20분으로 줄였다.\n예) 연내 도입 매장 2만 곳을 목표로 한다."}
              />
              <p className="mt-1 text-xs text-muted">
                보도자료 최상단에 붙는 요약입니다. 수치를 함께 적으면 생성형 AI 검색이 인용하기 좋습니다. 위에서부터{" "}
                {GEO_TARGETS.keyTakeaways}줄까지 저장합니다
                {takeawayList.length > GEO_TARGETS.keyTakeaways
                  ? ` — 지금 ${takeawayList.length}줄이라 뒤쪽은 빠집니다.`
                  : "."}
              </p>
            </div>

            <div>
              <Label htmlFor="numbers">숫자 근거</Label>
              <Input
                id="numbers"
                value={form.numbers}
                onChange={(e) => set("numbers", e.target.value)}
                placeholder="예) 시드 10억 원, 3개월 만에 1만 매장, 정산 4시간→20분"
              />
            </div>

            <div>
              <Label htmlFor="body">본문</Label>
              <Textarea
                id="body"
                value={form.body}
                onChange={(e) => set("body", e.target.value)}
                rows={5}
                placeholder="300~500자 표준 보도자료 본문. 첫 문단에 5W1H, 다음에 근거·인용."
                required
              />
            </div>

            <div>
              <Label htmlFor="quote">대표 인용문</Label>
              <Input
                id="quote"
                value={form.quote}
                onChange={(e) => set("quote", e.target.value)}
                placeholder="바로 인용 가능한 구체적 코멘트"
              />
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
                <Label className="mb-0">하단 Q&amp;A (FAQ)</Label>
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  onClick={() => setFaq((list) => [...list, { q: "", a: "" }])}
                >
                  <Plus className="h-3.5 w-3.5" /> 문항 추가
                </Button>
              </div>
              {faq.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted">
                  본문 아래에 붙는 Q&amp;A입니다. 생성형 AI가 답변을 만들 때 그대로 인용하기 좋은 형태라, 기자가 실제로
                  물을 질문만 담으면 됩니다. 문항 수 제한은 없습니다.
                </p>
              ) : (
                <ul className="space-y-3">
                  {faq.map((item, i) => (
                    <li key={i} className="space-y-2 rounded-md border border-border bg-surface/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">Q{i + 1}</span>
                        <button
                          type="button"
                          onClick={() => setFaq((list) => list.filter((_, idx) => idx !== i))}
                          className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> 삭제
                        </button>
                      </div>
                      <Input
                        aria-label={`FAQ ${i + 1} 질문`}
                        value={item.q}
                        onChange={(e) => setFaqField(i, "q", e.target.value)}
                        placeholder="예) 기존 정산 방식과 무엇이 다른가?"
                      />
                      <Textarea
                        aria-label={`FAQ ${i + 1} 답변`}
                        value={item.a}
                        onChange={(e) => setFaqField(i, "a", e.target.value)}
                        rows={2}
                        placeholder="본문에 있는 사실로만 답합니다. 수치를 쓰면 기준·출처를 함께 적습니다."
                      />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-muted">
                질문과 답변이 모두 채워진 문항만 저장됩니다.
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
                <Label htmlFor="boilerplate" className="mb-0">
                  회사 소개 (보일러플레이트)
                </Label>
                {mediaKits === undefined ? null : kits.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="미디어킷 선택"
                      value={selectedKitId}
                      onChange={(e) => setKitId(e.target.value)}
                      className="h-9 rounded-md border border-input bg-card px-2 text-xs text-foreground"
                    >
                      {kits.map((k) => (
                        <option key={k._id} value={k._id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="subtle" size="sm" onClick={loadBoilerplateFromKit}>
                      <FileText className="h-3.5 w-3.5" /> 미디어킷에서 불러오기
                    </Button>
                  </div>
                ) : (
                  <Link href="/media-kit" className="text-xs font-semibold text-brand hover:underline">
                    미디어킷에서 회사 소개 만들기
                  </Link>
                )}
              </div>
              <Textarea
                id="boilerplate"
                value={form.boilerplate}
                onChange={(e) => set("boilerplate", e.target.value)}
                rows={2}
                placeholder="○○는 …하는 회사로, 2024년 설립되어 …"
              />
              <p className="mt-1 text-xs text-muted">
                보도자료 하단 회사 소개입니다. AI 다듬기에 함께 전달돼 미디어킷과 같은 문장을 유지합니다.
              </p>
              {kitNote && <p className="mt-1 text-xs text-muted">{kitNote}</p>}
            </div>

            <div>
              <Label htmlFor="links">자료 링크 (줄바꿈)</Label>
              <Textarea
                id="links"
                value={form.links}
                onChange={(e) => set("links", e.target.value)}
                rows={2}
                placeholder="보도자료 원문·이미지·미디어킷 링크"
              />
            </div>

            {note && <p className="text-xs text-muted">{note}</p>}

            {lint && <LintPanel lint={lint} stale={lintStale} />}

            {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button type="button" variant="subtle" onClick={() => router.back()}>
                취소
              </Button>
              {aiStatus?.activeProvider ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={polishing || !form.headline}
                  onClick={onPolish}
                  title="내 AI에 연결한 GPT·Claude·Gemini로 웹에서 바로 다듬습니다."
                >
                  <Wand2 className="h-4 w-4" />
                  {polishing ? "AI 다듬는 중…" : "AI로 다듬기"}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={polishing || !form.headline}
                    onClick={onPolish}
                    title="AI 없이도 도는 문구 규칙 점검입니다. 결과는 경고만 표시합니다."
                  >
                    <ListChecks className="h-4 w-4" />
                    {polishing ? "점검 중…" : "문구 점검"}
                  </Button>
                  <Link href="/ai">
                    <Button
                      type="button"
                      variant="ghost"
                      title="내 AI에서 GPT·Claude·Gemini API 키를 등록하면 웹에서 바로 다듬을 수 있습니다."
                    >
                      <Wand2 className="h-4 w-4" /> AI 연결하고 다듬기
                    </Button>
                  </Link>
                </>
              )}
              <Button type="submit" disabled={loading}>
                <Sparkles className="h-4 w-4" /> {loading ? "생성 중…" : "저장하고 기자 매칭"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 문구 점검 결과 — warn-only.
 * 저장·기자 매칭을 막지 않으며, 차단 문구도 쓰지 않는다(게이트화는 2차).
 */
function LintPanel({ lint, stale }: { lint: PressLintResult; stale: boolean }) {
  const { critical, high, medium } = lint.summary;
  return (
    <div className="space-y-3 rounded-md border border-border bg-surface/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">문구 점검</span>
        {lint.violations.length === 0 ? (
          <Badge variant="success">걸린 항목 없음</Badge>
        ) : (
          <>
            {critical > 0 && <Badge variant="danger">먼저 확인 {critical}</Badge>}
            {high > 0 && <Badge variant="warning">확인 권장 {high}</Badge>}
            {medium > 0 && <Badge variant="outline">참고 {medium}</Badge>}
          </>
        )}
      </div>

      <p className="text-xs text-muted">
        규칙에 걸린 표현을 알려 줄 뿐입니다. 저장과 기자 매칭은 그대로 진행되고, 근거가 있는 표현이면 두어도 됩니다.
      </p>
      {stale && <p className="text-xs text-muted">점검 이후 문구를 고쳤습니다. 다시 점검하면 최신 결과를 볼 수 있습니다.</p>}

      {lint.violations.length > 0 && (
        <ul className="space-y-2">
          {lint.violations.map((v, i) => (
            <li key={`${v.ruleId}-${i}`} className="rounded-md border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={SEVERITY_BADGE[v.severity].variant}>{SEVERITY_BADGE[v.severity].label}</Badge>
                <span className="text-sm font-semibold text-foreground">{v.label}</span>
                <span className="text-xs text-muted">
                  {v.level} · {v.ruleId}
                </span>
              </div>
              <p className="mt-2 text-sm text-foreground-muted">“{v.span}”</p>
              <p className="mt-1 text-xs text-muted">{v.suggestion}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
