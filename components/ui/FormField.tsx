"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./Input";

/**
 * 라벨 + 입력 + 설명 + 오류를 묶고 **aria를 자동 연결**한다.
 *
 * 참조 구현은 `app/(app)/campaigns/[id]/page.tsx`의 템플릿 편집기다 — 거기 이미
 * `aria-invalid` + `aria-describedby`를 손으로 올바르게 연결한 코드가 있다. 문제는 그 패턴이
 * 한 곳에만 있어 반복할 수 없다는 것이고, 이 컴포넌트가 그것을 반복 가능하게 만든다.
 *
 * children을 **함수로** 받는 이유: 폼 컨트롤이 `Input`·`Textarea`·네이티브 `<select>`로 섞여
 * 있고 각자 props가 다르다. `cloneElement`로 aria를 주입하면 타입이 깨진다.
 */
export function FormField({
  label,
  error,
  description,
  required,
  className,
  children,
}: {
  label: string;
  /** 오류 문구. 있으면 `aria-invalid`가 켜지고 설명 대신 오류가 연결된다. */
  error?: string | null;
  description?: string;
  required?: boolean;
  className?: string;
  /** `(id, describedBy)` — 컨트롤에 그대로 전달한다. */
  children: (id: string, describedBy: string | undefined) => React.ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const descId = `${id}-description`;

  // 오류가 있으면 오류를 먼저 읽게 한다. 설명까지 함께 연결하면 스크린리더가 장황해진다.
  const describedBy = error ? errorId : description ? descId : undefined;

  return (
    <div className={className}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children(id, describedBy)}
      {error ? (
        // 제출 시점에 나타나는 오류이므로 라이브 영역으로 알린다.
        <p id={errorId} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : description ? (
        <p id={descId} className={cn("mt-1 text-xs text-muted")}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
