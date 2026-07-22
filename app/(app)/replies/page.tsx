"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Inbox, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader, EmptyState, ReplyTypeBadge, REPLY_TYPES } from "@/components/app/bits";

export default function RepliesPage() {
  const inbox = useQuery(api.replies.inbox);
  const markHandled = useMutation(api.replies.markHandled);

  return (
    <div>
      <PageHeader title="회신 인박스" description="모든 캠페인의 기자 회신을 7유형으로 분류해 우선순위와 답장 초안을 제시합니다." />

      {inbox === undefined ? (
        <div className="h-40 animate-pulse rounded-lg border border-border bg-card" />
      ) : inbox.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="받은 회신이 없습니다"
          description="캠페인 상세에서 기자 회신을 입력하면 여기에 분류되어 모입니다."
        />
      ) : (
        <div className="space-y-3">
          {inbox.map((r) => {
            const meta = REPLY_TYPES[r.type] ?? REPLY_TYPES.question;
            return (
              <div key={r._id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <ReplyTypeBadge type={r.type} />
                    <Badge variant="outline">{meta.priority}</Badge>
                    <span className="text-sm font-semibold tabular-nums">{r.code}</span>
                    <span className="text-xs text-muted">· {r.outlet} · {r.campaignName}</span>
                  </div>
                  {r.handled ? (
                    <Badge variant="success">
                      <Check className="h-3 w-3" /> 처리됨
                    </Badge>
                  ) : (
                    <Button size="sm" variant="subtle" onClick={() => markHandled({ id: r._id as Id<"replies"> })}>
                      처리 완료
                    </Button>
                  )}
                </div>
                <p className="mt-2 rounded-md bg-surface px-3 py-2 text-sm text-foreground-muted">“{r.rawBody}”</p>
                <div className="mt-2">
                  <div className="text-xs font-semibold text-muted">답장 초안</div>
                  <pre className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{r.draftResponse}</pre>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
