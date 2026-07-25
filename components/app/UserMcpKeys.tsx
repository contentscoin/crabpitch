"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Check, Copy, KeyRound, Link2, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function UserMcpKeysPanel() {
  const access = useQuery(api.userMcpKeys.getAccess);
  const keys = useQuery(api.userMcpKeys.list);
  const create = useMutation(api.userMcpKeys.create);
  const revoke = useMutation(api.userMcpKeys.revoke);

  const [name, setName] = useState("claude-desktop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    apiKey: string;
    mcpUrl: string;
    mcpSnippet: string;
  } | null>(null);
  const [copied, setCopied] = useState<"key" | "snippet" | "url" | null>(null);

  async function markCopied(kind: "key" | "snippet" | "url") {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const result = await create({ name: name.trim() || "default" });
      setCreated({
        apiKey: result.apiKey,
        mcpUrl: result.mcpUrl,
        mcpSnippet: result.mcpSnippet,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(keyId: Id<"userMcpKeys">) {
    if (!window.confirm("이 MCP 키를 폐기할까요? 등록된 플러그인이 즉시 실패합니다.")) {
      return;
    }
    await revoke({ keyId });
    if (created) setCreated(null);
  }

  if (access === undefined || keys === undefined) {
    return <div className="h-40 animate-pulse rounded-lg bg-surface" />;
  }

  if (!access.allowed) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">CrabPitch MCP 키</span>
            <Badge variant="outline">유료 전용</Badge>
          </div>
          <p className="text-sm text-foreground-muted">{access.message}</p>
          <p className="text-xs text-muted">
            현재 플랜: <strong>{access.plan}</strong>. Solo / Growth / Agency에서
            Claude · ChatGPT · Gemini · Cursor에 MCP 플러그인을 등록할 수 있습니다.
          </p>
          <Link href="/settings">
            <Button type="button" size="sm" variant="subtle">
              설정에서 플랜 변경
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const activeKeys = keys.filter((k) => !k.revoked);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">CrabPitch MCP 키</span>
            <Badge variant="brand">{access.plan}</Badge>
          </div>
          <p className="text-xs text-muted">
            발급된 <code className="rounded bg-surface px-1">cp_mcp_…</code> 키를
            Claude Desktop / Cursor / ChatGPT 커스텀 커넥터 / Gemini에 등록하세요.
            기자 실명·이메일은 MCP 응답에 포함되지 않습니다.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <Label htmlFor="mcp-key-name">키 이름</Label>
              <Input
                id="mcp-key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="claude-desktop"
              />
            </div>
            <Button type="button" disabled={busy} onClick={onCreate}>
              {busy ? "발급 중…" : "키 발급"}
            </Button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </CardContent>
      </Card>

      {created && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm font-semibold text-foreground">
              키는 지금 한 번만 표시됩니다. 안전한 곳에 복사하세요.
            </p>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted">API Key</div>
              <pre className="overflow-x-auto rounded-md bg-surface p-3 text-xs">
                {created.apiKey}
              </pre>
              <Button
                type="button"
                size="sm"
                variant="subtle"
                onClick={async () => {
                  await copyText(created.apiKey);
                  await markCopied("key");
                }}
              >
                {copied === "key" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                키 복사
              </Button>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs font-medium text-muted">
                <Link2 className="h-3.5 w-3.5" /> MCP URL (키 포함)
              </div>
              <pre className="overflow-x-auto rounded-md bg-surface p-3 text-xs">
                {created.mcpUrl}
              </pre>
              <Button
                type="button"
                size="sm"
                variant="subtle"
                onClick={async () => {
                  await copyText(created.mcpUrl);
                  await markCopied("url");
                }}
              >
                {copied === "url" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                URL 복사
              </Button>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted">
                mcp.json / Claude Desktop 스니펫
              </div>
              <pre className="overflow-x-auto rounded-md bg-surface p-3 text-xs">
                {created.mcpSnippet}
              </pre>
              <Button
                type="button"
                size="sm"
                variant="subtle"
                onClick={async () => {
                  await copyText(created.mcpSnippet);
                  await markCopied("snippet");
                }}
              >
                {copied === "snippet" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                JSON 복사
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="text-sm font-semibold">발급된 키</div>
          {activeKeys.length === 0 ? (
            <p className="text-xs text-muted">아직 활성 키가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {activeKeys.map((k) => (
                <li
                  key={k._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{k.name}</div>
                    <div className="text-xs text-muted">
                      {k.keyPrefix}… ·{" "}
                      {new Date(k.createdAt).toLocaleString("ko-KR")}
                      {k.lastUsedAt
                        ? ` · 최근 사용 ${new Date(k.lastUsedAt).toLocaleString("ko-KR")}`
                        : ""}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => onRevoke(k._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    폐기
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">
            엔드포인트:{" "}
            <code className="rounded bg-surface px-1">
              {access.siteUrl}/api/mcp
            </code>{" "}
            (Bearer) 또는{" "}
            <code className="rounded bg-surface px-1">
              {access.siteUrl}/api/mcp/cp_mcp_…
            </code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
