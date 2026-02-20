"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
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
        <h1 className="text-[28px] font-bold tracking-tight text-gray-900">
          설교 목록
        </h1>
        <p className="mt-2 text-[15px] text-gray-500">
          등록된 설교를 검색하고 학습을 시작하세요.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="설교 제목, 태그로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl bg-white py-3 pl-11 pr-4 text-[15px] text-gray-800 shadow-sm ring-1 ring-black/[0.04] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30 transition-shadow"
        />
      </div>

      {/* Sermons Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-[#3182F6]" />
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/[0.04]">
          {error}
        </div>
      ) : filteredSermons.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-16 text-center shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gray-100">
            <BookOpen className="size-7 text-gray-400" />
          </div>
          {searchQuery ? (
            <p className="text-sm text-gray-500">
              &ldquo;{searchQuery}&rdquo;에 대한 검색 결과가 없습니다.
            </p>
          ) : (
            <p className="text-sm text-gray-500">아직 등록된 설교가 없습니다.</p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-500">
            {filteredSermons.length}개의 설교
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSermons.map((sermon) => {
              const tags = sermon.tags
                ? sermon.tags.split(",").map((t) => t.trim())
                : [];
              return (
                <Link key={sermon.id} href={`/sermons/${sermon.id}`}>
                  <div className="group h-full rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04] transition-all hover:shadow-md hover:ring-[#3182F6]/20">
                    <h3 className="text-[15px] font-semibold text-gray-900 line-clamp-2 group-hover:text-[#3182F6] transition-colors">
                      {sermon.title}
                    </h3>
                    <p className="mt-2 text-xs text-gray-400">
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
                    </p>
                    {sermon.summary && (
                      <p className="mt-3 line-clamp-2 text-sm text-gray-500">
                        {sermon.summary}
                      </p>
                    )}
                    {tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
