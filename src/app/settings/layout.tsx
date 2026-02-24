import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "설정",
  description: "AI 답변 스타일과 모델을 설정하여 학습 경험을 맞춤화하세요.",
  alternates: {
    canonical: "/settings",
  },
  openGraph: {
    title: "설정",
    description: "AI 답변 스타일과 모델을 설정하여 학습 경험을 맞춤화하세요.",
    url: "/settings",
  },
  twitter: {
    card: "summary",
    title: "설정",
    description: "AI 답변 스타일과 모델을 설정하여 학습 경험을 맞춤화하세요.",
  },
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

