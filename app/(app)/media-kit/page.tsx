"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AlertTriangle, FileText, Plus, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Progress } from "@/components/ui/Progress";
import { PageHeader, EmptyState } from "@/components/app/bits";
import { ByoAiConnectPanel } from "@/components/app/ByoAiConnect";
// 완성도 채점은 서버(`mediaKits.update`)와 같은 순수 함수를 쓴다 — 화면은 항목별 사유까지 꺼내 쓴다.
import {
  hasPlaceholder,
  PLACEHOLDER_MARKERS,
  scoreMediaKit,
  unmetItems,
  type MediaKitCompleteness,
} from "@/convex/lib/mediaKitCompleteness";

const DEFAULT_KIT_NAME = "새 미디어킷";
/** 미확정 표기 정본 — AI가 남기면 지우지 말고 사용자가 확인해야 한다. */
const PLACEHOLDER = PLACEHOLDER_MARKERS[0];

export default function MediaKitPage() {
  const kits = useQuery(api.mediaKits.list);
  const create = useMutation(api.mediaKits.create);
  const [selected, setSelected] = useState<Id<"mediaKits"> | null>(null);

  async function newKit() {
    const id = await create({ name: DEFAULT_KIT_NAME });
    setSelected(id as Id<"mediaKits">);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="미디어킷"
        description="본인 AI 스킬로 프레스킷을 만들거나, 아래에서 섹션을 직접 채웁니다."
        action={
          <Button onClick={newKit}>
            <Plus className="h-4 w-4" /> 새 미디어킷
          </Button>
        }
      />

      <ByoAiConnectPanel skill="media-kit-builder" compact />

      {kits === undefined ? (
        <div className="h-40 animate-pulse rounded-lg border border-border bg-card" />
      ) : kits.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="미디어킷이 없습니다"
          description="보일러플레이트·핵심 메시지·팩트시트·인용문을 담아 배포 메일 첨부로 사용하세요."
          action={<Button onClick={newKit}>미디어킷 만들기</Button>}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            {kits.map((k) => (
              <button
                key={k._id}
                onClick={() => setSelected(k._id)}
                className={
                  "w-full rounded-lg border p-4 text-left transition-colors " +
                  (selected === k._id ? "border-brand bg-brand-soft/40" : "border-border bg-card hover:bg-surface")
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{k.name}</span>
                  <span className="text-xs font-bold text-brand">{k.completeness}%</span>
                </div>
                <Progress value={k.completeness} className="mt-2" />
              </button>
            ))}
          </div>
          <div>
            {selected ? (
              <MediaKitEditor id={selected} />
            ) : (
              <Card>
                <CardContent className="py-16 text-center text-sm text-muted">
                  왼쪽에서 미디어킷을 선택하세요.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 폼 ↔ 킷 변환 ───────────────────────────────────────────── */

/** `generateMediaKit`·`enhanceMediaKit`가 주고받는 7필드. */
type KitFields = {
  boilerplate: string;
  keyMessages: string[];
  factSheet: Array<{ label: string; value: string; source?: string }>;
  narrative: string;
  spokesperson: string;
  quotes: string[];
  contact: string;
};

type FormState = { name: string } & Record<
  "boilerplate" | "keyMessages" | "factSheet" | "narrative" | "spokesperson" | "quotes" | "contact",
  string
>;

const EMPTY_FORM: FormState = {
  name: "",
  boilerplate: "",
  keyMessages: "",
  factSheet: "",
  narrative: "",
  spokesperson: "",
  quotes: "",
  contact: "",
};

/** 팩트시트 한 줄의 출처 구분자 — `항목: 내용 | 출처`. 수치 항목 출처는 완성도 10점이다. */
const SOURCE_SEP = "|";

function toLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseFactSheet(text: string): KitFields["factSheet"] {
  return text
    .split("\n")
    .map((line) => {
      const [head, ...sourceParts] = line.split(SOURCE_SEP);
      const [label, ...valueParts] = head.split(":");
      const source = sourceParts.join(SOURCE_SEP).trim();
      return {
        label: label.trim(),
        value: valueParts.join(":").trim(),
        ...(source ? { source } : {}),
      };
    })
    .filter((f) => f.label && f.value);
}

function formatFactSheet(items: KitFields["factSheet"]): string {
  return items
    .map((f) => `${f.label}: ${f.value}${f.source ? ` ${SOURCE_SEP} ${f.source}` : ""}`)
    .join("\n");
}

function formToKit(form: FormState): KitFields {
  return {
    boilerplate: form.boilerplate.trim(),
    keyMessages: toLines(form.keyMessages),
    factSheet: parseFactSheet(form.factSheet),
    narrative: form.narrative.trim(),
    spokesperson: form.spokesperson.trim(),
    quotes: toLines(form.quotes),
    contact: form.contact.trim(),
  };
}

/* ── 편집기 ─────────────────────────────────────────────────── */

type Gap = { field: string; issue: string; suggestion: string };

function MediaKitEditor({ id }: { id: Id<"mediaKits"> }) {
  const kit = useQuery(api.mediaKits.get, { id });
  const update = useMutation(api.mediaKits.update);
  const aiStatus = useQuery(api.aiKeys.status);
  const generateKit = useAction(api.aiActions.generateMediaKit);
  const enhanceKit = useAction(api.aiActions.enhanceMediaKit);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saved, setSaved] = useState(false);

  // AI 입력·결과 (DB에는 쓰지 않는다 — 저장은 아래 「저장」 버튼으로 사용자가 한다)
  const [seed, setSeed] = useState({ companyName: "", industry: "", oneLiner: "", numbers: "" });
  const [aiBusy, setAiBusy] = useState<"gen" | "enh" | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);

  // 로딩 중(undefined)을 "미연결"로 단정하지 않는다.
  const aiLoading = aiStatus === undefined;
  const aiConnected = !!aiStatus?.activeProvider;

  useEffect(() => {
    if (kit) {
      setForm({
        name: kit.name,
        boilerplate: kit.boilerplate ?? "",
        keyMessages: kit.keyMessages.join("\n"),
        factSheet: formatFactSheet(kit.factSheet),
        narrative: kit.narrative ?? "",
        spokesperson: kit.spokesperson ?? "",
        quotes: kit.quotes.join("\n"),
        contact: kit.contact ?? "",
      });
      setSeed({
        companyName: kit.name === DEFAULT_KIT_NAME ? "" : kit.name,
        industry: "",
        oneLiner: "",
        numbers: "",
      });
      setGaps([]);
      setAiNote(null);
      setAiError(null);
      setSaved(false);
    }
  }, [kit?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 저장 전 입력 기준 점수 — "지금 무엇을 채우면 오르는지"를 즉시 보여 준다.
  const report = useMemo<MediaKitCompleteness>(() => scoreMediaKit(formToKit(form)), [form]);

  // AI가 남긴 미확정 표기는 지우지 않고 어디에 있는지만 알린다.
  const placeholderFields = useMemo(
    () =>
      (
        [
          ["회사 소개", form.boilerplate],
          ["핵심 메시지", form.keyMessages],
          ["팩트시트", form.factSheet],
          ["스토리", form.narrative],
          ["대표 프로필", form.spokesperson],
          ["인용문", form.quotes],
          ["언론 문의", form.contact],
        ] as const
      )
        .filter(([, value]) => hasPlaceholder(value))
        .map(([label]) => label),
    [form],
  );

  if (kit === undefined) return <div className="h-96 animate-pulse rounded-lg border border-border bg-card" />;
  if (kit === null) return <p className="text-muted">미디어킷을 찾을 수 없습니다.</p>;

  function set<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  /** AI 결과를 **폼에만** 반영한다. placeholder는 그대로 둔다. */
  function applyKit(k: KitFields) {
    setForm((f) => ({
      ...f,
      boilerplate: k.boilerplate,
      keyMessages: k.keyMessages.join("\n"),
      factSheet: formatFactSheet(k.factSheet),
      narrative: k.narrative,
      spokesperson: k.spokesperson,
      quotes: k.quotes.join("\n"),
      contact: k.contact,
    }));
    setSaved(false);
  }

  const companyName = seed.companyName.trim() || (form.name === DEFAULT_KIT_NAME ? "" : form.name.trim());

  /** `skipped`(AI 미연결)·`error`면 폼을 건드리지 않는다. */
  function accepted(mode: string, message?: string): boolean {
    if (mode === "skipped") {
      setAiError(message ?? "연결된 AI가 없습니다. 「내 AI」에서 본인 키를 등록하세요.");
      return false;
    }
    if (mode === "error") {
      setAiError(message ?? "AI 호출에 실패했습니다.");
      return false;
    }
    return true;
  }

  async function runAi(kind: "gen" | "enh") {
    if (!companyName) {
      setAiError("회사명을 입력하세요.");
      return;
    }
    setAiBusy(kind);
    setAiNote(null);
    setAiError(null);
    try {
      if (kind === "gen") {
        const res = await generateKit({
          companyName,
          industry: seed.industry.trim() || undefined,
          oneLiner: seed.oneLiner.trim() || undefined,
          numbers: seed.numbers.trim() || undefined,
          contact: form.contact.trim() || undefined,
        });
        if (!accepted(res.mode, res.message)) return;
        applyKit(res.kit);
        setGaps([]);
        setAiNote(res.message ?? "초안을 폼에 채웠습니다. 확인 후 저장하세요.");
      } else {
        const res = await enhanceKit({ companyName, kit: formToKit(form) });
        if (!accepted(res.mode, res.message)) return;
        applyKit(res.kit);
        setGaps(res.gaps);
        setAiNote(res.message ?? "보강안을 폼에 채웠습니다. 확인 후 저장하세요.");
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI 호출에 실패했습니다.");
    } finally {
      setAiBusy(null);
    }
  }

  async function save() {
    const next = formToKit(form);
    await update({ id, name: form.name, ...next });
    setSaved(true);
  }

  return (
    <div className="space-y-4">
      {/* AI 지원 — 결과는 폼에만 채운다(자동 저장 없음) */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <span className="text-sm font-bold">내 AI로 초안·보강</span>
            {!aiLoading && aiConnected && <Badge variant="brand">{aiStatus?.activeProvider}</Badge>}
            <span className="text-xs text-muted">결과는 폼에만 채웁니다 — 저장은 직접 하세요.</span>
          </div>

          {aiLoading ? (
            <p className="text-sm text-muted">AI 연결 상태를 확인하는 중…</p>
          ) : !aiConnected ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-foreground-muted">
                연결된 AI가 없습니다. 크랩피치는 공용 AI 키를 제공하지 않습니다 — 본인 API 키를 등록하면 초안 생성·보강을
                쓸 수 있습니다.
              </p>
              <Link href="/ai">
                <Button variant="subtle">
                  <Wand2 className="h-4 w-4" /> 내 AI 연결하기
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="mk-ai-company">회사명 (필수)</Label>
                  <Input
                    id="mk-ai-company"
                    value={seed.companyName}
                    onChange={(e) => setSeed((s) => ({ ...s, companyName: e.target.value }))}
                    placeholder="크랩피치"
                  />
                </div>
                <div>
                  <Label htmlFor="mk-ai-industry">업종</Label>
                  <Input
                    id="mk-ai-industry"
                    value={seed.industry}
                    onChange={(e) => setSeed((s) => ({ ...s, industry: e.target.value }))}
                    placeholder="B2B SaaS · 홍보"
                  />
                </div>
                <div>
                  <Label htmlFor="mk-ai-oneliner">한 줄 설명</Label>
                  <Input
                    id="mk-ai-oneliner"
                    value={seed.oneLiner}
                    onChange={(e) => setSeed((s) => ({ ...s, oneLiner: e.target.value }))}
                    placeholder="스타트업이 직접 기자에게 보도자료를 보내는 도구"
                  />
                </div>
                <div>
                  <Label htmlFor="mk-ai-numbers">보유 수치 (출처와 함께)</Label>
                  <Input
                    id="mk-ai-numbers"
                    value={seed.numbers}
                    onChange={(e) => setSeed((s) => ({ ...s, numbers: e.target.value }))}
                    placeholder="이용 기업 320곳 (2026-07 자사 집계)"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => runAi("gen")} disabled={aiBusy !== null || !companyName}>
                  <Sparkles className="h-4 w-4" /> {aiBusy === "gen" ? "만드는 중…" : "AI로 초안 만들기"}
                </Button>
                <Button variant="subtle" onClick={() => runAi("enh")} disabled={aiBusy !== null || !companyName}>
                  <Wand2 className="h-4 w-4" /> {aiBusy === "enh" ? "보강 중…" : "AI로 보강하기"}
                </Button>
                <span className="text-xs text-muted">
                  초안 만들기는 폼 내용을 덮어씁니다 · 보강하기는 현재 폼 값을 다듬습니다.
                </span>
              </div>

              {aiNote && <p className="text-xs text-muted">{aiNote}</p>}
              {aiError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{aiError}</p>}
              {gaps.length > 0 && <GapReport gaps={gaps} />}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {placeholderFields.length > 0 && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground-muted">
              <b className="text-foreground">{PLACEHOLDER}</b> 표기가 남아 있습니다({placeholderFields.join("·")}). 지우지
              말고 사실을 확인한 뒤 실제 내용으로 바꾸세요 — 확인 전까지는 완성도에 반영되지 않습니다.
            </p>
          )}
          <div>
            <Label htmlFor="mk-name">미디어킷 이름</Label>
            <Input id="mk-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="mk-bp">① 보일러플레이트 (한 줄 소개)</Label>
            <Textarea id="mk-bp" rows={2} value={form.boilerplate} onChange={(e) => set("boilerplate", e.target.value)} placeholder="○○는 …하는 회사로, 2024년 설립되어 …" />
          </div>
          <div>
            <Label htmlFor="mk-km">② 핵심 메시지 (한 줄에 하나, 3개 권장)</Label>
            <Textarea id="mk-km" rows={3} value={form.keyMessages} onChange={(e) => set("keyMessages", e.target.value)} placeholder={"메시지1\n메시지2\n메시지3"} />
          </div>
          <div>
            <Label htmlFor="mk-fs">③ 팩트시트 (한 줄에 &lsquo;항목: 내용 | 출처&rsquo;, 출처는 선택)</Label>
            <Textarea id="mk-fs" rows={4} value={form.factSheet} onChange={(e) => set("factSheet", e.target.value)} placeholder={"설립: 2024년\n대표: 홍길동\n이용자: 1만 매장 | 2026-07 자사 집계"} />
          </div>
          <div>
            <Label htmlFor="mk-nr">④ 회사 스토리</Label>
            <Textarea id="mk-nr" rows={3} value={form.narrative} onChange={(e) => set("narrative", e.target.value)} placeholder="창업 계기 → 문제 → 해결 → 현재 → 비전" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="mk-sp">⑤ 대표 프로필</Label>
              <Textarea id="mk-sp" rows={2} value={form.spokesperson} onChange={(e) => set("spokesperson", e.target.value)} placeholder="이름·직함·경력 3줄" />
            </div>
            <div>
              <Label htmlFor="mk-ct">⑧ 미디어 연락처</Label>
              <Textarea id="mk-ct" rows={2} value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="이름·이메일·전화·응대 시간" />
            </div>
          </div>
          <div>
            <Label htmlFor="mk-q">⑥ 인용문 뱅크 (한 줄에 하나, 3개 이상)</Label>
            <Textarea id="mk-q" rows={3} value={form.quotes} onChange={(e) => set("quotes", e.target.value)} placeholder={"제품 관련 인용\n비전 관련 인용\n시장 관련 인용"} />
          </div>

          <CompletenessPanel report={report} savedScore={kit.completeness} />

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={save}>저장</Button>
            {saved && <span className="text-sm text-success">✓ 저장됨</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── 완성도 ─────────────────────────────────────────────────── */

/** 점수와 함께 **미충족 사유**를 항상 같이 보여 준다 — %만으로는 다음 행동을 못 잡는다. */
function CompletenessPanel({ report, savedScore }: { report: MediaKitCompleteness; savedScore: number }) {
  const unmet = unmetItems(report);
  const tone = report.score >= 80 ? "success" : report.score >= 50 ? "brand" : "warning";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">완성도 (현재 입력 기준)</span>
        <span className="text-sm font-bold tabular-nums text-brand">{report.score}%</span>
      </div>
      <Progress value={report.score} tone={tone} className="mt-2" />
      {report.score !== savedScore && (
        <p className="mt-1.5 text-xs text-muted">저장된 값 {savedScore}% · 저장하면 현재 입력 기준으로 갱신됩니다.</p>
      )}

      {unmet.length === 0 ? (
        <p className="mt-3 text-xs text-success">모든 항목을 채웠습니다.</p>
      ) : (
        <>
          <p className="mt-3 text-xs font-semibold text-foreground-muted">
            남은 항목 {unmet.length}개 — 무엇을 채우면 오르는지
          </p>
          <ul className="mt-2 space-y-2">
            {unmet.map((i) => (
              <li key={i.key} className="flex gap-2 text-xs">
                <span className="mt-px shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-bold tabular-nums text-foreground-muted">
                  +{i.max - i.earned}
                </span>
                <span>
                  <b className="text-foreground">{i.label}</b>{" "}
                  <span className="text-foreground-muted">{i.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 보강 결과의 갭 리포트 — 모델이 "없는 정보"로 보고한 것들. */
function GapReport({ gaps }: { gaps: Gap[] }) {
  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4 text-warning" /> 갭 리포트 ({gaps.length})
      </div>
      <ul className="mt-2 space-y-2 text-xs">
        {gaps.map((g, idx) => (
          <li key={`${g.field}-${idx}`}>
            <b className="text-foreground">{g.field}</b>{" "}
            <span className="text-foreground-muted">{g.issue}</span>
            {g.suggestion && <div className="mt-0.5 text-muted">→ {g.suggestion}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
