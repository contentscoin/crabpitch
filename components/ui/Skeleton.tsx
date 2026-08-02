import { cn } from "@/lib/utils";

/**
 * 로딩 자리표시자.
 *
 * 지금까지는 `<div className="h-40 animate-pulse rounded-lg border border-border bg-card" />`가
 * 24곳에 복붙돼 있었다. 형태가 전부 같으면 사용자는 무엇이 로딩 중인지 알 수 없으므로,
 * **콘텐츠 모양을 닮은 변형**을 함께 제공한다.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-2", className)}
      // 로딩 자리표시자는 보조 기술에 읽히지 않아야 한다 — 의미 없는 반복이 된다.
      aria-hidden="true"
    />
  );
}

/** 문단 자리 — 마지막 줄을 짧게 해서 텍스트처럼 보이게 한다. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** 카드 자리 — 제목 + 본문 몇 줄. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-card p-5", className)}
      aria-hidden="true"
    >
      <Skeleton className="h-4 w-1/3" />
      <SkeletonText lines={lines} className="mt-4" />
    </div>
  );
}

/** 표·리스트 자리 — 행 높이를 실제 행과 비슷하게 잡는다. */
export function SkeletonRows({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("divide-y divide-border overflow-hidden rounded-lg border border-border bg-card", className)}
      aria-hidden="true"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
