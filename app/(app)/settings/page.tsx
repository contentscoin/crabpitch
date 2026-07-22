"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Mail, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/app/bits";
import { PLANS } from "@/lib/brand";

export default function SettingsPage() {
  const data = useQuery(api.profiles.getMyProfile);
  const usage = useQuery(api.usage.getMyUsage);
  const suppression = useQuery(api.suppression.list);
  const update = useMutation(api.profiles.updateProfile);
  const removeSup = useMutation(api.suppression.remove);

  const [form, setForm] = useState({ companyName: "", senderName: "", contactEmail: "", boilerplate: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.profile) {
      setForm({
        companyName: data.profile.companyName ?? "",
        senderName: data.profile.senderName ?? "",
        contactEmail: data.profile.contactEmail ?? "",
        boilerplate: data.profile.boilerplate ?? "",
      });
    }
  }, [data?.profile?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentPlan = usage?.plan ?? "free";

  async function saveProfile() {
    await update(form);
    setSaved(true);
  }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title="설정" description="발신 아이덴티티·요금제·연동·억제 리스트를 관리합니다." />

      {/* 프로필 */}
      <section>
        <h2 className="mb-3 text-lg font-bold">발신 아이덴티티</h2>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cn">회사/브랜드명</Label>
                <Input id="cn" value={form.companyName} onChange={(e) => { setForm({ ...form, companyName: e.target.value }); setSaved(false); }} />
              </div>
              <div>
                <Label htmlFor="sn">보내는 사람</Label>
                <Input id="sn" value={form.senderName} onChange={(e) => { setForm({ ...form, senderName: e.target.value }); setSaved(false); }} />
              </div>
            </div>
            <div>
              <Label htmlFor="ce">회신용 이메일</Label>
              <Input id="ce" type="email" value={form.contactEmail} onChange={(e) => { setForm({ ...form, contactEmail: e.target.value }); setSaved(false); }} />
            </div>
            <div>
              <Label htmlFor="bp">보일러플레이트 (보도자료 하단 공식 소개)</Label>
              <Textarea id="bp" rows={2} value={form.boilerplate} onChange={(e) => { setForm({ ...form, boilerplate: e.target.value }); setSaved(false); }} />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveProfile}>저장</Button>
              {saved && <span className="text-sm text-success">✓ 저장됨</span>}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 요금제 */}
      <section>
        <h2 className="mb-3 text-lg font-bold">요금제</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => {
            const active = currentPlan === p.id;
            return (
              <div
                key={p.id}
                className={
                  "rounded-lg border p-4 " +
                  (active ? "border-2 border-brand bg-brand-soft/40" : "border-border bg-card")
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold">{p.name}</span>
                  {active && <Badge variant="brand">현재</Badge>}
                </div>
                <div className="mt-1 text-lg font-bold">
                  {p.price}
                  <span className="text-xs font-normal text-muted">{p.unit}</span>
                </div>
                <Button
                  size="sm"
                  variant={active ? "subtle" : "brand"}
                  className="mt-3 w-full"
                  disabled={active}
                  onClick={async () => {
                    await update({ plan: p.id });
                  }}
                >
                  {active ? "사용 중" : "이 플랜으로"}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">* 데모 환경에서는 결제 없이 플랜을 전환해 한도 동작을 확인할 수 있습니다.</p>
      </section>

      {/* Gmail 연동 */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Gmail 연동 (BYO-Email)</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface">
                <Mail className="h-5 w-5 text-muted" />
              </div>
              <div>
                <div className="font-semibold">Google 계정 연결</div>
                <div className="text-xs text-muted">발송·초안은 사용자 본인 Gmail로 나가며, 모든 배포·회신은 Gmail <b>&lsquo;언론홍보&rsquo;</b> 라벨 안에서 관리됩니다. (OAuth 설정 시 활성화)</div>
              </div>
            </div>
            <Button variant="subtle" disabled>
              연결 (준비 중)
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* 억제 리스트 */}
      <section>
        <h2 className="mb-3 text-lg font-bold">억제 리스트 (수신거부)</h2>
        <Card>
          <CardContent className="pt-6">
            {suppression === undefined ? (
              <div className="h-16 animate-pulse rounded-md bg-surface" />
            ) : suppression.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Check className="h-4 w-4 text-success" /> 억제된 기자가 없습니다. 수신거부 회신 시 자동 등록됩니다.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {suppression.map((s) => (
                  <li key={s._id} className="flex items-center justify-between py-2.5">
                    <div>
                      <span className="text-sm font-semibold tabular-nums">{s.masked}</span>
                      <span className="ml-2 text-xs text-muted">{s.reason}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeSup({ id: s._id as Id<"suppressionList"> })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
