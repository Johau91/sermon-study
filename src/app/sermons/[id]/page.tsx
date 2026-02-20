"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  ExternalLink,
  GraduationCap,
  MessageCircle,
  Calendar,
  Loader2,
} from "lucide-react";
import { formatTranscript } from "@/lib/format-transcript";

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
        <Loader2 className="size-6 animate-spin text-[#3182F6]" />
      </div>
    );
  }

  if (error || !sermon) {
    return (
      <div className="space-y-4">
        <Link
          href="/sermons"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-[#3182F6]"
        >
          <ArrowLeft className="size-4" />
          설교 목록
        </Link>
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/[0.04]">
          {error || "설교를 찾을 수 없습니다."}
        </div>
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
      <Link
        href="/sermons"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-[#3182F6]"
      >
        <ArrowLeft className="size-4" />
        설교 목록
      </Link>

      {/* Header Card */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/[0.04]">
        <h1 className="text-[22px] font-bold text-gray-900">{sermon.title}</h1>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-400">
          <Calendar className="size-3.5" />
          {sermon.published_at
            ? new Date(sermon.published_at).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : "날짜 미상"}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200 transition-all hover:bg-gray-50 active:scale-[0.97]"
          >
            <ExternalLink className="size-4" />
            YouTube에서 보기
          </a>
          <Link
            href={`/study?sermonId=${sermon.id}`}
            className="flex items-center gap-2 rounded-xl bg-[#3182F6] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#2B71DE] active:scale-[0.97]"
          >
            <GraduationCap className="size-4" />
            퀴즈 시작
          </Link>
          <Link
            href={`/chat?sermonId=${sermon.id}`}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200 transition-all hover:bg-gray-50 active:scale-[0.97]"
          >
            <MessageCircle className="size-4" />
            이 설교에 대해 질문하기
          </Link>
        </div>
      </div>

      {/* Summary */}
      {sermon.summary && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/[0.04]">
          <h2 className="text-lg font-bold text-gray-900">요약</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
            {sermon.summary}
          </p>
        </div>
      )}

      {/* Transcript */}
      {sermon.transcript_raw && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          <div className="px-6 pt-6 pb-4">
            <h2 className="text-lg font-bold text-gray-900">설교 전문</h2>
            <p className="mt-1 text-xs text-gray-400">
              전체 설교 내용을 확인할 수 있습니다.
            </p>
          </div>
          <div className="border-t border-gray-100" />
          <div className="px-6 py-4">
            <ScrollArea className="h-[500px]">
              <div className="whitespace-pre-wrap text-[15px] leading-7 text-gray-700">
                {formatTranscript(sermon.transcript_raw)}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
