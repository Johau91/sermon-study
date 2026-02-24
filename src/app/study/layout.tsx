import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "학습",
  description: "설교 기반 퀴즈로 이해도를 점검하고 학습 결과를 확인하세요.",
  alternates: {
    canonical: "/study",
  },
  openGraph: {
    title: "학습",
    description: "설교 기반 퀴즈로 이해도를 점검하고 학습 결과를 확인하세요.",
    url: "/study",
  },
  twitter: {
    card: "summary",
    title: "학습",
    description: "설교 기반 퀴즈로 이해도를 점검하고 학습 결과를 확인하세요.",
  },
};

export default function StudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

