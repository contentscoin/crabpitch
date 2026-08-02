import { cn } from "@/lib/utils";

export function Progress({
  value,
  label,
  className,
  tone = "brand",
}: {
  /** 0~100. 범위를 벗어난 값은 클램프한다. */
  value: number;
  /**
   * 접근 가능한 이름 — **필수 prop이다.**
   *
   * optional로 두면 안 된다: `role="progressbar"`는 이름이 있어야 의미가 생기고,
   * 이름 없는 progressbar는 "진행률 50%"처럼 **무엇의 진행률인지 알 수 없는 낭독**을
   * 만든다. 없는 것보다 나쁘다. 새 호출부가 label을 빼먹는 순간 타입 오류로 막힌다.
   *
   * 목록 안에서 여러 개를 쓸 때는 항목을 구별할 수 있게 지어야 한다
   * (예: `${kit.name} 완성도`) — 같은 이름이 반복되면 구별할 수 없다.
   */
  label: string;
  className?: string;
  tone?: "brand" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    brand: "bg-brand",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      // 소수점을 그대로 넘기면 "37.49999%"로 낭독된다.
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div
        className={cn("h-full rounded-full transition-all", toneClass)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
