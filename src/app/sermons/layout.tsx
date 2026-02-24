import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "설교 목록",
  description: "등록된 설교를 검색하고 요약, 전문, 학습으로 이어서 확인하세요.",
  alternates: {
    canonical: "/sermons",
  },
  openGraph: {
    title: "설교 목록",
    description: "등록된 설교를 검색하고 요약, 전문, 학습으로 이어서 확인하세요.",
    url: "/sermons",
  },
  twitter: {
    card: "summary",
    title: "설교 목록",
    description: "등록된 설교를 검색하고 요약, 전문, 학습으로 이어서 확인하세요.",
  },
};

export default function SermonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

