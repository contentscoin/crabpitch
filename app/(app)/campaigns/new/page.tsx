"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/app/bits";
import { ByoAiConnectPanel } from "@/components/app/ByoAiConnect";

export default function NewCampaignPage() {
  const router = useRouter();
  const createPR = useMutation(api.pressReleases.create);
  const createCampaign = useMutation(api.campaigns.create);
  const polish = useAction(api.aiActions.polishPressRelease);

  const [form, setForm] = useState({
    who: "",
    headline: "",
    body: "",
    numbers: "",
    quote: "",
    topicTags: "",
    links: "",
  });
  const [loading, setLoading] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
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
      });
      setForm((f) => ({
        ...f,
        headline: result.headlines[0] ?? result.title,
        body: result.body,
      }));
      setNote(result.message ?? null);
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
            {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button type="button" variant="subtle" onClick={() => router.back()}>
                취소
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={polishing || !form.headline}
                onClick={onPolish}
                title="서버 Anthropic 키가 있을 때만 동작 (기본은 내 AI 스킬 사용)"
              >
                <Wand2 className="h-4 w-4" />
                {polishing ? "서버 AI…" : "서버 AI(선택)"}
              </Button>
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
