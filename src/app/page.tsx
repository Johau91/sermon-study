"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  BookOpen,
  GraduationCap,
  MessageCircle,
  TrendingUp,
  ChevronRight,
  Loader2,
  BookMarked,
} from "lucide-react";
import { getLastRead } from "@/lib/preferences";

export default function DashboardPage() {
  const sermons = useQuery(api.sermons.recent, { limit: 4 });
  const totalCount = useQuery(api.sermons.totalCount, {});
  const quizStats = useQuery(api.quiz.getStats, {});

  const [lastRead, setLastRead] = useState<ReturnType<typeof getLastRead>>(null);
  useEffect(() => {
    setLastRead(getLastRead());
  }, []);

  const loading = sermons === undefined || quizStats === undefined;

  const stats = {
    totalSermons: totalCount ?? 0,
    completedStudies: quizStats?.completedStudies ?? 0,
    quizScore: quizStats?.averageScore ?? 0,
  };

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
    <div className="space-y-6 sm:space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
          오늘의 학습
        </h1>
        <p className="mt-2 text-base leading-7 text-muted-foreground">
          말씀을 통해 매일 성장하세요. 설교를 듣고, 질문하고, 퀴즈로 확인하세요.
        </p>
      </div>

      {/* Continue Reading */}
      {lastRead && (
        <Link
          href={`/sermons/${lastRead.id}`}
          className="flex items-center gap-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border transition-all hover:shadow-md hover:ring-[#3182F6]/20"
        >
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#3182F6]/10">
            <BookMarked className="size-5 text-[#3182F6]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[#3182F6]">이어읽기</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
              {lastRead.title || `설교 #${lastRead.id}`}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-subtle" />
        </Link>
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2.5">
        <Link
          href="/sermons"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3182F6] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#2B71DE] active:scale-[0.97] sm:w-auto"
        >
          <BookOpen className="size-4" />
          설교 보기
        </Link>
        <Link
          href="/chat"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-sm ring-1 ring-border transition-all hover:bg-muted active:scale-[0.97] sm:w-auto"
        >
          <MessageCircle className="size-4" />
          AI에게 질문하기
        </Link>
        <Link
          href="/study"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-sm ring-1 ring-border transition-all hover:bg-muted active:scale-[0.97] sm:w-auto"
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
            className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border"
          >
            <div className="flex items-center gap-3">
              <div className={`flex size-10 items-center justify-center rounded-xl ${stat.bgColor}`}>
                <stat.icon className="size-5" style={{ color: stat.color }} />
              </div>
              <span className="text-sm font-medium text-muted-foreground">{stat.title}</span>
            </div>
            <p className="mt-3 text-[28px] font-bold text-foreground">
              {loading ? (
                <span className="inline-block h-8 w-16 animate-pulse rounded-lg bg-muted" />
              ) : (
                stat.value
              )}
            </p>
            <p className="mt-1 text-xs text-subtle">{stat.description}</p>
          </div>
        ))}
      </div>

      {/* Recent Sermons */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">최근 설교</h2>
          <Link
            href="/sermons"
            className="flex items-center gap-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-[#3182F6]"
          >
            전체 보기
            <ChevronRight className="size-4" />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-[#3182F6]" />
          </div>
        ) : !sermons || sermons.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border">
            아직 등록된 설교가 없습니다. 설교를 추가해주세요.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sermons.slice(0, 4).map((sermon) => (
              <Link key={sermon._id} href={`/sermons/${sermon.originalId}`}>
                <div className="group rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border transition-all hover:shadow-md hover:ring-[#3182F6]/20">
                  <h3 className="line-clamp-2 text-base font-semibold text-foreground transition-colors group-hover:text-[#3182F6]">
                    {sermon.title}
                  </h3>
                  <p className="mt-2 text-xs text-subtle">
                    {sermon.publishedAt
                      ? new Date(sermon.publishedAt).toLocaleDateString("ko-KR")
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
