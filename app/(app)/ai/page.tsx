"use client";

import { Bot } from "lucide-react";
import { PageHeader } from "@/components/app/bits";
import { ByoAiConnectPanel } from "@/components/app/ByoAiConnect";
import { ByoCliSetupPanel } from "@/components/app/ByoCliSetup";

export default function AiHubPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title="내 AI 연동"
        description="본인 ChatGPT · Claude · Gemini CLI/앱으로 크랩피치 스킬·MCP를 실행합니다. 서비스 API 키가 아니라 사용자가 이미 쓰는 AI를 그대로 활용합니다."
      />

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground-muted">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div>
          <p className="font-semibold text-foreground">권장 순서</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>아래에서 CLI 설치 스크립트를 실행해 브라우저 로그인 창을 완료합니다.</li>
            <li>스킬 프롬프트를 복사한 뒤 CLI 또는 웹/앱 채팅에 붙여넣습니다.</li>
          </ol>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">1. CLI 설치 &amp; 로그인 창</h2>
        <ByoCliSetupPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">2. 보도자료 스킬 실행</h2>
        <ByoAiConnectPanel skill="press-release-writer" />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">3. 프레스킷 스킬 실행</h2>
        <ByoAiConnectPanel skill="media-kit-builder" compact />
      </section>
    </div>
  );
}
