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
      <nav className="flex-1 space-y-1 p-4">
        <NavLinks items={items} pathname={pathname} />
      </nav>
      <div className="border-t border-border p-4 text-xs text-muted">
        기자 데이터는 candidate 상태 —<br />
        실발송은 승인 후에만.
      </div>
    </aside>
  );
}

/** 모바일 상단 가로 네비게이션 */
export function MobileNav() {
  const pathname = usePathname();
  const items = useNavItems();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden">
      <NavLinks items={items} pathname={pathname} mobile />
    </nav>
  );
}
