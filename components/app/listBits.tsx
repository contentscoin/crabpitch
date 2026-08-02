"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * 목록 화면 공용 조각 — 관리자 전용이 아니다.
 *
 * 기자 디렉터리는 관리자 화면과 사용자 화면에 각각 있고, 둘은 보는 사람만 다르지
 * "긴 목록을 끊어 본다"는 문제가 같다. 한쪽에만 페이지네이션이 있으면 다른 쪽은
 * 1,700건을 통째로 받는다 — 실제로 그랬다.
 */

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

/** 한 쪽에 몇 건. 목록 성격에 따라 적당한 크기가 달라서 사용자가 고른다. */
export const PAGE_SIZE_OPTIONS = [10, 20, 30] as const;

export function PageSizeSelect({
  value,
  onChange,
  options = PAGE_SIZE_OPTIONS,
}: {
  value: number;
  onChange: (n: number) => void;
  options?: readonly number[];
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="쪽당 표시 수">
      {options.map((n) => (
        <Button
          key={n}
          type="button"
          size="sm"
          variant={value === n ? "brand" : "subtle"}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
        >
          {n}
        </Button>
      ))}
    </div>
  );
}
