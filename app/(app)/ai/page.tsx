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
        title="내 AI"
        description="쓰는 Claude·ChatGPT·Gemini·Cursor에 크랩피치를 연결해 기자 찾기와 메일 초안을 요청하세요. 발송은 이 웹앱에서만 합니다."
      />

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground-muted">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div>
          <p className="font-semibold text-foreground">이렇게 쓰세요</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>연결 키를 만듭니다. (Solo 이상)</li>
            <li>쓰는 AI에 연결 주소를 붙여넣습니다.</li>
            <li>채팅에서 「기자 찾아줘」「메일 초안 만들어줘」라고 말합니다.</li>
            <li>실제 발송은 캠페인·Gmail 연동에서만 진행합니다.</li>
          </ol>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">1. 연결 키</h2>
        <UserMcpKeysPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">2. 사용 안내</h2>
        <McpGuidePanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">3. CLI 설치 (선택)</h2>
        <ByoCliSetupPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">4. 보도자료 스킬</h2>
        <ByoAiConnectPanel skill="press-release-writer" />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">5. 프레스킷 스킬</h2>
        <ByoAiConnectPanel skill="media-kit-builder" compact />
      </section>
    </div>
  );
}
