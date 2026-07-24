"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UsageMeter } from "./UsageMeter";
import { ClientSwitcher } from "./ClientSwitcher";

export function Topbar() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <Link href="/dashboard" className="flex items-center gap-2 font-extrabold md:hidden">
        <span className="text-lg">🦀</span> 크랩피치
      </Link>
      <div className="hidden md:block" />
      <div className="flex items-center gap-2 sm:gap-3">
        <ClientSwitcher />
        <UsageMeter />
        <Link href="/campaigns/new">
          <Button size="sm">
            <Plus className="h-4 w-4" /> 새 캠페인
          </Button>
        </Link>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          aria-label="로그아웃"
          onClick={async () => {
            await signOut();
            router.push("/");
          }}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
