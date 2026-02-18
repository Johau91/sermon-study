import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import {
  BookOpen,
  Home,
  MessageCircle,
  GraduationCap,
} from "lucide-react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "설교 학습",
  description: "설교를 통한 체계적인 성경 학습 도우미",
};

const navItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/sermons", label: "설교", icon: BookOpen },
  { href: "/chat", label: "채팅", icon: MessageCircle },
  { href: "/study", label: "학습", icon: GraduationCap },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen flex flex-col">
          {/* Navigation Bar */}
          <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
              <Link
                href="/"
                className="mr-8 flex items-center gap-2 font-semibold"
              >
                <BookOpen className="size-5 text-primary" />
                <span>설교 학습</span>
              </Link>
              <nav className="flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <item.icon className="size-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1">
            <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
          </main>

          {/* Footer */}
          <footer className="border-t py-4">
            <div className="mx-auto max-w-5xl px-4 text-center text-sm text-muted-foreground">
              설교 학습 &mdash; 말씀으로 성장하는 매일
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
