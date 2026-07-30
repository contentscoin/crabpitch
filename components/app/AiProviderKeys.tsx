"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Check, KeyRound, Loader2, Plug2, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";

type LlmProvider = "anthropic" | "openai" | "gemini";

/**
 * GPT·Claude·Gemini API 키를 등록해 웹앱 안에서 AI가 직접 작동하게 하는 패널.
 * 키 원문은 서버에만 저장되고 화면에는 마스킹만 표시된다.
 */
export function AiProviderKeysPanel() {
  const status = useQuery(api.aiKeys.status);
  // 키는 봉인해서 저장한다 — 마스터 키가 없으면 저장 자체가 실패하므로 미리 알린다.
  const integrations = useQuery(api.integrations.getStatus);
  const save = useMutation(api.aiKeys.save);
  const remove = useMutation(api.aiKeys.remove);
  const setPreferred = useMutation(api.aiKeys.setPreferredProvider);
  const test = useAction(api.aiActions.testAiConnection);

  const [editing, setEditing] = useState<LlmProvider | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});

  if (status === undefined) {
    return <div className="h-48 animate-pulse rounded-lg bg-surface" />;
  }

  function note(provider: LlmProvider, ok: boolean, text: string) {
    setNotes((n) => ({ ...n, [provider]: { ok, text } }));
  }

  async function onSave(provider: LlmProvider) {
    setBusy(`save:${provider}`);
    try {
      const res = await save({
        provider,
        apiKey: keyInput,
        model: modelInput.trim() || undefined,
      });
      setEditing(null);
      setKeyInput("");
      setModelInput("");
      if (res.warning) {
        note(provider, false, res.warning);
      } else {
        note(provider, true, "키를 저장했습니다. 「연결 테스트」로 확인해 보세요.");
      }
    } catch (e) {
      note(provider, false, e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function onTest(provider: LlmProvider) {
    setBusy(`test:${provider}`);
    try {
      const res = await test({ provider });
      note(provider, res.ok, res.message);
    } catch (e) {
      note(provider, false, e instanceof Error ? e.message : "테스트에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(provider: LlmProvider) {
    setBusy(`remove:${provider}`);
    try {
      await remove({ provider });
      setNotes((n) => {
        const next = { ...n };
        delete next[provider];
        return next;
      });
    } finally {
      setBusy(null);
    }
  }

  const anyConnected = status.activeProvider !== null;
  const sealingUnavailable = integrations !== undefined && !integrations.smtpEncryptionKeySet;

  return (
    <div className="space-y-4">
      {sealingUnavailable && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-semibold text-warning">지금은 키를 저장할 수 없습니다.</p>
          <p className="mt-1 text-foreground-muted">
            API 키는 암호화해서 보관합니다. 서버에 봉인용 마스터 키(
            <code className="text-xs">SMTP_ENCRYPTION_KEY</code>)가 설정되어 있지 않아 저장이
            실패합니다. 평문으로 대신 저장하지는 않습니다.
          </p>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm">
        <Zap className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div className="text-foreground-muted">
          <p className="font-semibold text-foreground">
            {anyConnected
              ? `연결됨 — 지금은 ${
                  status.providers.find((p) => p.provider === status.activeProvider)?.label ?? ""
                }(으)로 실행합니다.`
              : "API 키 한 개만 등록하면 보도자료 다듬기·메일 개인화가 웹에서 바로 작동합니다."}
          </p>
          <p className="mt-1 text-xs">
            크랩피치는 공용 LLM을 제공하지 않습니다 — 사용한 만큼 본인 계정으로 과금되는
            본인 API 키(BYOK)만 사용합니다. 키는 서버에만 저장되고 화면에는 마스킹으로만
            표시됩니다.
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {status.providers.map((p) => {
          const isEditing = editing === p.provider;
          const n = notes[p.provider];
          const isPreferred = status.preferredProvider === p.provider;
          const isActive = status.activeProvider === p.provider;
          return (
            <Card key={p.provider}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <KeyRound className="h-4 w-4 text-brand" />
                  <span className="text-sm font-bold">{p.label}</span>
                  <span className="text-xs text-muted">{p.vendor}</span>
                  {isActive && <Badge variant="brand">지금 사용 중</Badge>}
                  {p.hasUserKey && !isActive && <Badge variant="outline">연결됨</Badge>}
                  {p.lastStatus === "error" && (
                    <Badge variant="danger">마지막 호출 실패</Badge>
                  )}
                </div>

                {p.hasUserKey && !isEditing && (
                  <p className="text-xs text-muted">
                    키 {p.maskedKey} · 모델 {p.model ?? `${p.defaultModel} (기본)`}
                  </p>
                )}

                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor={`key-${p.provider}`}>API 키</Label>
                      <Input
                        id={`key-${p.provider}`}
                        type="password"
                        autoComplete="off"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder={`${p.keyPrefixHint}… 로 시작하는 키`}
                      />
                      <p className="mt-1 text-xs text-muted">
                        발급:{" "}
                        <a
                          href={p.keyConsoleUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand underline underline-offset-2"
                        >
                          {p.vendor} 콘솔
                        </a>
                      </p>
                    </div>
                    <div>
                      <Label htmlFor={`model-${p.provider}`}>모델 (선택)</Label>
                      <Input
                        id={`model-${p.provider}`}
                        value={modelInput}
                        onChange={(e) => setModelInput(e.target.value)}
                        placeholder={`비우면 ${p.defaultModel}`}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy === `save:${p.provider}` || !keyInput.trim()}
                        onClick={() => onSave(p.provider)}
                      >
                        {busy === `save:${p.provider}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        저장
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="subtle"
                        onClick={() => {
                          setEditing(null);
                          setKeyInput("");
                          setModelInput("");
                        }}
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={p.hasUserKey ? "subtle" : "brand"}
                      onClick={() => {
                        setEditing(p.provider);
                        setKeyInput("");
                        setModelInput(p.model ?? "");
                      }}
                    >
                      <KeyRound className="h-4 w-4" />
                      {p.hasUserKey ? "키 바꾸기" : "키 등록"}
                    </Button>
                    {p.hasUserKey && (
                      <Button
                        type="button"
                        size="sm"
                        variant="subtle"
                        disabled={busy === `test:${p.provider}`}
                        onClick={() => onTest(p.provider)}
                      >
                        {busy === `test:${p.provider}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plug2 className="h-4 w-4" />
                        )}
                        연결 테스트
                      </Button>
                    )}
                    {p.hasUserKey && !isPreferred && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setPreferred({ provider: p.provider })}
                      >
                        기본으로 사용
                      </Button>
                    )}
                    {isPreferred && <Badge variant="brand">기본</Badge>}
                    {p.hasUserKey && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy === `remove:${p.provider}`}
                        onClick={() => onRemove(p.provider)}
                      >
                        <Trash2 className="h-4 w-4" /> 삭제
                      </Button>
                    )}
                  </div>
                )}

                {n && (
                  <p className={`text-xs ${n.ok ? "text-teal" : "text-danger"}`}>{n.text}</p>
                )}
                {!n && p.lastStatus === "error" && p.lastError && (
                  <p className="text-xs text-danger">최근 오류: {p.lastError}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
