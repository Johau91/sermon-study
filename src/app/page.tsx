"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  GraduationCap,
  MessageCircle,
  TrendingUp,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface Sermon {
  id: number;
  youtube_id: string;
  title: string;
  published_at: string | null;
  tags: string | null;
  created_at: string;
}

interface Stats {
  totalSermons: number;
  completedStudies: number;
  quizScore: number;
}

export default function DashboardPage() {
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalSermons: 0,
    completedStudies: 0,
    quizScore: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        const sermonsRes = await fetch("/api/sermons");
        if (sermonsRes.ok) {
          const sermonsData = await sermonsRes.json();
          const sermonList = Array.isArray(sermonsData)
            ? sermonsData
            : sermonsData.sermons || [];
          setSermons(sermonList);
          setStats((prev) => ({
            ...prev,
            totalSermons: sermonList.length,
          }));
        }

        const quizRes = await fetch("/api/quiz?today=true");
        if (quizRes.ok) {
          const quizData = await quizRes.json();
          setStats((prev) => ({
            ...prev,
            completedStudies: quizData.completedStudies ?? prev.completedStudies,
            quizScore: quizData.averageScore ?? prev.quizScore,
          }));
        }
      } catch (err) {
        setError("데이터를 불러오는 중 오류가 발생했습니다.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const statCards = [
    {
      title: "전체 설교",
      value: stats.totalSermons,
      icon: BookOpen,
      description: "등록된 설교 수",
      color: "#3182F6",
      bgColor: "bg-[#3182F6]/10",
    },
    {
      title: "완료한 학습",
      value: stats.completedStudies,
      icon: GraduationCap,
      description: "퀴즈 완료 횟수",
      color: "#00C48C",
      bgColor: "bg-[#00C48C]/10",
    },
    {
      title: "퀴즈 점수",
      value: `${stats.quizScore}%`,
      icon: TrendingUp,
      description: "평균 정답률",
      color: "#FF6B6B",
      bgColor: "bg-[#FF6B6B]/10",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-gray-900">
          오늘의 학습
        </h1>
        <p className="mt-2 text-[15px] text-gray-500">
          말씀을 통해 매일 성장하세요. 설교를 듣고, 질문하고, 퀴즈로 확인하세요.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2.5">
        <Link
          href="/sermons"
          className="flex items-center gap-2 rounded-xl bg-[#3182F6] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#2B71DE] active:scale-[0.97]"
        >
          <BookOpen className="size-4" />
          설교 보기
        </Link>
        <Link
          href="/chat"
          className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-black/[0.04] transition-all hover:bg-gray-50 active:scale-[0.97]"
        >
          <MessageCircle className="size-4" />
          AI에게 질문하기
        </Link>
        <Link
          href="/study"
          className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-black/[0.04] transition-all hover:bg-gray-50 active:scale-[0.97]"
        >
          <GraduationCap className="size-4" />
          학습 시작
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {statCards.map((stat) => (
          <div
            key={stat.title}
            className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04]"
          >
            <div className="flex items-center gap-3">
              <div className={`flex size-10 items-center justify-center rounded-xl ${stat.bgColor}`}>
                <stat.icon className="size-5" style={{ color: stat.color }} />
              </div>
              <span className="text-sm font-medium text-gray-500">{stat.title}</span>
            </div>
            <p className="mt-3 text-[28px] font-bold text-gray-900">
              {loading ? (
                <span className="inline-block h-8 w-16 animate-pulse rounded-lg bg-gray-100" />
              ) : (
                stat.value
              )}
            </p>
            <p className="mt-1 text-xs text-gray-400">{stat.description}</p>
          </div>
        ))}
      </div>

      {/* Recent Sermons */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">최근 설교</h2>
          <Link
            href="/sermons"
            className="flex items-center gap-0.5 text-sm font-medium text-gray-500 transition-colors hover:text-[#3182F6]"
          >
            전체 보기
            <ChevronRight className="size-4" />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-[#3182F6]" />
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/[0.04]">
            {error}
          </div>
        ) : sermons.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/[0.04]">
            아직 등록된 설교가 없습니다. 설교를 추가해주세요.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sermons.slice(0, 4).map((sermon) => (
              <Link key={sermon.id} href={`/sermons/${sermon.id}`}>
                <div className="group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04] transition-all hover:shadow-md hover:ring-[#3182F6]/20">
                  <h3 className="text-[15px] font-semibold text-gray-900 line-clamp-2 group-hover:text-[#3182F6] transition-colors">
                    {sermon.title}
                  </h3>
                  <p className="mt-2 text-xs text-gray-400">
                    {sermon.published_at
                      ? new Date(sermon.published_at).toLocaleDateString("ko-KR")
                      : "날짜 미상"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
