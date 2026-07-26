"use client";

import { Bot } from "lucide-react";
import { PageHeader } from "@/components/app/bits";
import { AiProviderKeysPanel } from "@/components/app/AiProviderKeys";
import { ByoAiConnectPanel } from "@/components/app/ByoAiConnect";
import { ByoCliSetupPanel } from "@/components/app/ByoCliSetup";
import { UserMcpKeysPanel } from "@/components/app/UserMcpKeys";
import { McpGuidePanel } from "@/components/app/McpGuide";

export default function AiHubPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader
        title="내 AI"
        description="GPT·Claude·Gemini를 크랩피치에 연결하는 두 가지 방법 — ① API 키로 웹에서 바로 실행, ② 쓰던 AI 채팅에 스킬·MCP 연결. 발송은 이 웹앱에서만 합니다."
      />

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground-muted">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div>
          <p className="font-semibold text-foreground">가장 빠른 길 (2분)</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>아래 1번에서 GPT·Claude·Gemini 중 하나의 API 키를 등록합니다.</li>
            <li>「연결 테스트」로 확인합니다.</li>
            <li>
              끝. 이제 보도자료 작성·메일 초안 화면의 「AI로 다듬기」가 웹에서 바로
              작동합니다.
            </li>
          </ol>
          <p className="mt-2 text-xs">
            API 키 없이 구독형 ChatGPT·Claude·Gemini만 쓰고 있다면 2~3번(스킬·MCP)으로
            연결하세요.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">1. 웹에서 바로 쓰기 — API 키 연결</h2>
        <AiProviderKeysPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">2. 쓰던 AI 채팅에 연결 — MCP 키 (Solo 이상)</h2>
        <UserMcpKeysPanel />
        <McpGuidePanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">3. 스킬로 쓰기 — 보도자료·프레스킷</h2>
        <p className="text-sm text-foreground-muted">
          버튼 한 번으로 스킬 프롬프트가 복사되고 선택한 AI가 열립니다. 붙여넣기만 하면
          바로 시작합니다.
        </p>
        <ByoAiConnectPanel skill="press-release-writer" />
        <ByoAiConnectPanel skill="media-kit-builder" compact />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">4. CLI 설치 (선택)</h2>
        <ByoCliSetupPanel />
      </section>
    </div>
  );
}
