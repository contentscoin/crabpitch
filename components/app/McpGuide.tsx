"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Check, Copy, Plug, Shield } from "lucide-react";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  MCP_PLATFORMS,
  MCP_PRIVACY_RULES,
  MCP_TOOLS,
} from "@/lib/mcpGuide";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function McpGuidePanel() {
  const access = useQuery(api.userMcpKeys.getAccess);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [platform, setPlatform] = useState<(typeof MCP_PLATFORMS)[number]["id"]>(
    "claude",
  );

  const active =
    MCP_PLATFORMS.find((p) => p.id === platform) ?? MCP_PLATFORMS[0]!;

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
            <Plug className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">내 AI에 붙이기</span>
            {access && (
              <Badge variant={access.allowed && access.lockedSkills.length === 0 ? "brand" : "outline"}>
                {!access.allowed
                  ? "사용 불가"
                  : access.lockedSkills.length === 0
                    ? "사용 가능"
                    : "보도자료 작성만"}
              </Badge>
            )}
          </div>
          <p className="text-sm text-foreground-muted">
            이미 쓰는 Claude·ChatGPT·Gemini·Cursor 채팅에서 기자 찾기, 메일 초안,
            회신 분류를 바로 요청할 수 있습니다. 연결 키만 한 번 등록하면 됩니다.
          </p>
          {access?.allowed && access.lockedSkills.length > 0 && (
            <p className="text-xs text-foreground-muted">
              지금 Free 플랜입니다. 채팅에서는 <b className="text-foreground">보도자료 작성</b> 도구만
              열립니다. 기자 매칭·메일 템플릿·회신 분류는 <b className="text-foreground">이 웹앱에서 지금도 무료로</b>{" "}
              쓸 수 있고,{" "}
              <Link href="/settings" className="underline underline-offset-2">
                Solo 이상으로 바꾸면
              </Link>{" "}
              채팅에서도 열립니다.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <span className="text-sm font-semibold">무엇을 할 수 있나요</span>
          <div className="grid gap-3 sm:grid-cols-2">
            {MCP_TOOLS.map((tool) => (
              <div
                key={tool.name}
                className="rounded-md border border-border px-3 py-3"
              >
                <div className="text-sm font-semibold text-foreground">
                  {tool.title}
                </div>
                <p className="mt-1 text-xs text-foreground-muted">
                  {tool.description}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="subtle"
                  className="mt-2"
                  onClick={() => copyPrompt(tool.name, tool.examplePrompt)}
                >
                  {copiedPrompt === tool.name ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  이렇게 말해보세요
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <span className="text-sm font-semibold">어디에 연결하나요</span>
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
          <p className="text-xs text-muted">
            {active.copyHint === "json"
              ? "키를 만든 뒤 「설정 복사」를 쓰면 됩니다."
              : "키를 만든 뒤 「연결 주소 복사」를 쓰면 됩니다."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">알아두면 좋아요</span>
          </div>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground-muted">
            {MCP_PRIVACY_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/** 대시보드·설정용 요약 */
export function McpDashboardCard() {
  const access = useQuery(api.userMcpKeys.getAccess);
  const keys = useQuery(api.userMcpKeys.list);

  if (access === undefined) {
    return <Skeleton className="h-28" />;
  }

  const activeCount = keys?.filter((k) => !k.revoked).length ?? 0;

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">내 AI 연결</span>
            <Badge variant={access.allowed && access.lockedSkills.length === 0 ? "brand" : "outline"}>
              {!access.allowed
                ? "사용 불가"
                : access.lockedSkills.length === 0
                  ? "사용 가능"
                  : "보도자료 작성만"}
            </Badge>
          </div>
          <Link href="/ai" className={buttonClasses({ size: "sm", variant: "subtle" })}>
            {access.allowed ? "연결 관리" : "자세히 보기"}
          </Link>
        </div>
        <p className="text-sm text-foreground-muted">
          {access.lockedSkills.length === 0
            ? "Claude·ChatGPT·Gemini·Cursor에서 기자 찾기·메일 초안·회신 분류를 요청할 수 있습니다."
            : "Claude·ChatGPT·Gemini·Cursor에서 보도자료 작성을 요청할 수 있습니다. 기자 찾기·메일 초안·회신 분류는 이 웹앱에서 쓰세요."}
          {access.allowed
            ? activeCount > 0
              ? ` 연결 ${activeCount}개.`
              : " 아직 연결 키가 없습니다."
            : " 이 플랜에서는 연결 키를 만들 수 없습니다."}
        </p>
      </CardContent>
    </Card>
  );
}
