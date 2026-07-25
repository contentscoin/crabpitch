"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Terminal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  buildInstallLoginBlock,
  CLI_SETUPS,
  detectHostOsFromUserAgent,
  type HostOs,
} from "@/convex/lib/byoCli";
import type { AiProviderId } from "@/convex/lib/byoAi";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** PC에 공식 CLI 설치 + 브라우저 로그인 창을 띄우는 안내 패널 */
export function ByoCliSetupPanel() {
  const [os, setOs] = useState<HostOs>("unknown");
  const [provider, setProvider] = useState<AiProviderId>("claude");
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setOs(detectHostOsFromUserAgent(ua));
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(ua));
  }, []);

  const block = useMemo(
    () => buildInstallLoginBlock(provider, os === "unknown" ? "macos" : os),
    [provider, os],
  );

  const scriptHref =
    os === "windows"
      ? "/crabpitch-byo-ai-setup.ps1"
      : "/crabpitch-byo-ai-setup.sh";
  const scriptName =
    os === "windows"
      ? "crabpitch-byo-ai-setup.ps1"
      : "crabpitch-byo-ai-setup.sh";

  const runHint =
    os === "windows"
      ? `Set-ExecutionPolicy -Scope Process Bypass; .\\${scriptName} -Provider ${provider}`
      : `chmod +x ${scriptName} && ./${scriptName} ${provider}`;

  if (isMobile) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5 text-sm text-foreground-muted">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Terminal className="h-4 w-4" /> CLI 설치
          </div>
          <p>
            CLI는 PC/데스크톱용입니다. 모바일에서는 위 「내 AI에서 열기」로
            ChatGPT·Claude·Gemini 앱을 사용하세요.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-foreground-muted">
        <p className="font-semibold text-foreground">웹이 PC에 CLI를 직접 깔 수는 없습니다</p>
        <p className="mt-1">
          브라우저 보안상 사이트는 사용자 컴퓨터에 프로그램을 자동 설치할 수 없습니다.
          아래 스크립트/명령을 <b>터미널에서 실행</b>하면 공식 CLI가 설치되고, 곧바로
          <b>브라우저 로그인 창</b>이 열립니다.
        </p>
        <p className="mt-1 text-xs">
          감지된 OS:{" "}
          <Badge variant="outline">{os === "unknown" ? "자동(기본 macOS/Linux)" : os}</Badge>
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(CLI_SETUPS) as AiProviderId[]).map((id) => {
          const s = CLI_SETUPS[id];
          const selected = provider === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setProvider(id)}
              className={
                "rounded-lg border p-3 text-left text-sm transition-colors " +
                (selected
                  ? "border-brand bg-brand-soft/40"
                  : "border-border bg-card hover:bg-surface")
              }
            >
              <div className="font-bold">{s.label}</div>
              <div className="mt-1 text-xs text-muted">
                {s.cliName} · 로그인 시 브라우저 OAuth
              </div>
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="text-sm font-semibold">{block.title}</div>
          <pre className="overflow-x-auto rounded-md bg-surface p-3 text-xs leading-relaxed">
            {block.command}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                await copyText(block.command);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              명령 복사
            </Button>
            <a href={scriptHref} download={scriptName}>
              <Button type="button" size="sm" variant="subtle">
                <Download className="h-4 w-4" /> 설치 스크립트 받기
              </Button>
            </a>
            <a
              href={CLI_SETUPS[provider].docsUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Button type="button" size="sm" variant="ghost">
                공식 문서
              </Button>
            </a>
          </div>
          <div className="rounded-md border border-border bg-surface/60 p-3 text-xs">
            <div className="font-semibold text-foreground">스크립트 실행 예</div>
            <pre className="mt-1 overflow-x-auto">{runHint}</pre>
            <p className="mt-2 text-muted">
              실행 중 브라우저가 열리면 ChatGPT / Claude / Google 계정으로 로그인하세요.
              Gemini는 메뉴에서 「Sign in with Google」을 고르면 됩니다.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              const res = await fetch(scriptHref);
              const text = await res.text();
              downloadText(scriptName, text);
            }}
          >
            <Download className="h-4 w-4" /> 스크립트 다시 저장
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
