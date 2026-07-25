"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Building2 } from "lucide-react";

/** 에이전시 활성 클라이언트 전환 (Topbar). Agency 컨텍스트가 있을 때만 표시. */
export function ClientSwitcher() {
  const context = useQuery(api.agency.getActiveContext);
  const agencyId = context?.agency?._id as Id<"agencies"> | undefined;
  const clients = useQuery(
    api.agency.listClients,
    agencyId ? { agencyId } : "skip",
  );
  const setActive = useMutation(api.agency.setActiveContext);

  if (!context?.agency || !agencyId) return null;

  return (
    <div className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 lg:flex">
      <Building2 className="h-3.5 w-3.5 text-muted" />
      <select
        className="max-w-[180px] bg-transparent text-xs font-semibold text-foreground outline-none"
        value={context.client?._id ?? ""}
        onChange={async (e) => {
          const v = e.target.value;
          if (!v) {
            await setActive({ agencyId });
            return;
          }
          await setActive({
            agencyId,
            clientId: v as Id<"agencyClients">,
          });
        }}
        aria-label="클라이언트 전환"
      >
        <option value="">전체 · {context.agency.name}</option>
        {(clients ?? []).map((c) => (
          <option key={c._id} value={c._id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
