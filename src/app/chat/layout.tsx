import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 채팅",
  description: "설교 내용을 바탕으로 질문하고 답변을 받는 채팅 학습 공간입니다.",
  alternates: {
    canonical: "/chat",
  },
  openGraph: {
    title: "AI 채팅",
    description: "설교 내용을 바탕으로 질문하고 답변을 받는 채팅 학습 공간입니다.",
    url: "/chat",
  },
  twitter: {
    card: "summary",
    title: "AI 채팅",
    description: "설교 내용을 바탕으로 질문하고 답변을 받는 채팅 학습 공간입니다.",
  },
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

