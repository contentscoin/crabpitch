import {
  Bot,
  Building2,
  FileText,
  Inbox,
  LayoutDashboard,
  Send,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/ai", label: "내 AI", icon: Bot },
  { href: "/campaigns", label: "캠페인", icon: Send },
  { href: "/journalists", label: "기자 DB", icon: Users },
  { href: "/replies", label: "회신 인박스", icon: Inbox },
  { href: "/media-kit", label: "미디어킷", icon: FileText },
  { href: "/agency", label: "에이전시", icon: Building2 },
  { href: "/settings", label: "설정", icon: Settings },
];

/** 플랫폼 관리자만 사이드바에 노출 */
export const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: "관리자",
  icon: Shield,
};
