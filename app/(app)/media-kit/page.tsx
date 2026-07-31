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
  LEGACY_COMPLETENESS_MAX,
  pressKitSection,
  PLACEHOLDER_MARKERS,
  scoreMediaKit,
  unmetItems,
  V2_COMPLETENESS_MAX,
  V2_KEYS,
  type CompletenessItem,
  type CompletenessKey,
  type MediaKitAssetPolicy,
  type MediaKitCompleteness,
  type MediaKitCoverageItem,
  type MediaKitVisual,
} from "@/convex/lib/mediaKitCompleteness";
// 자산 규칙·규정 4항 문구는 팩(pressGuide)이 정본 — 화면에서 다시 쓰지 않는다.
import { ASSET_POLICY_ITEMS, GEO_ASSET_RULES } from "@/convex/lib/pressGuide";
import { SkeletonCard, SkeletonRows } from "@/components/ui/Skeleton";

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
        <SkeletonRows rows={3} />
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

/**
 * `generateMediaKit`·`enhanceMediaKit`가 주고받는 기본 7필드.
 * v2 확장 4필드는 보강 호출에 함께 실어 보낸다(`aiActions.kitValidator`가 optional로 받는다) —
 * 그래야 모델이 사용자가 채운 비주얼·자산 규정·최근 보도를 읽고 다듬을 수 있다.
 */
type KitFields = {
  boilerplate: string;
  keyMessages: string[];
  factSheet: Array<{ label: string; value: string; source?: string }>;
  narrative: string;
  spokesperson: string;
  quotes: string[];
  contact: string;
};

/** 저장·채점에만 쓰는 v2 확장 4필드(프레스킷 목차 ①·⑥·⑦·⑨). */
type KitExtras = {
  oneLiner: string;
  visuals: MediaKitVisual[];
  assetPolicy: MediaKitAssetPolicy;
  coverage: MediaKitCoverageItem[];
};

type FormKey =
  | "oneLiner"
  | "boilerplate"
  | "keyMessages"
  | "factSheet"
  | "narrative"
  | "spokesperson"
  | "quotes"
  | "contact"
  | "visuals"
  | "coverage"
  | "policyUsage"
  | "policyModification"
  | "policyCredit"
  | "policyTrademark";

type FormState = { name: string } & Record<FormKey, string>;

const EMPTY_FORM: FormState = {
  name: "",
  oneLiner: "",
  boilerplate: "",
  keyMessages: "",
  factSheet: "",
  narrative: "",
  spokesperson: "",
  quotes: "",
  contact: "",
  visuals: "",
  coverage: "",
  policyUsage: "",
  policyModification: "",
  policyCredit: "",
  policyTrademark: "",
};

/** 자산 사용 규정 입력 4칸 — 라벨은 팩 4항(`ASSET_POLICY_ITEMS`)을 그대로 쓴다. */
const POLICY_FIELDS = [
  { form: "policyUsage", field: "usageScope", placeholder: "보도 목적에 한해 사용할 수 있습니다." },
  { form: "policyModification", field: "modificationLimits", placeholder: "로고 비율·색상 변경 금지" },
  { form: "policyCredit", field: "credit", placeholder: "사진 사용 시 '○○ 제공' 표기" },
  { form: "policyTrademark", field: "trademarkContact", placeholder: "상표 사용 문의 press@example.com" },
] as const satisfies ReadonlyArray<{ form: FormKey; field: keyof MediaKitAssetPolicy; placeholder: string }>;

/** 한 줄에 여러 값을 담을 때의 구분자 — 팩트시트 출처·비주얼·최근 보도가 공유한다. */
const FIELD_SEP = "|";
/** 팩트시트 한 줄의 출처 구분자 — `항목: 내용 | 출처`. 수치 항목 출처는 완성도 점수에 들어간다. */
const SOURCE_SEP = FIELD_SEP;

function toLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `A | B | C` 한 줄을 고정 개수 칸으로 가른다(빈 칸은 빈 문자열). */
function splitFields(line: string, count: number): string[] {
  const parts = line.split(FIELD_SEP).map((s) => s.trim());
  return Array.from({ length: count }, (_, i) => parts[i] ?? "");
}

function joinFields(values: Array<string | undefined>): string {
  const trimmed = values.map((v) => v ?? "");
  while (trimmed.length > 1 && !trimmed[trimmed.length - 1]) trimmed.pop();
  return trimmed.join(` ${FIELD_SEP} `);
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

/** 비주얼 한 줄: `라벨 | 파일명·URL | Alt | 캡션`. */
function parseVisuals(text: string): MediaKitVisual[] {
  return toLines(text)
    .map((line) => {
      const [label, url, alt, caption] = splitFields(line, 4);
      return {
        label,
        ...(url ? { url } : {}),
        ...(alt ? { alt } : {}),
        ...(caption ? { caption } : {}),
      };
    })
    .filter((v) => v.label);
}

function formatVisuals(items: readonly MediaKitVisual[] | undefined): string {
  return (items ?? []).map((v) => joinFields([v.label, v.url, v.alt, v.caption])).join("\n");
}

/** 최근 보도 한 줄: `매체 | 제목 | 링크 | 보도일`. */
function parseCoverage(text: string): MediaKitCoverageItem[] {
  return toLines(text)
    .map((line) => {
      const [outlet, title, url, publishedAtText] = splitFields(line, 4);
      return {
        outlet,
        title,
        ...(url ? { url } : {}),
        ...(publishedAtText ? { publishedAtText } : {}),
      };
    })
    .filter((c) => c.outlet && c.title);
}

function formatCoverage(items: readonly MediaKitCoverageItem[] | undefined): string {
  return (items ?? [])
    .map((c) => joinFields([c.outlet, c.title, c.url, c.publishedAtText]))
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

/** 보강 호출용 — 기본 7필드 + 값이 있는 v2 확장 필드. */
function formToEnhanceInput(form: FormState) {
  const extras = formToExtras(form);
  return {
    ...formToKit(form),
    ...(extras.oneLiner ? { oneLiner: extras.oneLiner } : {}),
    ...(extras.visuals.length ? { visuals: extras.visuals } : {}),
    ...(Object.keys(extras.assetPolicy).length ? { assetPolicy: extras.assetPolicy } : {}),
    ...(extras.coverage.length ? { coverage: extras.coverage } : {}),
  };
}

function formToExtras(form: FormState): KitExtras {
  const assetPolicy: MediaKitAssetPolicy = {};
  for (const { form: key, field } of POLICY_FIELDS) {
    const value = form[key].trim();
    if (value) assetPolicy[field] = value;
  }
  return {
    oneLiner: form.oneLiner.trim(),
    visuals: parseVisuals(form.visuals),
    assetPolicy,
    coverage: parseCoverage(form.coverage),
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
      const policy = kit.assetPolicy ?? {};
      setForm({
        ...EMPTY_FORM,
        name: kit.name,
        oneLiner: kit.oneLiner ?? "",
        boilerplate: kit.boilerplate ?? "",
        keyMessages: kit.keyMessages.join("\n"),
        factSheet: formatFactSheet(kit.factSheet),
        narrative: kit.narrative ?? "",
        spokesperson: kit.spokesperson ?? "",
        quotes: kit.quotes.join("\n"),
        contact: kit.contact ?? "",
        visuals: formatVisuals(kit.visuals),
        coverage: formatCoverage(kit.coverage),
        policyUsage: policy.usageScope ?? "",
        policyModification: policy.modificationLimits ?? "",
        policyCredit: policy.credit ?? "",
        policyTrademark: policy.trademarkContact ?? "",
      });
      setSeed({
        companyName: kit.name === DEFAULT_KIT_NAME ? "" : kit.name,
        industry: "",
        oneLiner: kit.oneLiner ?? "",
        numbers: "",
      });
      setGaps([]);
      setAiNote(null);
      setAiError(null);
      setSaved(false);
    }
  }, [kit?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const companyName = seed.companyName.trim() || (form.name === DEFAULT_KIT_NAME ? "" : form.name.trim());

  // 저장 전 입력 기준 점수 — "지금 무엇을 채우면 오르는지"를 즉시 보여 준다.
  // 회사명을 넘기면 자산 파일명이 회사를 식별하는지까지 본다(모르면 그 조건은 건너뛴다).
  const report = useMemo<MediaKitCompleteness>(
    () => scoreMediaKit({ ...formToKit(form), ...formToExtras(form) }, { companyName }),
    [form, companyName],
  );

  // AI가 남긴 미확정 표기는 지우지 않고 어디에 있는지만 알린다.
  const placeholderFields = useMemo(
    () =>
      (
        [
          ["한 문장 정의", form.oneLiner],
          ["회사 소개", form.boilerplate],
          ["핵심 메시지", form.keyMessages],
          ["팩트시트", form.factSheet],
          ["스토리", form.narrative],
          ["대표 프로필", form.spokesperson],
          ["인용문", form.quotes],
          ["언론 문의", form.contact],
          ["비주얼 자산", form.visuals],
          ["최근 보도", form.coverage],
          ["자산 사용 규정", POLICY_FIELDS.map((p) => form[p.form]).join("\n")],
        ] as const
      )
        .filter(([, value]) => hasPlaceholder(value))
        .map(([label]) => label),
    [form],
  );

  if (kit === undefined) return <SkeletonCard lines={8} />;
  if (kit === null) return <p className="text-muted">미디어킷을 찾을 수 없습니다.</p>;

  /** 접어 둔 3개 섹션의 배점 합 — 숫자를 화면에 직접 쓰지 않고 채점표에서 받아 온다. */
  const extrasMax = (["visuals", "coverage", "assetPolicy"] as const).reduce(
    (sum, key) => sum + (itemOf(report, key)?.max ?? 0),
    0,
  );

  function set<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  /**
   * AI 결과를 **폼에만** 반영한다. placeholder는 그대로 둔다.
   * 확장 4필드는 **모델이 실제로 준 경우에만** 덮어쓴다 — 보강 액션은 7필드만 주고받으므로
   * 왕복 한 번에 사용자가 직접 채운 비주얼·보도 목록이 지워지면 안 된다.
   */
  function applyKit(k: KitFields & Partial<KitExtras>) {
    const policyPatch: Partial<Record<FormKey, string>> = {};
    for (const { form: key, field } of POLICY_FIELDS) {
      const value = k.assetPolicy?.[field]?.trim();
      if (value) policyPatch[key] = value;
    }
    setForm((f) => ({
      ...f,
      boilerplate: k.boilerplate,
      keyMessages: k.keyMessages.join("\n"),
      factSheet: formatFactSheet(k.factSheet),
      narrative: k.narrative,
      spokesperson: k.spokesperson,
      quotes: k.quotes.join("\n"),
      contact: k.contact,
      ...(k.oneLiner ? { oneLiner: k.oneLiner } : {}),
      ...(k.visuals?.length ? { visuals: formatVisuals(k.visuals) } : {}),
      ...(k.coverage?.length ? { coverage: formatCoverage(k.coverage) } : {}),
      ...policyPatch,
    }));
    setSaved(false);
  }

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
        const res = await enhanceKit({ companyName, kit: formToEnhanceInput(form) });
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
    // 저장은 사용자가 명시적으로 한다 — AI는 폼까지만 채운다.
    await update({ id, name: form.name, ...formToKit(form), ...formToExtras(form) });
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
            <Label htmlFor="mk-one">① 한 문장 정의</Label>
            <Input
              id="mk-one"
              value={form.oneLiner}
              onChange={(e) => set("oneLiner", e.target.value)}
              placeholder="○○는 …하는 회사입니다"
            />
            <p className="mt-1 text-xs text-muted">{pressKitSection("①")}</p>
          </div>
          <div>
            <Label htmlFor="mk-bp">② 보일러플레이트 (표준 회사 소개문)</Label>
            <Textarea id="mk-bp" rows={2} value={form.boilerplate} onChange={(e) => set("boilerplate", e.target.value)} placeholder="○○는 …하는 회사로, 2024년 설립되어 …" />
          </div>
          <div>
            <Label htmlFor="mk-km">③ 핵심 메시지 (한 줄에 하나, 3개 권장)</Label>
            <Textarea id="mk-km" rows={3} value={form.keyMessages} onChange={(e) => set("keyMessages", e.target.value)} placeholder={"메시지1\n메시지2\n메시지3"} />
          </div>
          <div>
            <Label htmlFor="mk-fs">④ 팩트시트 (한 줄에 &lsquo;항목: 내용 | 출처&rsquo;, 출처는 선택)</Label>
            <Textarea id="mk-fs" rows={4} value={form.factSheet} onChange={(e) => set("factSheet", e.target.value)} placeholder={"설립: 2024년\n대표: 홍길동\n이용자: 1만 매장 | 2026-07 자사 집계"} />
          </div>
          <div>
            <Label htmlFor="mk-nr">⑤ 회사 스토리</Label>
            <Textarea id="mk-nr" rows={3} value={form.narrative} onChange={(e) => set("narrative", e.target.value)} placeholder="창업 계기 → 문제 → 해결 → 현재 → 비전" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="mk-sp">⑥ 대표 프로필</Label>
              <Textarea id="mk-sp" rows={2} value={form.spokesperson} onChange={(e) => set("spokesperson", e.target.value)} placeholder="이름·직함·경력 3줄" />
            </div>
            <div>
              <Label htmlFor="mk-ct">⑧ 미디어 연락처</Label>
              <Textarea id="mk-ct" rows={2} value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="이름·이메일·전화·응대 시간" />
            </div>
          </div>
          <div>
            <Label htmlFor="mk-q">⑦ 인용문 뱅크 (한 줄에 하나, 3개 이상)</Label>
            <Textarea id="mk-q" rows={3} value={form.quotes} onChange={(e) => set("quotes", e.target.value)} placeholder={"제품 관련 인용\n비전 관련 인용\n시장 관련 인용"} />
          </div>

          {/* 확장 섹션 — 화면이 길어지지 않도록 접어 둔다. 요약 줄에 항목 점수를 띄워 접힌 채로도 다음 행동이 보인다. */}
          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-foreground-muted">
              확장 섹션 — 기자가 자산을 바로 쓰게 하는 3개 섹션 (합계 {extrasMax}점)
            </p>

            <KitSection title="⑨ 비주얼 자산" item={itemOf(report, "visuals")}>
              <p className="text-xs text-muted">
                한 줄에 하나씩 <code>라벨 {FIELD_SEP} 파일명·URL {FIELD_SEP} Alt {FIELD_SEP} 캡션</code> 순으로 적습니다.
              </p>
              <ul className="space-y-1 text-xs text-muted">
                <li>
                  · 파일명 <code>{GEO_ASSET_RULES.filenamePattern}</code> (금지 예:{" "}
                  {GEO_ASSET_RULES.filenameBadExamples.join(", ")})
                </li>
                <li>· Alt — {GEO_ASSET_RULES.alt}</li>
                <li>· 캡션 — {GEO_ASSET_RULES.caption}</li>
              </ul>
              <Textarea
                id="mk-vs"
                rows={3}
                value={form.visuals}
                onChange={(e) => set("visuals", e.target.value)}
                placeholder={`로고 ${FIELD_SEP} 크랩피치-프레스킷-로고.png ${FIELD_SEP} 크랩피치 국문 로고 ${FIELD_SEP} 크랩피치 국문 로고(가로형)`}
              />
            </KitSection>

            <KitSection title="⑩ 최근 보도" item={itemOf(report, "coverage")}>
              <p className="text-xs text-muted">
                한 줄에 하나씩 <code>매체 {FIELD_SEP} 기사 제목 {FIELD_SEP} 링크 {FIELD_SEP} 보도일</code> 순으로
                적습니다. <b>실제로 확인한 보도만</b> 넣으세요 — AI는 이 목록을 지어내지 않습니다.
              </p>
              <Textarea
                id="mk-cv"
                rows={3}
                value={form.coverage}
                onChange={(e) => set("coverage", e.target.value)}
                placeholder={`전자신문 ${FIELD_SEP} 크랩피치, 기자 매칭 기능 공개 ${FIELD_SEP} https://example.com/a ${FIELD_SEP} 2026-06-11`}
              />
            </KitSection>

            <KitSection title="⑪ 자산 사용 규정" item={itemOf(report, "assetPolicy")}>
              <p className="text-xs text-muted">
                로고·사진을 기자가 안심하고 쓰려면 아래 4항이 모두 필요합니다. 사내 확정 전이면 {PLACEHOLDER}로 남기세요.
              </p>
              {POLICY_FIELDS.map((p, idx) => (
                <div key={p.form}>
                  <Label htmlFor={`mk-${p.form}`}>{ASSET_POLICY_ITEMS[idx]}</Label>
                  <Textarea
                    id={`mk-${p.form}`}
                    rows={2}
                    value={form[p.form]}
                    onChange={(e) => set(p.form, e.target.value)}
                    placeholder={p.placeholder}
                  />
                </div>
              ))}
            </KitSection>
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

/* ── 확장 섹션 ──────────────────────────────────────────────── */

function itemOf(report: MediaKitCompleteness, key: CompletenessKey): CompletenessItem | undefined {
  return report.items.find((i) => i.key === key);
}

/**
 * 접이식 섹션. 요약 줄에 항목 점수를 함께 띄워 **접힌 상태에서도** 무엇이 비었는지 보이게 한다.
 * (신규 섹션을 접어 두면 존재를 모른 채 점수만 떨어졌다고 느끼기 쉽다.)
 */
function KitSection({
  title,
  item,
  children,
}: {
  title: string;
  item?: CompletenessItem;
  children: React.ReactNode;
}) {
  const done = item ? item.earned >= item.max : false;
  return (
    <details className="rounded-lg border border-border bg-surface px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
        <span>{title}</span>
        {item && (
          <span
            className={
              "shrink-0 rounded px-1.5 py-0.5 text-xs font-bold tabular-nums " +
              (done ? "bg-success/10 text-success" : "bg-surface-2 text-foreground-muted")
            }
          >
            {item.earned}/{item.max}점
          </span>
        )}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

/* ── 완성도 ─────────────────────────────────────────────────── */

/** 점수와 함께 **미충족 사유**를 항상 같이 보여 준다 — %만으로는 다음 행동을 못 잡는다. */
function CompletenessPanel({ report, savedScore }: { report: MediaKitCompleteness; savedScore: number }) {
  const unmet = unmetItems(report);
  const tone = report.score >= 80 ? "success" : report.score >= 50 ? "brand" : "warning";
  // 배점 개편 안내 — 신규 항목을 하나도 건드리지 않았을 때만 띄운다("왜 % 가 내려갔나"에 대한 답).
  const v2Untouched = V2_KEYS.every((key) => (itemOf(report, key)?.earned ?? 0) === 0);

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
      {v2Untouched && (
        <p className="mt-1.5 text-xs text-muted">
          배점이 개편되어 프레스킷 목차 기반 신규 4개 항목 {V2_COMPLETENESS_MAX}점이 추가됐습니다 — 기존 항목만 채운
          킷의 상한은 {LEGACY_COMPLETENESS_MAX}%입니다. 기존 항목의 배점은 그대로 두고 신규 항목만 더한 구조라, 아래
          안내대로 채우면 그만큼 올라갑니다.
        </p>
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
