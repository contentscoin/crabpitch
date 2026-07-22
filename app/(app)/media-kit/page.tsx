"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Progress } from "@/components/ui/Progress";
import { PageHeader, EmptyState } from "@/components/app/bits";

export default function MediaKitPage() {
  const kits = useQuery(api.mediaKits.list);
  const create = useMutation(api.mediaKits.create);
  const [selected, setSelected] = useState<Id<"mediaKits"> | null>(null);

  async function newKit() {
    const id = await create({ name: "새 미디어킷" });
    setSelected(id as Id<"mediaKits">);
  }

  return (
    <div>
      <PageHeader
        title="미디어킷"
        description="기자가 바로 인용하는 공식 회사 소개 자료. 한 번에 한 섹션씩 채워 완성합니다."
        action={
          <Button onClick={newKit}>
            <Plus className="h-4 w-4" /> 새 미디어킷
          </Button>
        }
      />

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

function MediaKitEditor({ id }: { id: Id<"mediaKits"> }) {
  const kit = useQuery(api.mediaKits.get, { id });
  const update = useMutation(api.mediaKits.update);
  const [form, setForm] = useState({
    name: "",
    boilerplate: "",
    keyMessages: "",
    factSheet: "",
    narrative: "",
    spokesperson: "",
    quotes: "",
    contact: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (kit) {
      setForm({
        name: kit.name,
        boilerplate: kit.boilerplate ?? "",
        keyMessages: kit.keyMessages.join("\n"),
        factSheet: kit.factSheet.map((f) => `${f.label}: ${f.value}`).join("\n"),
        narrative: kit.narrative ?? "",
        spokesperson: kit.spokesperson ?? "",
        quotes: kit.quotes.join("\n"),
        contact: kit.contact ?? "",
      });
    }
  }, [kit?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (kit === undefined) return <div className="h-96 animate-pulse rounded-lg border border-border bg-card" />;
  if (kit === null) return <p className="text-muted">미디어킷을 찾을 수 없습니다.</p>;

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function save() {
    await update({
      id,
      name: form.name,
      boilerplate: form.boilerplate,
      keyMessages: form.keyMessages.split("\n").map((s) => s.trim()).filter(Boolean),
      factSheet: form.factSheet
        .split("\n")
        .map((line) => {
          const [label, ...rest] = line.split(":");
          return { label: label.trim(), value: rest.join(":").trim() };
        })
        .filter((f) => f.label && f.value),
      narrative: form.narrative,
      spokesperson: form.spokesperson,
      quotes: form.quotes.split("\n").map((s) => s.trim()).filter(Boolean),
      contact: form.contact,
    });
    setSaved(true);
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
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
          <Label htmlFor="mk-fs">③ 팩트시트 (한 줄에 &lsquo;항목: 내용&rsquo;)</Label>
          <Textarea id="mk-fs" rows={4} value={form.factSheet} onChange={(e) => set("factSheet", e.target.value)} placeholder={"설립: 2024년\n대표: 홍길동\n이용자: 1만 매장 (2026-07 기준)"} />
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

        <div className="flex items-center gap-3 pt-1">
          <Button onClick={save}>저장</Button>
          <span className="text-sm text-muted">완성도 {kit.completeness}%</span>
          {saved && <span className="text-sm text-success">✓ 저장됨</span>}
        </div>
      </CardContent>
    </Card>
  );
}
