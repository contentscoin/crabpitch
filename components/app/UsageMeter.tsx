"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Progress } from "@/components/ui/Progress";

export function UsageMeter() {
  const usage = useQuery(api.usage.getMyUsage);
  if (!usage) return null;
  const pct = usage.limits.sends > 0 ? (usage.sendsUsed / usage.limits.sends) * 100 : 0;
  const tone = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "brand";
  return (
    <div className="hidden w-44 sm:block">
      <div className="mb-1 flex justify-between text-[11px] font-semibold text-foreground-muted">
        <span>{usage.limits.label} · 발송</span>
        <span>
          {usage.sendsUsed}/{usage.limits.sends === 1000000 ? "∞" : usage.limits.sends}
        </span>
      </div>
      <Progress value={pct} tone={tone} />
    </div>
  );
}
