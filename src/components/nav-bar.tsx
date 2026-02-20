"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Home,
  MessageCircle,
  GraduationCap,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/sermons", label: "설교", icon: BookOpen },
  { href: "/chat", label: "채팅", icon: MessageCircle },
  { href: "/study", label: "학습", icon: GraduationCap },
  { href: "/settings", label: "설정", icon: Settings },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 items-center px-4 max-w-5xl">
        <Link
          href="/"
          className="mr-8 flex items-center gap-2 font-semibold"
        >
          <BookOpen className="size-5 text-[#3182F6]" />
          <span>설교 학습</span>
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-[#3182F6] bg-[#3182F6]/5"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <item.icon className="size-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function AppFooter() {
  const pathname = usePathname();
  if (pathname === "/chat") return null;

  return (
    <footer className="border-t py-4">
      <div className="mx-auto max-w-5xl px-4 text-center text-sm text-muted-foreground">
        설교 학습 &mdash; 말씀으로 성장하는 매일
      </div>
    </footer>
  );
}

export function PageWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat";

  if (isChat) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {children}
    </div>
  );
}
