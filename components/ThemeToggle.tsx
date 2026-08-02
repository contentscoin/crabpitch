"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const BOX = "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card";

/**
 * 라이트/다크 전환.
 *
 * ⚠️ 마운트 전에는 아이콘을 렌더하지 않는다. 실제 테마는 `document.documentElement`의
 *    클래스에 있고 그것은 `useEffect` 이후에만 읽을 수 있으므로, 그 전에 그리면 다크 모드
 *    사용자에게 **첫 페인트에서 반대 아이콘이 한 프레임 보인다.** 같은 크기의 빈 박스를
 *    두어 레이아웃이 흔들리지 않게 한다.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("crabpitch-theme", next ? "dark" : "light");
    } catch {
      // 사파리 프라이빗 모드 등에서 던진다. 이번 세션에는 적용되므로 조용히 넘어간다.
    }
  }

  if (!mounted) {
    // 자리만 잡는다 — 보조 기술에는 아직 알릴 상태가 없다.
    return <div aria-hidden="true" className={`${BOX} ${className ?? ""}`} />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      /*
        토글 버튼이므로 상태를 이름이 아니라 `aria-pressed`로 알린다.
        이름을 "테마 전환"처럼 두면 지금 어느 테마인지 알 수 없고, 반대로 이름을
        현재 상태에 따라 바꾸면(예: "라이트 모드로") 누를 때마다 이름이 변해
        같은 버튼인지 알 수 없다. 이름은 고정, 상태는 pressed로 분리한다.
      */
      aria-label="다크 모드"
      aria-pressed={dark}
      className={`${BOX} text-foreground-muted transition-colors hover:text-foreground ${className ?? ""}`}
    >
      {dark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
