"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

/**
 * 관리자 화면 공용 조각.
 *
 * 관리자 화면에만 쓰이는 것들. 목록 페이저·검색 막대처럼 사용자 화면과도 공유하는
 * 조각은 `listBits.tsx`에 있다.
 */

export type PackStatus = "ok" | "partial" | "failed";

export const PACK_STATUS: Record<
  PackStatus,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  ok: { label: "정상", variant: "success" },
  partial: { label: "결손", variant: "warning" },
  failed: { label: "실패", variant: "danger" },
};

export function PackStatusBadge({ status }: { status?: string }) {
  const s = status ? PACK_STATUS[status as PackStatus] : undefined;
  if (!s) return <Badge variant="outline">{status ?? "미실행"}</Badge>;
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function fmtDate(ts?: number | null): string {
  return ts ? new Date(ts).toLocaleDateString("ko-KR") : "—";
}

export function fmtDateTime(ts?: number | null): string {
  return ts ? new Date(ts).toLocaleString("ko-KR") : "—";
}

/**
 * 관리자 화면 사이 이동.
 *
 * 화면이 여럿이 되면 "지금 어디에 있고 어디로 갈 수 있는지"가 먼저 보여야 한다.
 * 현재 화면을 `aria-current`로 표시해 스크린리더에서도 같은 정보를 준다.
 */
export function AdminNav({
  current,
}: {
  current: "overview" | "journalists" | "logs";
}) {
  const tabs = [
    { id: "overview", href: "/admin", label: "요약 · 운영" },
    { id: "journalists", href: "/admin/journalists", label: "기자 디렉터리" },
    { id: "logs", href: "/admin/logs", label: "동기화 로그" },
  ] as const;
  return (
    <nav aria-label="관리자 화면" className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === current ? "page" : undefined}
          className={
            t.id === current
              ? "rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand"
              : "rounded-full border border-border px-3 py-1 text-sm text-foreground-muted hover:text-foreground"
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
