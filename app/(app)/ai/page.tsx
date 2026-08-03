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
        description="이미 구독 중인 ChatGPT·Claude·Gemini를 그대로 씁니다 — 쓰던 AI 채팅에 크랩피치를 연결(MCP·스킬)하면 매칭·초안·승인·발송까지 채팅에서 진행됩니다. 발송은 어느 경로든 사용자 확인을 거칩니다."
      />

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground-muted">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div>
          <p className="font-semibold text-foreground">이렇게 쓰세요 (2분)</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>아래 1번에서 연결 키를 만들어 쓰는 AI(ChatGPT·Claude·Gemini)에 등록합니다.</li>
            <li>
              그 채팅에서 「기자 찾아줘」「메일 초안 만들어줘」라고 말합니다 — LLM은 이미
              로그인된 본인 구독으로 실행됩니다.
            </li>
            <li>실제 발송은 크랩피치 캠페인·Gmail 연동에서만 진행합니다.</li>
          </ol>
          <p className="mt-2 text-xs">
            크랩피치는 자체 LLM·공용 API 키를 제공하지 않습니다. 웹 화면 안에서 AI를
            돌리고 싶은 경우에만 3번에서 본인 API 키(선택)를 등록하세요.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">1. 쓰던 AI 채팅에 연결 — MCP</h2>
        <p className="text-sm text-foreground-muted">
          별도 API 키 없이, 이미 구독으로 로그인돼 있는 ChatGPT·Claude·Gemini·Cursor에
          크랩피치 도구를 붙입니다. <b className="text-foreground">무료 플랜은 보도자료 작성</b>
          까지 쓸 수 있고, 기자 찾기·메일 초안·회신 분류는 Solo 이상에서 열립니다
          (이 기능들은 무료 플랜도 웹앱에서는 그대로 이용할 수 있습니다).
        </p>
        <UserMcpKeysPanel />
        <McpGuidePanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">2. 스킬로 쓰기 — 보도자료·프레스킷 (무료)</h2>
        <p className="text-sm text-foreground-muted">
          버튼 한 번으로 스킬 프롬프트가 복사되고 선택한 AI가 열립니다. 붙여넣기만 하면
          바로 시작합니다.
        </p>
        <ByoAiConnectPanel skill="press-release-writer" />
        <ByoAiConnectPanel skill="media-kit-builder" compact />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">3. 웹에서 바로 실행 — 본인 API 키 (선택·고급)</h2>
        <p className="text-sm text-foreground-muted">
          채팅을 오가지 않고 크랩피치 화면 안에서 「AI로 다듬기」를 쓰고 싶다면, 본인
          API 키를 등록하세요. 구독(월정액)과 별개로 사용량만큼 본인에게 과금되는
          키입니다.
        </p>
        <AiProviderKeysPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">4. CLI 설치 (선택)</h2>
        <ByoCliSetupPanel />
      </section>
    </div>
  );
}
