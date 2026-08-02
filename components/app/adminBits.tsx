"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Link from "next/link";

/**
 * 관리자 화면 공용 조각.
 *
 * `/admin`과 `/admin/logs`가 같은 표·같은 페이저를 쓴다. 화면마다 복사해 두면
 * 한쪽만 고쳐지고, 관리자는 같은 표가 화면에 따라 다르게 동작하는 것을 본다.
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
 * 목록 상단 도구 막대 — 검색과 건수.
 *
 * 페이지를 넘기는 것보다 검색이 빠른 경우가 많다. 찾는 대상이 정해져 있으면
 * 몇 쪽인지 모르는 채로 넘기게 하지 않는다.
 */
export function ListToolbar({
  placeholder,
  value,
  onChange,
  total,
  matched,
  note,
  children,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  total: number;
  matched: number;
  note?: string;
  /** 필터 드롭다운 등 — 검색창 오른쪽에 붙는다 */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 포커스 링·테두리는 Input 프리미티브가 갖는다 — 화면에서 다시 그리지 않는다. */}
      <Input
        type="search"
        className="h-9 min-w-[200px] flex-1"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {children}
      <span className="text-xs tabular-nums text-foreground-muted">
        {/* 검색 중일 때만 "몇 건 중 몇 건"을 보여 준다 — 평소엔 총계 하나면 충분하다. */}
        {matched === total ? `${total}건` : `${matched} / ${total}건`}
        {note ? ` · ${note}` : ""}
      </span>
    </div>
  );
}

/** 0-based 페이지. 서버 쿼리는 1-based이므로 호출부가 ±1 한다. */
export function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-muted">
      <span className="tabular-nums">
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="subtle"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
        >
          이전
        </Button>
        <span className="tabular-nums">
          {page + 1} / {pages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="subtle"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
        >
          다음
        </Button>
      </div>
    </div>
  );
}

/**
 * 관리자 화면 사이 이동.
 *
 * 화면이 여럿이 되면 "지금 어디에 있고 어디로 갈 수 있는지"가 먼저 보여야 한다.
 * 현재 화면을 `aria-current`로 표시해 스크린리더에서도 같은 정보를 준다.
 */
export function AdminNav({ current }: { current: "overview" | "logs" }) {
  const tabs = [
    { id: "overview", href: "/admin", label: "요약 · 운영" },
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
