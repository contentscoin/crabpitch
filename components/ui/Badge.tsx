import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

type Variant = "default" | "brand" | "success" | "warning" | "danger" | "outline" | "deep";

const VARIANTS: Record<Variant, string> = {
  default: "bg-surface-2 text-foreground-muted",
  brand: "bg-brand-soft text-brand border border-brand/20",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
  deep: "bg-deep text-deep-foreground",
  outline: "border border-border text-foreground-muted",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

/** 연락처 신뢰도 뱃지 */
export function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  const map = {
    high: { v: "success" as const, t: "신뢰도 high" },
    medium: { v: "warning" as const, t: "신뢰도 medium" },
    low: { v: "danger" as const, t: "신뢰도 low" },
  };
  const m = map[level];
  return <Badge variant={m.v}>{m.t}</Badge>;
}
