import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { ButtonHTMLAttributes, forwardRef } from "react";
import type { LucideIcon } from "lucide-react";

type Variant = "brand" | "outline" | "ghost" | "subtle" | "danger" | "deep";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  brand: "bg-brand text-brand-foreground hover:bg-brand-hover shadow-sm",
  deep: "bg-deep text-deep-foreground hover:opacity-90",
  outline: "border border-border bg-card hover:bg-surface text-foreground",
  ghost: "hover:bg-surface text-foreground",
  subtle: "bg-surface text-foreground hover:bg-surface-2 border border-border",
  danger: "bg-danger text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
  icon: "h-10 w-10",
};

const BASE = [
  "inline-flex items-center justify-center rounded-md font-semibold transition-all",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
].join(" ");

/**
 * 버튼 클래스 문자열 — `Button`과 **버튼처럼 보이는 링크**의 단일 출처.
 *
 * ⚠️ `<Link>` 안에 `<Button>`을 넣지 말 것. `<a>`는 대화형 콘텐츠를 자식으로 가질 수 없어
 *    무효 HTML이 되고 포커스 스톱이 둘로 늘어난다. 랜딩 CTA처럼 링크가 버튼으로 보여야 하면
 *    이 함수를 `<Link className={...}>`에 쓴다.
 */
export function buttonClasses(opts?: {
  variant?: Variant;
  size?: Size;
  className?: string;
}): string {
  const { variant = "brand", size = "md", className } = opts ?? {};
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /**
   * 진행 중 표시. `icon` 자리에 스피너가 들어가고 버튼이 비활성화된다.
   *
   * 라벨 문자열 교체("생성 중…")를 **대체하지 않는다** — 라벨은 스피너보다 많은 정보를
   * 주므로 둘을 함께 쓴다.
   */
  loading?: boolean;
  /** 좌측 아이콘. `loading`이면 이 자리를 스피너가 차지한다. */
  icon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "brand", size = "md", loading, icon: Icon, disabled, children, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon className="h-4 w-4" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
