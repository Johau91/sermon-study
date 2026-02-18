"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  ExternalLink,
  GraduationCap,
  MessageCircle,
  Calendar,
  Loader2,
} from "lucide-react";

interface Sermon {
  id: number;
  youtube_id: string;
  title: string;
  published_at: string | null;
  transcript_raw: string | null;
  summary: string | null;
  tags: string | null;
  created_at: string;
}

export default function SermonDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [sermon, setSermon] = useState<Sermon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSermon() {
      try {
        setLoading(true);
        const res = await fetch(`/api/sermons/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("설교를 찾을 수 없습니다.");
          }
          throw new Error("설교를 불러올 수 없습니다.");
        }
        const data = await res.json();
        setSermon(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "설교를 불러오는 중 오류가 발생했습니다."
        );
      } finally {
        setLoading(false);
      }
    }

    if (id) fetchSermon();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">불러오는 중...</span>
      </div>
    );
  }

  if (error || !sermon) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/sermons">
            <ArrowLeft className="mr-2 size-4" />
            설교 목록
          </Link>
        </Button>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {error || "설교를 찾을 수 없습니다."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const tags = sermon.tags
    ? sermon.tags.split(",").map((t) => t.trim())
    : [];
  const youtubeUrl = `https://www.youtube.com/watch?v=${sermon.youtube_id}`;

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <Button asChild variant="ghost" size="sm">
        <Link href="/sermons">
          <ArrowLeft className="mr-2 size-4" />
          설교 목록
        </Link>
      </Button>

      {/* Header Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{sermon.title}</CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Calendar className="size-4" />
            {sermon.published_at
              ? new Date(sermon.published_at).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "날짜 미상"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" size="sm">
              <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 size-4" />
                YouTube에서 보기
              </a>
            </Button>
            <Button asChild size="sm">
              <Link href={`/study?sermonId=${sermon.id}`}>
                <GraduationCap className="mr-2 size-4" />
                퀴즈 시작
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/chat?sermonId=${sermon.id}`}>
                <MessageCircle className="mr-2 size-4" />
                이 설교에 대해 질문하기
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {sermon.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">요약</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {sermon.summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Transcript */}
      {sermon.transcript_raw && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">설교 전문</CardTitle>
            <CardDescription>
              전체 설교 내용을 확인할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <ScrollArea className="h-[500px]">
              <div className="whitespace-pre-wrap text-sm leading-7">
                {sermon.transcript_raw}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
