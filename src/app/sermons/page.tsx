"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Search, Loader2, BookOpen } from "lucide-react";

export default function SermonsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const sermons = useQuery(api.sermons.list, debouncedSearch.trim() ? { search: debouncedSearch.trim(), limit: 50 } : { limit: 50 });

  const loading = sermons === undefined;

  // Debounce search
  const debounceRef = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return (value: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => setDebouncedSearch(value), 300);
    };
  }, []);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    debounceRef(value);
  };

  const filteredSermons = sermons ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-[28px]">
          설교 목록
        </h1>
        <p className="mt-2 text-base leading-7 text-gray-500">
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
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full rounded-xl bg-white py-3.5 pl-11 pr-4 text-base text-gray-800 shadow-sm ring-1 ring-black/[0.04] placeholder:text-gray-400 transition-shadow focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
        />
      </div>

      {/* Sermons Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-[#3182F6]" />
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
                <Link key={sermon._id} href={`/sermons/${sermon.originalId}`}>
                  <div className="group h-full rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04] transition-all hover:shadow-md hover:ring-[#3182F6]/20">
                    <h3 className="line-clamp-2 text-base font-semibold text-gray-900 transition-colors group-hover:text-[#3182F6]">
                      {sermon.title}
                    </h3>
                    <p className="mt-2 text-xs text-gray-400">
                      {sermon.publishedAt
                        ? new Date(sermon.publishedAt).toLocaleDateString(
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
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-500">
                        {sermon.summary}
                      </p>
                    )}
                    {tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {tags.map((tag, index) => (
                          <span
                            key={`${tag}-${index}`}
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
