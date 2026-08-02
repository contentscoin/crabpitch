"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Building2, Copy, KeyRound, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { toUserMessage } from "@/lib/errorMessage";
import { PageHeader } from "@/components/app/bits";

export default function AgencyPage() {
  const toast = useToast();
  const context = useQuery(api.agency.getActiveContext);
  const agencies = useQuery(api.agency.listMine);
  const createAgency = useMutation(api.agency.create);
  const createClient = useMutation(api.agency.createClient);
  const setActive = useMutation(api.agency.setActiveContext);
  const addMember = useMutation(api.agency.addMemberByEmail);
  const createApiKey = useMutation(api.agency.createApiKey);
  const revokeApiKey = useMutation(api.agency.revokeApiKey);

  const activeAgencyId = context?.agency?._id;
  const clients = useQuery(
    api.agency.listClients,
    activeAgencyId ? { agencyId: activeAgencyId } : "skip",
  );
  const members = useQuery(
    api.agency.listMembers,
    activeAgencyId ? { agencyId: activeAgencyId } : "skip",
  );
  const apiKeys = useQuery(
    api.agency.listApiKeys,
    activeAgencyId ? { agencyId: activeAgencyId } : "skip",
  );

  const [agencyName, setAgencyName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [keyName, setKeyName] = useState("default");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isAgencyPlan = context?.plan === "agency";
  const myRole = useMemo(() => {
    if (!agencies || !activeAgencyId) return null;
    const row = agencies.find((a) => a && a._id === activeAgencyId);
    return row?.role ?? null;
  }, [agencies, activeAgencyId]);

  /**
   * 공통 실행 래퍼.
   *
   * 기존에는 성공 문구와 실패 문구를 같은 `msg` 상태에 담아 회색 텍스트로 렌더했다 —
   * 사용자가 색으로 성공·실패를 구분할 수 없었다. 토스트로 분리한다.
   */
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title="에이전시"
        description="멀티 클라이언트 워크스페이스와 REST API 키를 관리합니다. Agency 플랜 전용."
      />

      {!isAgencyPlan && (
        <Card>
          <CardContent className="pt-6 text-sm text-foreground-muted">
            현재 플랜은 <b>{context?.plan ?? "…"}</b>입니다. 설정에서{" "}
            <b>Agency</b>로 전환한 뒤 워크스페이스를 만들 수 있습니다.
          </CardContent>
        </Card>
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Building2 className="h-5 w-5" /> 워크스페이스
        </h2>
        <Card>
          <CardContent className="space-y-4 pt-6">
            {agencies === undefined ? (
              <Skeleton className="h-16" />
            ) : agencies.length === 0 ? (
              <p className="text-sm text-muted">아직 에이전시가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {agencies.map((a) =>
                  a ? (
                    <li
                      key={a._id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <div>
                        <span className="font-semibold">{a.name}</span>
                        <Badge className="ml-2" variant="outline">
                          {a.role}
                        </Badge>
                        {activeAgencyId === a._id && (
                          <Badge className="ml-1" variant="brand">
                            활성
                          </Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={activeAgencyId === a._id ? "subtle" : "brand"}
                        disabled={busy || activeAgencyId === a._id}
                        onClick={() =>
                          run("활성 에이전시를 바꿨습니다.", async () => {
                            await setActive({ agencyId: a._id });
                          })
                        }
                      >
                        선택
                      </Button>
                    </li>
                  ) : null,
                )}
              </ul>
            )}

            {isAgencyPlan && (
              <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
                <div className="min-w-[200px] flex-1">
                  <Label htmlFor="an">새 에이전시 이름</Label>
                  <Input
                    id="an"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    placeholder="예: 홍보파트너스"
                  />
                </div>
                <Button
                  disabled={busy || agencyName.trim().length < 2}
                  onClick={() =>
                    run("에이전시를 만들었습니다.", async () => {
                      await createAgency({ name: agencyName });
                      setAgencyName("");
                    })
                  }
                >
                  <Plus className="h-4 w-4" /> 만들기
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {activeAgencyId && (
        <>
          <section>
            <h2 className="mb-3 text-lg font-bold">클라이언트</h2>
            <Card>
              <CardContent className="space-y-4 pt-6">
                {clients === undefined ? (
                  <Skeleton className="h-16" />
                ) : clients.length === 0 ? (
                  <p className="text-sm text-muted">클라이언트를 추가하세요.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {clients.map((c) => (
                      <li key={c._id} className="flex items-center justify-between py-2.5">
                        <div>
                          <div className="font-semibold">{c.name}</div>
                          {c.contactEmail && (
                            <div className="text-xs text-muted">{c.contactEmail}</div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={
                            context?.client?._id === c._id ? "subtle" : "brand"
                          }
                          disabled={busy}
                          onClick={() =>
                            run(`클라이언트 「${c.name}」로 전환했습니다.`, async () => {
                              await setActive({
                                agencyId: activeAgencyId,
                                clientId: c._id,
                              });
                            })
                          }
                        >
                          {context?.client?._id === c._id ? "작업 중" : "이 클라이언트로"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="cn">클라이언트명</Label>
                    <Input
                      id="cn"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ce">연락 이메일 (선택)</Label>
                    <Input
                      id="ce"
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  disabled={busy || !clientName.trim()}
                  onClick={() =>
                    run("클라이언트를 추가했습니다.", async () => {
                      await createClient({
                        agencyId: activeAgencyId,
                        name: clientName,
                        contactEmail: clientEmail || undefined,
                      });
                      setClientName("");
                      setClientEmail("");
                    })
                  }
                >
                  <Plus className="h-4 w-4" /> 클라이언트 추가
                </Button>
                {context?.client && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run("클라이언트 스코프를 해제했습니다.", async () => {
                        await setActive({ agencyId: activeAgencyId });
                      })
                    }
                  >
                    클라이언트 선택 해제
                  </Button>
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <Users className="h-5 w-5" /> 멤버
            </h2>
            <Card>
              <CardContent className="space-y-4 pt-6">
                {members === undefined ? (
                  <Skeleton className="h-12" />
                ) : (
                  <ul className="divide-y divide-border">
                    {members.map((m) => (
                      <li key={m._id} className="flex justify-between py-2 text-sm">
                        <span>
                          {m.name || m.email || m.userId}
                          <span className="ml-2 text-muted">{m.email}</span>
                        </span>
                        <Badge variant="outline">{m.role}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {(myRole === "owner" || myRole === "admin") && (
                  <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
                    <div className="min-w-[220px] flex-1">
                      <Label htmlFor="me">멤버 이메일</Label>
                      <Input
                        id="me"
                        type="email"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        placeholder="이미 가입된 계정"
                      />
                    </div>
                    <Button
                      disabled={busy || !memberEmail.trim()}
                      onClick={() =>
                        run("멤버를 추가했습니다.", async () => {
                          await addMember({
                            agencyId: activeAgencyId,
                            email: memberEmail,
                            role: "member",
                          });
                          setMemberEmail("");
                        })
                      }
                    >
                      멤버 초대
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {(myRole === "owner" || myRole === "admin") && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <KeyRound className="h-5 w-5" /> REST API 키
              </h2>
              <Card>
                <CardContent className="space-y-4 pt-6">
                  <p className="text-xs text-muted">
                    Bearer <code className="rounded bg-surface px-1">cp_live_…</code> 로
                    Convex 사이트 URL의{" "}
                    <code className="rounded bg-surface px-1">/api/v1/*</code> 를 호출합니다.
                    원문은 발급 시 한 번만 표시됩니다.
                  </p>
                  {newKey && (
                    <div className="rounded-md border border-brand bg-brand-soft/40 p-3 text-sm">
                      <div className="mb-1 font-semibold">새 API 키 (지금만 복사)</div>
                      <code className="break-all text-xs">{newKey}</code>
                      <Button
                        size="sm"
                        variant="subtle"
                        className="mt-2"
                        icon={Copy}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(newKey);
                            toast.success("클립보드에 복사했습니다.");
                          } catch (e) {
                            // 권한 거부·비보안 컨텍스트에서 실패한다 — 조용히 넘기면
                            // 사용자는 복사됐다고 믿고 키를 잃는다(지금만 볼 수 있는 값이다).
                            toast.error(toUserMessage(e));
                          }
                        }}
                      >
                        복사
                      </Button>
                    </div>
                  )}
                  {apiKeys === undefined ? (
                    <Skeleton className="h-12" />
                  ) : apiKeys.length === 0 ? (
                    <p className="text-sm text-muted">발급된 키가 없습니다.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {apiKeys.map((k) => (
                        <li key={k._id} className="flex items-center justify-between py-2.5">
                          <div>
                            <div className="font-semibold">{k.name}</div>
                            <div className="text-xs text-muted tabular-nums">
                              {k.keyPrefix}… {k.revoked ? "· 폐기됨" : ""}
                            </div>
                          </div>
                          {!k.revoked && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                run("키를 폐기했습니다.", async () => {
                                  await revokeApiKey({
                                    keyId: k._id as Id<"agencyApiKeys">,
                                  });
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
                    <div className="min-w-[160px] flex-1">
                      <Label htmlFor="kn">키 이름</Label>
                      <Input
                        id="kn"
                        value={keyName}
                        onChange={(e) => setKeyName(e.target.value)}
                      />
                    </div>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run("API 키를 발급했습니다.", async () => {
                          const res = await createApiKey({
                            agencyId: activeAgencyId,
                            name: keyName,
                          });
                          setNewKey(res.apiKey);
                        })
                      }
                    >
                      <Plus className="h-4 w-4" /> 키 발급
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
