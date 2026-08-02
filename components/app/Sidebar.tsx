"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ADMIN_NAV, NAV, type NavItem } from "./nav";
import { cn } from "@/lib/utils";

function useNavItems(): NavItem[] {
  const access = useQuery(api.admin.getAccess);
  if (access?.allowed) return [...NAV, ADMIN_NAV];
  return NAV;
}

function NavLinks({
  items,
  pathname,
  mobile,
}: {
  items: NavItem[];
  pathname: string;
  mobile?: boolean;
}) {
  return (
    <>
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            /*
              현재 위치를 색으로만 알리면 보조 기술 사용자는 어디 있는지 알 수 없다.
              `aria-current="page"`가 "현재 페이지"로 낭독된다.
              false가 아니라 `undefined`를 줘야 한다 — `aria-current="false"`는
              속성이 남아 있는 상태고, React가 지우지 않는다.
            */
            aria-current={active ? "page" : undefined}
            className={cn(
              mobile
                ? "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
                : "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "bg-brand-soft text-brand"
                : mobile
                  ? "text-foreground-muted"
                  : "text-foreground-muted hover:bg-surface hover:text-foreground",
            )}
          >
            <Icon className={mobile ? "h-4 w-4" : "h-[18px] w-[18px]"} />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const items = useNavItems();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border bg-card md:flex">
      <Link
        href="/dashboard"
        className="flex h-16 items-center gap-2 border-b border-border px-6 text-lg font-extrabold"
      >
        <span className="text-xl">🦀</span> 크랩피치
      </Link>
      <nav aria-label="주요 메뉴" className="flex-1 space-y-1 p-4">
        <NavLinks items={items} pathname={pathname} />
      </nav>
      <div className="border-t border-border p-4 text-xs text-muted">
        기자 데이터는 candidate 상태 —<br />
        실발송은 승인 후에만.
      </div>
    </aside>
  );
}

/**
 * 모바일 상단 가로 네비게이션.
 *
 * 탭이 8개(관리자 9개)라 좁은 화면에서는 반드시 잘린다. 잘린 자리가 그냥 끝난 것처럼
 * 보이면 남은 탭을 찾지 못하므로, 우측에 fade 마스크로 "더 있다"를 알린다.
 *
 * ⚠️ 데스크톱 사이드바와 동시에 렌더되지 않는다(`md:hidden` / `hidden md:flex`).
 *    `display: none`은 접근성 트리에서도 빠지므로 같은 `aria-label`을 써도 landmark가
 *    중복되지 않는다.
 */
export function MobileNav() {
  const pathname = usePathname();
  const items = useNavItems();
  return (
    // 테두리를 래퍼로 올린다 — 마스크가 nav 위에 겹치므로 nav에 두면 테두리를 덮는다.
    <div className="relative border-b border-border bg-card md:hidden">
      <nav aria-label="주요 메뉴" className="flex gap-1 overflow-x-auto px-4 py-2">
        <NavLinks items={items} pathname={pathname} mobile />
      </nav>
      {/*
        스크롤 가능 힌트. 장식이므로 접근성 트리에서 빼고, 아래 탭을 누를 수 있게
        포인터 이벤트를 통과시킨다.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent"
      />
    </div>
  );
}
