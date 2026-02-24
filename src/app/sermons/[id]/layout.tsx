import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "설교 상세",
  description:
    "설교 상세 페이지입니다. 설교 요약, 전문, 학습 퀴즈를 한 곳에서 확인하세요.",
};

export default function SermonDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
