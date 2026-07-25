"use client";

import { Bot } from "lucide-react";
import { PageHeader } from "@/components/app/bits";
import { ByoAiConnectPanel } from "@/components/app/ByoAiConnect";
import { ByoCliSetupPanel } from "@/components/app/ByoCliSetup";
import { UserMcpKeysPanel } from "@/components/app/UserMcpKeys";
import { McpGuidePanel } from "@/components/app/McpGuide";

export default function AiHubPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader
        title="내 AI 연동"
        description="본인 ChatGPT · Claude · Gemini · Cursor에 CrabPitch 스킬과 MCP 플러그인을 연결합니다. 서비스 API가 아니라 사용자가 이미 쓰는 AI를 그대로 활용합니다."
      />

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground-muted">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div>
          <p className="font-semibold text-foreground">권장 순서</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>아래 MCP 안내를 읽고 유료 플랜에서 키를 발급합니다.</li>
            <li>Claude / ChatGPT / Gemini / Cursor에 MCP URL·JSON을 등록합니다.</li>
            <li>CLI 로그인 후 스킬 프롬프트를 붙여 보도자료·프레스킷을 작성합니다.</li>
            <li>실제 기자 발송은 이 웹앱 캠페인·Gmail 연동에서만 진행합니다.</li>
          </ol>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">1. MCP 안내 · 도구 · 플랫폼 등록</h2>
        <McpGuidePanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">2. CrabPitch MCP 키 발급 (유료)</h2>
        <UserMcpKeysPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">3. CLI 설치 &amp; 로그인 창</h2>
        <ByoCliSetupPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">4. 보도자료 스킬 실행</h2>
        <ByoAiConnectPanel skill="press-release-writer" />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">5. 프레스킷 스킬 실행</h2>
        <ByoAiConnectPanel skill="media-kit-builder" compact />
      </section>
    </div>
  );
}
