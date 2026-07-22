import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {description && <p className="mt-1 text-sm text-foreground-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground-muted">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted" />}
      </div>
      <div className="mt-2 text-2xl font-extrabold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const tone = score >= 80 ? "bg-success" : score >= 60 ? "bg-brand" : "bg-warning";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${score}%` }} />
      </div>
      <span className="w-8 text-right text-sm font-bold tabular-nums">{score}</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-muted">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-foreground-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const CAMPAIGN_STATUS: Record<string, { label: string; variant: "default" | "brand" | "success" | "warning" | "danger" }> = {
  draft: { label: "작성 중", variant: "default" },
  matched: { label: "매칭 완료", variant: "brand" },
  review: { label: "검토 중", variant: "warning" },
  sending: { label: "발송 중", variant: "warning" },
  sent: { label: "발송 완료", variant: "success" },
  tracking: { label: "추적 중", variant: "default" },
  done: { label: "완료", variant: "success" },
};

export function CampaignStatusBadge({ status }: { status: string }) {
  const s = CAMPAIGN_STATUS[status] ?? CAMPAIGN_STATUS.draft;
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export const REPLY_TYPES: Record<
  string,
  { label: string; variant: "default" | "brand" | "success" | "warning" | "danger"; priority: string }
> = {
  interview: { label: "① 인터뷰 요청", variant: "brand", priority: "🔴 즉시" },
  materials: { label: "② 자료 요청", variant: "brand", priority: "🔴 즉시" },
  question: { label: "③ 확인 질문", variant: "warning", priority: "🟠 당일" },
  published: { label: "④ 게재 통보", variant: "success", priority: "🟢 감사" },
  hold: { label: "⑤ 보류/거절", variant: "default", priority: "🟢 정중" },
  unsubscribe: { label: "⑥ 수신거부", variant: "danger", priority: "⚫ 즉시" },
  complaint: { label: "⑦ 부정/컴플레인", variant: "danger", priority: "🔴 신중" },
};

export function ReplyTypeBadge({ type }: { type: string }) {
  const t = REPLY_TYPES[type] ?? REPLY_TYPES.question;
  return <Badge variant={t.variant}>{t.label}</Badge>;
}
