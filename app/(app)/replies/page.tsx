"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Inbox, Check, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader, EmptyState, ReplyTypeBadge, REPLY_TYPES } from "@/components/app/bits";
import { Skeleton } from "@/components/ui/Skeleton";

export default function RepliesPage() {
  const inbox = useQuery(api.replies.inbox);
  const markHandled = useMutation(api.replies.markHandled);
  const confirmSlot = useMutation(api.replies.confirmInterviewSlot);
  const refreshSlots = useMutation(api.replies.refreshInterviewSlots);

  return (
    <div>
      <PageHeader
        title="회신 인박스"
        description="모든 캠페인의 기자 회신을 7유형으로 분류해 우선순위와 답장 초안을 제시합니다. 인터뷰는 일정 3안 중 확정할 수 있습니다."
      />

      {inbox === undefined ? (
        <Skeleton className="h-40" />
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
                    <span className="text-xs text-muted">
                      · {r.outlet} · {r.campaignName}
                    </span>
                  </div>
                  {r.handled ? (
                    <Badge variant="success">
                      <Check className="h-3 w-3" /> 처리됨
                      {r.interviewPickedSlot ? ` · ${r.interviewPickedSlot}` : ""}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => markHandled({ id: r._id as Id<"replies"> })}
                    >
                      처리 완료
                    </Button>
                  )}
                </div>
                <p className="mt-2 rounded-md bg-surface px-3 py-2 text-sm text-foreground-muted">
                  “{r.rawBody}”
                </p>
                <div className="mt-2">
                  <div className="text-xs font-semibold text-muted">답장 초안</div>
                  <pre className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {r.draftResponse}
                  </pre>
                </div>

                {r.type === "interview" && !r.handled && (
                  <div className="mt-3 rounded-md border border-border bg-surface/60 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
                      <CalendarClock className="h-3.5 w-3.5" /> 인터뷰 일정 확정
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(r.interviewSlots ?? []).map((slot) => (
                        <Button
                          key={slot}
                          size="sm"
                          variant="brand"
                          onClick={() =>
                            confirmSlot({ id: r._id as Id<"replies">, slot })
                          }
                        >
                          {slot}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => refreshSlots({ id: r._id as Id<"replies"> })}
                      >
                        일정 다시 제안
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
