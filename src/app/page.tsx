"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

        // Fetch sermons
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

        // Fetch today's quiz status
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
    },
    {
      title: "완료한 학습",
      value: stats.completedStudies,
      icon: GraduationCap,
      description: "퀴즈 완료 횟수",
    },
    {
      title: "퀴즈 점수",
      value: `${stats.quizScore}%`,
      icon: TrendingUp,
      description: "평균 정답률",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">오늘의 학습</h1>
        <p className="mt-2 text-muted-foreground">
          말씀을 통해 매일 성장하세요. 설교를 듣고, 질문하고, 퀴즈로 확인하세요.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/sermons">
            <BookOpen className="mr-2 size-4" />
            설교 보기
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/chat">
            <MessageCircle className="mr-2 size-4" />
            AI에게 질문하기
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/study">
            <GraduationCap className="mr-2 size-4" />
            학습 시작
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <stat.icon className="size-4" />
                {stat.title}
              </CardDescription>
              <CardTitle className="text-2xl">{loading ? "-" : stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Sermons */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">최근 설교</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/sermons">
              전체 보기 <ChevronRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">불러오는 중...</span>
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {error}
            </CardContent>
          </Card>
        ) : sermons.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              아직 등록된 설교가 없습니다. 설교를 추가해주세요.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sermons.slice(0, 4).map((sermon) => {
              const tags = sermon.tags
                ? sermon.tags.split(",").map((t) => t.trim())
                : [];
              return (
                <Link key={sermon.id} href={`/sermons/${sermon.id}`}>
                  <Card className="transition-colors hover:bg-accent/50 cursor-pointer h-full">
                    <CardHeader>
                      <CardTitle className="text-base line-clamp-2">
                        {sermon.title}
                      </CardTitle>
                      <CardDescription>
                        {sermon.published_at
                          ? new Date(sermon.published_at).toLocaleDateString(
                              "ko-KR"
                            )
                          : "날짜 미상"}
                      </CardDescription>
                    </CardHeader>
                    {tags.length > 0 && (
                      <CardContent>
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
