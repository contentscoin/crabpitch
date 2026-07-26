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

  const [name, setName] = useState("내 Claude");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    apiKey: string;
    mcpUrl: string;
    mcpSnippet: string;
  } | null>(null);
  const [copied, setCopied] = useState<"key" | "snippet" | "url" | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function markCopied(kind: "key" | "snippet" | "url") {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const result = await create({ name: name.trim() || "기본" });
      setCreated({
        apiKey: result.apiKey,
        mcpUrl: result.mcpUrl,
        mcpSnippet: result.mcpSnippet,
      });
      setShowAdvanced(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(keyId: Id<"userMcpKeys">) {
    if (
      !window.confirm(
        "이 연결을 끊을까요? 등록해 둔 AI에서는 더 이상 동작하지 않습니다.",
      )
    ) {
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
            <span className="text-sm font-semibold">연결 키</span>
            <Badge variant="outline">Solo 이상</Badge>
          </div>
          <p className="text-sm text-foreground-muted">
            내 AI에 크랩피치를 붙이려면 Solo / Growth / Agency 플랜이 필요합니다.
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
            <span className="text-sm font-semibold">연결 키 만들기</span>
            <Badge variant="brand">{access.plan}</Badge>
            <Badge variant={access.activeKeyCount >= access.maxKeys ? "warning" : "outline"}>
              {access.activeKeyCount}/{access.maxKeys}개 사용 중
            </Badge>
          </div>
          <p className="text-sm text-foreground-muted">
            키를 만든 뒤 연결 주소를 복사해 Claude·ChatGPT·Gemini·Cursor에
            붙여넣으면 됩니다. 1인당 최대 {access.maxKeys}개까지 만들 수 있습니다.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <Label htmlFor="mcp-key-name">이름 (구분용)</Label>
              <Input
                id="mcp-key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="내 Claude"
              />
            </div>
            <Button
              type="button"
              disabled={busy || access.activeKeyCount >= access.maxKeys}
              onClick={onCreate}
            >
              {busy ? "만드는 중…" : "키 만들기"}
            </Button>
          </div>
          {access.activeKeyCount >= access.maxKeys && (
            <p className="text-xs text-muted">
              상한에 도달했습니다. 아래 「내 연결」에서 안 쓰는 키를 끊으면 새로 만들 수
              있습니다.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </CardContent>
      </Card>

      {created && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <p className="text-sm font-semibold text-foreground">
              아래 정보는 지금만 볼 수 있습니다. 바로 복사해 두세요.
            </p>

            <div className="space-y-2">
              <div className="flex items-center gap-1 text-sm font-medium">
                <Link2 className="h-4 w-4 text-brand" />
                연결 주소
              </div>
              <p className="text-xs text-muted">
                Claude · ChatGPT · Gemini에 이 주소를 붙여넣으세요.
              </p>
              <pre className="overflow-x-auto rounded-md bg-surface p-3 text-xs">
                {created.mcpUrl}
              </pre>
              <Button
                type="button"
                size="sm"
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
                연결 주소 복사
              </Button>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Cursor용 설정</div>
              <p className="text-xs text-muted">
                Cursor를 쓰면 「설정 복사」 후 MCP 설정 파일에 붙여넣으세요.
              </p>
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
                설정 복사
              </Button>
            </div>

            <div>
              <button
                type="button"
                className="text-xs text-muted underline underline-offset-2"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "숨기기" : "키 원문 보기"}
              </button>
              {showAdvanced && (
                <div className="mt-2 space-y-2">
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
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="text-sm font-semibold">내 연결</div>
          {activeKeys.length === 0 ? (
            <p className="text-sm text-muted">아직 만든 연결이 없습니다.</p>
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
                      {new Date(k.createdAt).toLocaleString("ko-KR")}
                      {k.lastUsedAt
                        ? ` · 최근 사용 ${new Date(k.lastUsedAt).toLocaleString("ko-KR")}`
                        : " · 아직 사용 안 함"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => onRevoke(k._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    연결 끊기
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
