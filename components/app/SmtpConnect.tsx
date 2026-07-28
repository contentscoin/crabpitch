"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AlertCircle, Check, ExternalLink, Server } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { detectSmtpProvider } from "@/convex/lib/smtpProviders";

/**
 * SMTP 발신 계정 연결.
 *
 * 사용자가 입력할 것은 **이메일과 비밀번호 둘뿐**이어야 한다. 서버 주소·포트·보안 방식은
 * 도메인으로 판별한다(`convex/lib/smtpProviders` — 서버와 같은 표를 쓴다).
 *
 * "저장됨"과 "실제로 붙는다"는 다르다. 저장 직후 연결 테스트를 돌려 결과를 그대로 보여
 * 준다 — 테스트 없이 연결됨으로 표시하면 사용자는 캠페인 발송이 실패할 때까지 모른다.
 */
export function SmtpConnectPanel() {
  const conn = useQuery(api.smtpAccounts.getConnection);
  const save = useMutation(api.smtpAccounts.saveAccount);
  const disconnect = useMutation(api.smtpAccounts.disconnect);
  const test = useAction(api.smtpActions.testConnection);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const connected = conn?.connected === true;

  useEffect(() => {
    if (conn?.connected) {
      setEmail(conn.email);
      setFromName(conn.fromName ?? "");
      setHost(conn.host);
      setPort(String(conn.port));
      setUsername(conn.username ?? "");
    }
  }, [conn]);

  // 서버와 같은 판별 표를 쓴다 — 화면과 저장값이 어긋날 여지를 없앤다.
  const preset = useMemo(() => detectSmtpProvider(email), [email]);
  // 회사 도메인은 host를 자동으로 알아낼 수 없다. 미리 펼쳐 두어 헤매지 않게 한다.
  const needsManualHost = preset.id === "custom" && email.includes("@");

  async function onSave() {
    setBusy(true);
    setMsg(null);
    try {
      await save({
        email: email.trim(),
        // 빈 값이면 서버가 기존 비밀번호를 유지한다(표시명만 바꿀 때).
        password: password.trim() || undefined,
        fromName: fromName.trim() || undefined,
        ...(advanced || needsManualHost
          ? {
              host: host.trim() || undefined,
              port: port.trim() ? Number(port) : undefined,
              // 465는 접속부터 TLS, 그 외는 STARTTLS 승격이 관례다.
              secure: port.trim() ? Number(port) === 465 : undefined,
              username: username.trim() || undefined,
            }
          : {}),
      });
      setPassword("");
      // 저장 직후 실제로 붙는지 확인한다. 여기서 실패해도 설정은 남는다 — 사용자가 고칠 수 있게.
      const result = await test({});
      setMsg({ ok: result.ok, text: result.message });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장하지 못했습니다." });
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    setBusy(true);
    setMsg(null);
    try {
      const result = await test({});
      setMsg({ ok: result.ok, text: result.message });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "연결하지 못했습니다." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface">
              <Server className="h-5 w-5 text-muted" />
            </div>
            <div>
              <div className="font-semibold">
                {connected ? `${conn.email} · ${conn.providerLabel}` : "발신 메일 연결 (SMTP)"}
              </div>
              <div className="text-xs text-muted">
                Gmail·네이버·다음·아웃룩·회사 메일 — 제공자를 가리지 않습니다. 발송은 본인
                메일함에서 나가고, 보낸 메일은 본인 &lsquo;보낸편지함&rsquo;에 남습니다.
              </div>
            </div>
          </div>
          {connected &&
            (conn.lastStatus === "ok" ? (
              <Badge variant="success">
                <Check className="h-3 w-3" /> 연결 확인됨
              </Badge>
            ) : conn.lastStatus === "error" ? (
              <Badge variant="danger">
                <AlertCircle className="h-3 w-3" /> 연결 실패
              </Badge>
            ) : (
              // 저장만 하고 확인 전인 상태를 "연결됨"으로 보이게 두지 않는다.
              <Badge variant="warning">확인 전</Badge>
            ))}
        </div>

        {connected && conn.lastStatus === "error" && conn.lastError && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{conn.lastError}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="smtp-email">발신 이메일</Label>
            <Input
              id="smtp-email"
              type="email"
              autoComplete="username"
              placeholder="hong@company.co.kr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="smtp-password">
              비밀번호{connected ? " (변경할 때만 입력)" : ""}
            </Label>
            <Input
              id="smtp-password"
              type="password"
              autoComplete="new-password"
              placeholder={connected ? "그대로 두면 유지됩니다" : "앱 비밀번호 또는 계정 비밀번호"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {preset.credentialNote && (
          <p className="flex flex-wrap items-center gap-2 rounded-md bg-surface px-3 py-2 text-xs text-foreground-muted">
            <span>
              <b>{preset.label}</b> — {preset.credentialNote.replace(/\*\*/g, "")}
            </span>
            {preset.setupUrl && (
              <a
                className="inline-flex items-center gap-1 font-semibold text-brand underline"
                href={preset.setupUrl}
                target="_blank"
                rel="noreferrer"
              >
                설정 페이지 열기 <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </p>
        )}

        <div>
          <Label htmlFor="smtp-fromname">발신자 표시명 (선택)</Label>
          <Input
            id="smtp-fromname"
            placeholder="크랩피치 홍보팀"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
          />
        </div>

        {(advanced || needsManualHost) && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="smtp-host">SMTP 서버</Label>
              <Input
                id="smtp-host"
                placeholder={preset.host || "mail.company.co.kr"}
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="smtp-port">포트</Label>
              <Input
                id="smtp-port"
                inputMode="numeric"
                placeholder={String(preset.port)}
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="smtp-username">로그인 ID (발신 주소와 다를 때만)</Label>
              <Input
                id="smtp-username"
                autoComplete="off"
                placeholder={email || "hong"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted sm:col-span-3">
              465는 접속부터 TLS, 587은 STARTTLS로 자동 설정됩니다. 회사 메일 주소는 보통{" "}
              <code className="rounded bg-surface px-1">mail.도메인</code> 또는{" "}
              <code className="rounded bg-surface px-1">smtp.도메인</code>입니다.
            </p>
          </div>
        )}

        {msg && (
          <p
            className={
              msg.ok
                ? "rounded-md bg-success/10 px-3 py-2 text-xs text-success"
                : "rounded-md bg-danger/10 px-3 py-2 text-xs text-danger"
            }
          >
            {msg.text}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="brand" disabled={busy || !email.trim()} onClick={onSave}>
            {busy ? "확인 중…" : connected ? "저장하고 다시 확인" : "저장하고 연결 확인"}
          </Button>
          {connected && (
            <Button variant="subtle" disabled={busy} onClick={onTest}>
              연결 테스트
            </Button>
          )}
          {!needsManualHost && (
            <Button variant="ghost" onClick={() => setAdvanced((v) => !v)}>
              {advanced ? "서버 설정 접기" : "서버 직접 설정"}
            </Button>
          )}
          {connected && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await disconnect({});
                  setPassword("");
                  setMsg({ ok: true, text: "메일 계정 연결을 해제했습니다." });
                } finally {
                  setBusy(false);
                }
              }}
            >
              연결 해제
            </Button>
          )}
        </div>

        <p className="text-xs text-muted">
          비밀번호는 암호화해서 보관하며, 화면·API 어디로도 다시 내보내지 않습니다. 발송에
          필요한 순간에만 복호화합니다.
        </p>
      </CardContent>
    </Card>
  );
}
