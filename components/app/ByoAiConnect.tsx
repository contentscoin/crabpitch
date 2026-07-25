"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bot, Check, Copy, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

type ProviderId = "claude" | "chatgpt" | "gemini";
type SkillId =
  | "press-release-writer"
  | "media-kit-builder"
  | "journalist-outreach"
  | "reply-handler";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

/**
 * 앱 스킴을 짧게 시도한 뒤 웹 URL로 폴백.
 * (다른 앱 OAuth 토큰을 읽지 않음 — 이미 로그인된 네이티브/웹 세션만 재사용)
 */
function openProvider(urls: string[], webUrl: string) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    for (const u of urls) {
      if (u.startsWith("http")) continue;
      try {
        window.location.href = u;
      } catch {
        /* ignore */
      }
    }
    window.setTimeout(() => {
      window.open(webUrl, "_blank", "noopener,noreferrer");
    }, 700);
    return;
  }
  window.open(webUrl, "_blank", "noopener,noreferrer");
}

export function ByoAiConnectPanel({
  skill = "press-release-writer",
  who,
  headline,
  bodyHint,
  topicTags,
  compact,
}: {
  skill?: SkillId;
  who?: string;
  headline?: string;
  bodyHint?: string;
  topicTags?: string[];
  compact?: boolean;
}) {
  const hub = useQuery(api.byoAi.getHub);
  const setPreferred = useMutation(api.byoAi.setPreferredProvider);
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [copied, setCopied] = useState<"prompt" | "mcp" | null>(null);
  const [busy, setBusy] = useState(false);

  const active = provider ?? hub?.preferredProvider ?? "claude";
  const pack = useQuery(api.byoAi.getLaunchPack, {
    provider: active,
    skill,
    who: who || undefined,
    headline: headline || undefined,
    bodyHint: bodyHint || undefined,
    topicTags: topicTags?.length ? topicTags : undefined,
  });

  async function markCopied(kind: "prompt" | "mcp") {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }

  async function launch() {
    if (!pack) return;
    setBusy(true);
    try {
      await copyText(pack.prompt);
      await markCopied("prompt");
      if (hub && active !== hub.preferredProvider) {
        await setPreferred({ provider: active });
      }
      openProvider(pack.openUrls, pack.webUrl);
    } finally {
      setBusy(false);
    }
  }

  if (hub === undefined) {
    return <div className="h-40 animate-pulse rounded-lg bg-surface" />;
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <p className="text-sm text-foreground-muted">{hub.note}</p>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        {hub.providers.map((p) => {
          const selected = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setProvider(p.id)}
              className={
                "rounded-lg border p-3 text-left transition-colors " +
                (selected
                  ? "border-brand bg-brand-soft/40"
                  : "border-border bg-card hover:bg-surface")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{p.label}</span>
                {hub.preferredProvider === p.id && (
                  <Badge variant="brand">기본</Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-muted">{p.short}</div>
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">
              {skill} · {active}
            </span>
          </div>
          <p className="text-xs text-muted">{pack?.hint ?? "…"}</p>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-foreground-muted">
            <li>아래 버튼으로 스킬 프롬프트를 복사하고 내 AI 앱/웹을 엽니다.</li>
            <li>이미 ChatGPT·Claude·Gemini에 로그인돼 있으면 그 계정으로 이어집니다.</li>
            <li>채팅에 붙여넣기(Ctrl/⌘+V) 후 보도자료·프레스킷 작성을 진행합니다.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || !pack} onClick={launch}>
              <Sparkles className="h-4 w-4" />
              {busy ? "여는 중…" : "프롬프트 복사 후 내 AI에서 열기"}
            </Button>
            <Button
              type="button"
              variant="subtle"
              disabled={!pack}
              onClick={async () => {
                if (!pack) return;
                await copyText(pack.prompt);
                await markCopied("prompt");
              }}
            >
              {copied === "prompt" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              프롬프트만 복사
            </Button>
            {pack && (
              <a
                href={pack.skillUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex"
              >
                <Button type="button" variant="ghost" size="sm">
                  <ExternalLink className="h-4 w-4" /> 스킬 원문
                </Button>
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {!compact && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="text-sm font-semibold">OpenCrab MCP (Cursor / 데스크톱)</div>
            <p className="text-xs text-muted">
              기자 온톨로지는 MCP로 연결합니다. 키는 OpenCrab에서 발급한{" "}
              <code className="rounded bg-surface px-1">ocm_…</code> 를 넣으세요.
            </p>
            <pre className="overflow-x-auto rounded-md bg-surface p-3 text-xs">
              {hub.mcpSnippet}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="subtle"
                onClick={async () => {
                  await copyText(hub.mcpSnippet);
                  await markCopied("mcp");
                }}
              >
                {copied === "mcp" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                MCP JSON 복사
              </Button>
              <a href={hub.skillPackUrl} target="_blank" rel="noreferrer">
                <Button type="button" size="sm" variant="ghost">
                  <ExternalLink className="h-4 w-4" /> 공개 스킬 팩
                </Button>
              </a>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPreferred({ provider: active })}
              >
                {active} 를 기본 AI로
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
