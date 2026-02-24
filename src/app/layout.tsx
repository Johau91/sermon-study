import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavBar, AppFooter, PageWrapper } from "@/components/nav-bar";
import { resolveMetadataBase } from "@/lib/metadata";
import { ConvexClientProvider } from "@/components/convex-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: "설교 학습",
    template: "%s | 설교 학습",
  },
  description: "설교를 통한 체계적인 성경 학습 도우미",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "설교 학습",
    title: "설교 학습",
    description: "설교를 통한 체계적인 성경 학습 도우미",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "설교 학습",
    description: "설교를 통한 체계적인 성경 학습 도우미",
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
        <ConvexClientProvider>
          <div className="min-h-screen flex flex-col">
            <NavBar />
            <main className="flex-1">
              <PageWrapper>{children}</PageWrapper>
            </main>
            <AppFooter />
          </div>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
