"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, BookOpen } from "lucide-react";

interface Sermon {
  id: number;
  youtube_id: string;
  title: string;
  published_at: string | null;
  summary: string | null;
  tags: string | null;
  created_at: string;
}

export default function SermonsPage() {
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSermons() {
      try {
        setLoading(true);
        const res = await fetch("/api/sermons");
        if (!res.ok) throw new Error("설교 목록을 불러올 수 없습니다.");
        const data = await res.json();
        setSermons(Array.isArray(data) ? data : data.sermons || []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "설교 목록을 불러오는 중 오류가 발생했습니다."
        );
      } finally {
        setLoading(false);
      }
    }

    fetchSermons();
  }, []);

  const filteredSermons = useMemo(() => {
    if (!searchQuery.trim()) return sermons;
    const query = searchQuery.toLowerCase();
    return sermons.filter(
      (sermon) =>
        sermon.title.toLowerCase().includes(query) ||
        (sermon.tags && sermon.tags.toLowerCase().includes(query)) ||
        (sermon.summary && sermon.summary.toLowerCase().includes(query))
    );
  }, [sermons, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">설교 목록</h1>
        <p className="mt-2 text-muted-foreground">
          등록된 설교를 검색하고 학습을 시작하세요.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="설교 제목, 태그로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Sermons Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">불러오는 중...</span>
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {error}
          </CardContent>
        </Card>
      ) : filteredSermons.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <BookOpen className="size-10 opacity-40" />
            {searchQuery ? (
              <p>&ldquo;{searchQuery}&rdquo;에 대한 검색 결과가 없습니다.</p>
            ) : (
              <p>아직 등록된 설교가 없습니다.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {filteredSermons.length}개의 설교
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSermons.map((sermon) => {
              const tags = sermon.tags
                ? sermon.tags.split(",").map((t) => t.trim())
                : [];
              return (
                <Link key={sermon.id} href={`/sermons/${sermon.id}`}>
                  <Card className="h-full cursor-pointer transition-colors hover:bg-accent/50">
                    <CardHeader>
                      <CardTitle className="text-base line-clamp-2">
                        {sermon.title}
                      </CardTitle>
                      <CardDescription>
                        {sermon.published_at
                          ? new Date(sermon.published_at).toLocaleDateString(
                              "ko-KR",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              }
                            )
                          : "날짜 미상"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {sermon.summary && (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {sermon.summary}
                        </p>
                      )}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
