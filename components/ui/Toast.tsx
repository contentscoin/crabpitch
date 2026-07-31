"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 전역 알림 — 성공·실패를 **다른 색과 다른 politeness**로 알린다.
 *
 * 왜 필요한가: 지금은 화면마다 `msg`/`note`/`error` 상태를 손으로 만들고, 성공과 실패를
 * 같은 변수에 담아 회색 텍스트로 렌더한다(설정·에이전시 화면). 사용자는 저장이 됐는지
 * 실패했는지 색으로 구분할 수 없다.
 */

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

/** 소멸 시간 — 에러는 읽을 시간이 더 필요하다. */
const DURATION: Record<ToastKind, number> = {
  success: 5000,
  info: 5000,
  error: 8000,
};

/** 동시에 보여 줄 최대 개수(polite+assertive 합계). */
const MAX_STACK = 3;

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * 알림 API.
 *
 * Provider 밖에서 호출되면 조용히 무시하는 대신 **콘솔에 경고하고 no-op**을 준다 —
 * 알림이 사라지는 것보다 배선 실수를 개발 중에 알아채는 게 낫다.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return {
    success: (m) => console.warn("[Toast] Provider 밖에서 호출됨:", m),
    error: (m) => console.warn("[Toast] Provider 밖에서 호출됨:", m),
    info: (m) => console.warn("[Toast] Provider 밖에서 호출됨:", m),
    dismiss: () => {},
  };
}

const STYLES: Record<ToastKind, { box: string; icon: typeof Info }> = {
  success: { box: "border-success/40 bg-success/10 text-foreground", icon: CheckCircle2 },
  error: { box: "border-danger/40 bg-danger/10 text-foreground", icon: AlertCircle },
  info: { box: "border-border bg-card text-foreground", icon: Info },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  /**
   * 현재 목록 스냅샷.
   *
   * 축출 대상을 **상태 업데이터 밖에서** 고르기 위해 둔다. 업데이터 안에서 `clearTimeout`
   * 같은 부작용을 실행하면 순수성 위반이고, 업데이터가 다른 `prev`로 재실행될 때
   * "타이머만 지워진 토스트가 목록에 남아 영구히 떠 있는" 상태가 만들어진다.
   */
  const itemsRef = useRef<ToastItem[]>([]);
  itemsRef.current = items;

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const id = nextId.current++;

      // ⚠️ 축출 대상은 **기존 목록에서만** 고른다. 새로 넣을 항목까지 포함한 배열에서
      //    찾으면, 스택이 error로 찬 상태에서 온 success가 자기 자신을 축출해 한 프레임도
      //    표시되지 않는다. 에러는 축출하지 않으므로(놓치면 안 되는 정보다) 뽑을 대상이
      //    없으면 상한을 넘겨 유지한다.
      const current = itemsRef.current;
      const victim =
        current.length + 1 > MAX_STACK ? current.find((i) => i.kind !== "error") : undefined;

      if (victim) {
        const t = timers.current.get(victim.id);
        if (t) {
          clearTimeout(t);
          timers.current.delete(victim.id);
        }
      }

      setItems((prev) => [
        ...(victim ? prev.filter((i) => i.id !== victim.id) : prev),
        { id, kind, message: trimmed },
      ]);

      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION[kind]),
      );
    },
    [dismiss],
  );

  // 언마운트 시 남은 타이머 정리 — 없으면 테스트·핫리로드에서 누수 경고가 뜬다.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
      dismiss,
    }),
    [push, dismiss],
  );

  const polite = items.filter((i) => i.kind !== "error");
  const assertive = items.filter((i) => i.kind === "error");

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        ⚠️ live region을 **두 개 항상 마운트**한다. 한 컨테이너에 두 politeness를 둘 수 없고,
           이미 마운트된 region의 aria-live를 런타임에 바꾸면 스크린리더가 안정적으로 읽지 않는다.
      */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
        <div aria-live="assertive" role="alert" className="flex w-full flex-col items-center gap-2 sm:items-end">
          {assertive.map((i) => (
            <ToastRow key={i.id} item={i} onDismiss={dismiss} />
          ))}
        </div>
        <div aria-live="polite" role="status" className="flex w-full flex-col items-center gap-2 sm:items-end">
          {polite.map((i) => (
            <ToastRow key={i.id} item={i} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const { box, icon: Icon } = STYLES[item.kind];
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm shadow-lg",
        box,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          item.kind === "success" ? "text-success" : item.kind === "error" ? "text-danger" : "text-brand",
        )}
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 break-words">{item.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="알림 닫기"
        className="-m-1 rounded p-1 text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
