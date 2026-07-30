"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "./Button";

/**
 * 확인 대화상자 — `window.confirm` 대체.
 *
 * **네이티브 `<dialog>` + `showModal()`을 쓴다.** ESC 닫기·포커스 트랩·`::backdrop`·배경 inert를
 * 브라우저가 제공하므로 직접 구현하지 않는다(저장소에 포커스 트랩 구현이 0건이고, 직접 만들면
 * 틀리기 쉬운 부분이다). Baseline 2022 / Safari 15.4+.
 *
 * API가 `Promise<boolean>`인 이유: 교체 대상은 모두 async 함수 **중간에서** 확인 결과를 받아
 * 흐름을 이어간다(`const ok = window.confirm(...); if (!ok) return;`). 선언형 `onConfirm`
 * 콜백으로 바꾸면 발송 코드 경로를 재구성해야 하는데, 그건 이 저장소에서 가장 위험한 코드다.
 */

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 되돌릴 수 없는 동작은 `danger`. */
  variant?: "danger" | "brand";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** `<dialog>.showModal()`을 쓸 수 있는가. 파괴적 액션에서 무확인 진행은 금지다. */
function supportsModalDialog(): boolean {
  return (
    typeof HTMLDialogElement !== "undefined" &&
    typeof HTMLDialogElement.prototype.showModal === "function"
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (ctx) return ctx;
  // Provider 밖 — 확인 없이 진행하지 않는다. 브라우저 기본 확인으로 되돌린다.
  return async (options) => window.confirm(confirmFallbackText(options));
}

/** 폴백 문구 — 제목과 설명을 모두 담아야 정보가 사라지지 않는다. */
function confirmFallbackText(options: ConfirmOptions): string {
  return options.description ? `${options.title}\n\n${options.description}` : options.title;
}

interface Pending {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  /** confirm 버튼으로 닫혔는지 — `close` 이벤트에서 취소와 구분하기 위한 플래그. */
  const confirmedRef = useRef(false);

  const confirm = useCallback<ConfirmFn>(async (options) => {
    // showModal이 없는 브라우저에서는 브라우저 기본 확인을 쓴다(무확인 진행 금지).
    if (!supportsModalDialog()) {
      return window.confirm(confirmFallbackText(options));
    }
    return new Promise<boolean>((resolve) => {
      confirmedRef.current = false;
      setPending({ options, resolve });
    });
  }, []);

  // pending이 생기면 모달을 연다. 렌더 이후여야 ref가 채워져 있다.
  useEffect(() => {
    if (pending && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [pending]);

  const settle = useCallback((ok: boolean) => {
    setPending((current) => {
      current?.resolve(ok);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        // ESC·backdrop 등 어떤 경로로 닫혀도 취소로 확정한다(확인 버튼만 true).
        onClose={() => settle(confirmedRef.current)}
        onCancel={() => {
          confirmedRef.current = false;
        }}
        className="max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/40"
      >
        {pending && (
          <div className="p-5">
            <h2 className="text-base font-bold">{pending.options.title}</h2>
            {pending.options.description && (
              <p className="mt-2 whitespace-pre-line text-sm text-foreground-muted">
                {pending.options.description}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              {/*
                기본 포커스는 **취소**다. 파괴적 액션에서 Enter 연타로 확정되면 안 된다.
                autoFocus를 취소에 둔다.
              */}
              <Button
                type="button"
                size="sm"
                variant="subtle"
                autoFocus
                onClick={() => {
                  confirmedRef.current = false;
                  dialogRef.current?.close();
                }}
              >
                {pending.options.cancelLabel ?? "취소"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={pending.options.variant === "danger" ? "danger" : "brand"}
                onClick={() => {
                  confirmedRef.current = true;
                  dialogRef.current?.close();
                }}
              >
                {pending.options.confirmLabel ?? "확인"}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
