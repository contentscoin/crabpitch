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

/**
 * 접근 이름·설명 연결용 고정 id.
 *
 * `<dialog>`는 Provider당 하나만 존재하므로(top layer에 동시에 둘 필요가 없다) 고정 id가
 * 충돌하지 않는다. `useId`를 쓰면 `aria-labelledby`와 `<h2 id>`가 같은 렌더에서 만들어지는지
 * 보장하기 위해 배선이 늘어난다.
 */
const DIALOG_TITLE_ID = "crabpitch-confirm-title";
const DIALOG_DESC_ID = "crabpitch-confirm-description";

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

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  /**
   * 대기 중인 resolver.
   *
   * 상태가 아니라 ref에 든다 — 상태 업데이터 안에서 `resolve`를 호출하면 순수성 위반이고,
   * 무엇보다 **이전 요청을 덮어쓸 때 그 Promise를 해소해 줘야** 한다. 덮어쓰고 버리면
   * 이전 Promise가 영구 pending이 되고, 호출부의 `try/finally`가 실행되지 않아
   * 발송 버튼이 "처리 중…"에 영구 고착된다(새로고침 외 회복 수단이 없다).
   */
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  /** confirm 버튼으로 닫혔는지 — `close` 이벤트에서 취소와 구분하기 위한 플래그. */
  const confirmedRef = useRef(false);

  /** 대기 중인 요청을 해소한다. 두 번 불려도 안전하다(resolver를 즉시 비운다). */
  const settle = useCallback((ok: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolve?.(ok);
  }, []);

  const confirm = useCallback<ConfirmFn>(
    async (next) => {
      // showModal이 없는 브라우저에서는 브라우저 기본 확인을 쓴다(무확인 진행 금지).
      if (!supportsModalDialog()) {
        return window.confirm(confirmFallbackText(next));
      }
      // 이전 요청이 남아 있으면 취소로 해소한다 — 버리면 영구 pending이 된다.
      if (resolverRef.current) settle(false);
      return new Promise<boolean>((resolve) => {
        confirmedRef.current = false;
        resolverRef.current = resolve;
        setOptions(next);
      });
    },
    [settle],
  );

  // options가 생기면 모달을 연다. 렌더 이후여야 ref가 채워져 있다.
  useEffect(() => {
    if (options && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [options]);

  // 언마운트 시 대기 중인 요청을 취소로 해소한다(호출부의 finally가 돌아야 한다).
  useEffect(
    () => () => {
      const resolve = resolverRef.current;
      resolverRef.current = null;
      resolve?.(false);
    },
    [],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        // ESC 등 어떤 경로로 닫혀도 취소로 확정한다(확인 버튼만 true).
        onClose={() => settle(confirmedRef.current)}
        onCancel={() => {
          confirmedRef.current = false;
        }}
        /*
          ⚠️ 접근 이름·설명을 반드시 연결한다. `window.confirm`은 문구 전체를 **항상**
             낭독했다. 초기 포커스가 취소 버튼이므로 이 연결이 없으면 스크린리더가
             "취소"만 읽고, "되돌릴 수 없습니다 / 발신 주소" 같은 경고가 전달되지 않는다
             — 문구를 유지해도 전달 경로에서 새면 의미가 없다.
        */
        aria-labelledby={DIALOG_TITLE_ID}
        aria-describedby={options?.description ? DIALOG_DESC_ID : undefined}
        className="max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/40"
      >
        {options && (
          <div className="p-5">
            <h2 id={DIALOG_TITLE_ID} className="text-base font-bold">
              {options.title}
            </h2>
            {options.description && (
              <p
                id={DIALOG_DESC_ID}
                className="mt-2 whitespace-pre-line text-sm text-foreground-muted"
              >
                {options.description}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              {/*
                기본 포커스는 **취소**다. 파괴적 액션에서 Enter 연타로 확정되면 안 된다.
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
                {options.cancelLabel ?? "취소"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={options.variant === "danger" ? "danger" : "brand"}
                onClick={() => {
                  confirmedRef.current = true;
                  dialogRef.current?.close();
                }}
              >
                {options.confirmLabel ?? "확인"}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
