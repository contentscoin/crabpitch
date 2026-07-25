"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  BookOpen,
  Check,
  Copy,
  Plug,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  MCP_PLATFORMS,
  MCP_PRIVACY_RULES,
  MCP_TOOLS,
  MCP_VS_OPENCRAB,
  CRABPITCH_MCP_DOCS_URL,
  CRABPITCH_SKILL_REPO_URL,
} from "@/lib/mcpGuide";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function McpGuidePanel() {
  const access = useQuery(api.userMcpKeys.getAccess);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [platform, setPlatform] = useState<(typeof MCP_PLATFORMS)[number]["id"]>(
    "cursor",
  );

  const active = MCP_PLATFORMS.find((p) => p.id === platform) ?? MCP_PLATFORMS[0]!;
  const siteUrl = access?.siteUrl ?? "https://YOUR_DEPLOYMENT.convex.site";
  const sampleSnippet = JSON.stringify(
    {
      mcpServers: {
        crabpitch: {
          url: `${siteUrl}/api/mcp/cp_mcp_YOUR_KEY`,
        },
      },
    },
    null,
    2,
  );

  async function copyPrompt(name: string, prompt: string) {
    await copyText(prompt);
    setCopiedPrompt(name);
    window.setTimeout(() => setCopiedPrompt(null), 2000);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">CrabPitch MCP란?</span>
            {access && (
              <Badge variant={access.allowed ? "brand" : "outline"}>
                {access.allowed ? `${access.plan} · 사용 가능` : `${access.plan} · 유료 전용`}
              </Badge>
            )}
          </div>
          <p className="text-sm text-foreground-muted">
            본인 ChatGPT·Claude·Gemini·Cursor에{" "}
            <code className="rounded bg-surface px-1">cp_mcp_…</code> 키를
            등록하면, 그 AI가 CrabPitch 도구(기자 매칭·메일 템플릿·회신 분류)를
            호출할 수 있습니다. 서비스가 대신 AI를 돌리는 것이 아니라,{" "}
            <strong className="font-semibold text-foreground">
              사용자가 이미 쓰는 AI
            </strong>
            에 플러그인으로 붙는 방식입니다.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
            <li>
              엔드포인트:{" "}
              <code className="rounded bg-surface px-1">{siteUrl}/api/mcp</code>
            </li>
            <li>
              URL 방식:{" "}
              <code className="rounded bg-surface px-1">
                {siteUrl}/api/mcp/cp_mcp_…
              </code>
            </li>
            <li>인증: Bearer 헤더 또는 URL에 키 포함</li>
          </ul>
          {!access?.allowed && (
            <p className="text-xs text-foreground-muted">
              현재 Free 플랜입니다.{" "}
              <Link href="/settings" className="underline underline-offset-2">
                설정에서 Solo 이상으로 전환
              </Link>
              하면 키를 발급할 수 있습니다.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">제공 도구 4종</span>
          </div>
          <div className="space-y-3">
            {MCP_TOOLS.map((tool) => (
              <div
                key={tool.name}
                className="rounded-md border border-border px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-xs font-semibold text-foreground">
                    {tool.name}
                  </code>
                  <Badge variant="outline">{tool.title}</Badge>
                </div>
                <p className="mt-1.5 text-xs text-foreground-muted">
                  {tool.description}
                </p>
                <pre className="mt-2 overflow-x-auto rounded bg-surface p-2 text-[11px] text-muted">
                  args: {tool.exampleArgs}
                </pre>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="subtle"
                    onClick={() => copyPrompt(tool.name, tool.examplePrompt)}
                  >
                    {copiedPrompt === tool.name ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    예시 프롬프트 복사
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">플랫폼별 등록</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {MCP_PLATFORMS.map((p) => {
              const selected = platform === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className={
                    "rounded-lg border p-3 text-left transition-colors " +
                    (selected
                      ? "border-brand bg-brand-soft/40"
                      : "border-border bg-card hover:bg-surface")
                  }
                >
                  <div className="font-bold">{p.label}</div>
                  <div className="mt-1 text-xs text-muted">{p.short}</div>
                </button>
              );
            })}
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground-muted">
            {active.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted">
              샘플 mcp.json (키는 위에서 발급 후 교체)
            </div>
            <pre className="overflow-x-auto rounded-md bg-surface p-3 text-xs">
              {sampleSnippet}
            </pre>
            <Button
              type="button"
              size="sm"
              variant="subtle"
              onClick={async () => {
                await copyText(sampleSnippet);
                setCopiedPrompt("snippet");
                window.setTimeout(() => setCopiedPrompt(null), 2000);
              }}
            >
              {copiedPrompt === "snippet" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              샘플 JSON 복사
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">개인정보·컴플라이언스</span>
          </div>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground-muted">
            {MCP_PRIVACY_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">OpenCrab MCP와 차이</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {MCP_VS_OPENCRAB.map((row) => (
              <div
                key={row.label}
                className="rounded-md border border-border px-3 py-3 text-sm"
              >
                <div className="font-semibold">{row.label}</div>
                <dl className="mt-2 space-y-1 text-xs text-muted">
                  <div>
                    <dt className="inline font-medium text-foreground-muted">
                      키:{" "}
                    </dt>
                    <dd className="inline">
                      <code className="rounded bg-surface px-1">{row.key}</code>
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground-muted">
                      용도:{" "}
                    </dt>
                    <dd className="inline">{row.use}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground-muted">
                      플랜:{" "}
                    </dt>
                    <dd className="inline">{row.plan}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            일상적인 보도자료·피치 워크플로는 <strong>CrabPitch MCP</strong>를
            쓰고, 서버가 기자 DB를 동기화할 때만 OpenCrab을 사용합니다.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={CRABPITCH_SKILL_REPO_URL} target="_blank" rel="noreferrer">
              <Button type="button" size="sm" variant="subtle">
                공개 스킬 GitHub
              </Button>
            </a>
            <a href={CRABPITCH_MCP_DOCS_URL} target="_blank" rel="noreferrer">
              <Button type="button" size="sm" variant="ghost">
                MCP 설정 가이드
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** 대시보드용 요약 카드 */
export function McpDashboardCard() {
  const access = useQuery(api.userMcpKeys.getAccess);
  const keys = useQuery(api.userMcpKeys.list);

  if (access === undefined) {
    return <div className="h-28 animate-pulse rounded-lg bg-surface" />;
  }

  const activeCount = keys?.filter((k) => !k.revoked).length ?? 0;

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">CrabPitch MCP</span>
            <Badge variant={access.allowed ? "brand" : "outline"}>
              {access.allowed ? "유료 활성" : "유료 전용"}
            </Badge>
          </div>
          <Link href="/ai">
            <Button type="button" size="sm" variant="subtle">
              자세히 · 키 관리
            </Button>
          </Link>
        </div>
        <p className="text-sm text-foreground-muted">
          Claude · ChatGPT · Gemini · Cursor에 플러그인으로 붙여 기자 매칭·메일
          템플릿·회신 분류를 실행합니다. 도구 {MCP_TOOLS.length}종 · 현재 플랜{" "}
          <strong className="text-foreground">{access.plan}</strong>
          {access.allowed ? ` · 활성 키 ${activeCount}개` : ""}.
        </p>
        <ul className="grid gap-1 text-xs text-muted sm:grid-cols-2">
          {MCP_TOOLS.map((t) => (
            <li key={t.name}>
              <code className="rounded bg-surface px-1">{t.name}</code> —{" "}
              {t.title}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{access.message}</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={CRABPITCH_SKILL_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-brand underline underline-offset-2"
          >
            공개 스킬 GitHub
          </a>
          <span className="text-xs text-muted">·</span>
          <a
            href={CRABPITCH_MCP_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline underline-offset-2 hover:text-brand"
          >
            MCP 가이드
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
