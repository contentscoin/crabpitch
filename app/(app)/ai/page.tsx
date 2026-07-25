"use client";

import { Bot } from "lucide-react";
import { PageHeader } from "@/components/app/bits";
import { ByoAiConnectPanel } from "@/components/app/ByoAiConnect";

export default function AiHubPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title="내 AI 연동"
        description="본인 ChatGPT · Claude · Gemini 계정으로 크랩피치 스킬·MCP를 실행합니다. 서비스 API 키가 아니라 사용자가 이미 쓰는 AI를 그대로 활용합니다."
      />

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground-muted">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div>
          <p className="font-semibold text-foreground">자동 OAuth 탐색은 지원하지 않습니다</p>
          <p className="mt-1">
            브라우저·앱 보안 모델상 PC/모바일에 설치된 ChatGPT·Claude·Gemini의 로그인
            토큰을 읽어 올 수 없습니다. 대신 해당 앱에 이미 로그인해 두었다면, 아래
            원클릭으로 같은 계정 채팅을 열고 스킬 프롬프트를 붙여 보도자료·프레스킷을
            작성하세요.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">보도자료 작성 스킬</h2>
        <ByoAiConnectPanel skill="press-release-writer" />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">프레스킷(미디어킷) 스킬</h2>
        <ByoAiConnectPanel skill="media-kit-builder" compact />
      </section>
    </div>
  );
}
