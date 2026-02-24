"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Search, Loader2, BookOpen, CheckCircle2 } from "lucide-react";
import {
  getReadSermons,
  saveListScroll,
  restoreListScroll,
} from "@/lib/preferences";

export default function SermonsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [readSet, setReadSet] = useState<Set<number>>(new Set());

  const { results, status, loadMore } = usePaginatedQuery(
    api.sermons.list,
    debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {},
    { initialNumItems: 30 }
  );

  const tags = useQuery(api.sermons.listTags, {});

  const loading = status === "LoadingFirstPage";

  // Load read status
  useEffect(() => {
    setReadSet(getReadSermons());
  }, []);

  // Restore scroll position on mount
  useEffect(() => {
    restoreListScroll();
  }, []);

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

  // Filter by tag (client-side)
  const filteredResults = useMemo(() => {
    if (!selectedTag) return results;
    return results.filter((s) => {
      if (!s.tags) return false;
      return s.tags.split(",").some((t: string) => t.trim() === selectedTag);
    });
  }, [results, selectedTag]);

  // Infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0]?.isIntersecting) {
      loadMoreRef.current(30);
    }
  }, []);

  useEffect(() => {
    if (status !== "CanLoadMore") return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [status, handleIntersect]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
          설교 목록
        </h1>
        <p className="mt-2 text-base leading-7 text-muted-foreground">
          등록된 설교를 검색하고 학습을 시작하세요.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          placeholder="설교 제목으로 검색..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full rounded-xl bg-card py-3.5 pl-11 pr-4 text-base text-foreground shadow-sm ring-1 ring-border placeholder:text-subtle transition-shadow focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
        />
      </div>

      {/* Tag Filter Chips */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              !selectedTag
                ? "bg-[#3182F6] text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            전체
          </button>
          {tags.map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedTag === tag
                  ? "bg-[#3182F6] text-white"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {tag}
              <span className="ml-1 opacity-60">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Sermons Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-[#3182F6]" />
        </div>
      ) : filteredResults.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card py-16 text-center shadow-sm ring-1 ring-border">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
            <BookOpen className="size-7 text-subtle" />
          </div>
          {searchQuery ? (
            <p className="text-sm text-muted-foreground">
              &ldquo;{searchQuery}&rdquo;에 대한 검색 결과가 없습니다.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">아직 등록된 설교가 없습니다.</p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-muted-foreground">
            {filteredResults.length}개의 설교
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredResults.map((sermon) => {
              const sermonTags = sermon.tags
                ? sermon.tags.split(",").map((t: string) => t.trim())
                : [];
              const isRead = readSet.has(sermon.originalId);
              return (
                <Link
                  key={sermon._id}
                  href={`/sermons/${sermon.originalId}`}
                  onClick={saveListScroll}
                >
                  <div className="group relative h-full rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border transition-all hover:shadow-md hover:ring-[#3182F6]/20">
                    {isRead && (
                      <CheckCircle2 className="absolute right-4 top-4 size-4 text-[#00C48C]" />
                    )}
                    <h3 className="line-clamp-2 text-base font-semibold text-foreground transition-colors group-hover:text-[#3182F6]">
                      <span className="mr-1.5 text-sm font-normal text-subtle">#{sermon.originalId}</span>
                      {sermon.title}
                    </h3>
                    <p className="mt-2 text-xs text-subtle">
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
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {sermon.summary}
                      </p>
                    )}
                    {sermonTags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {sermonTags.map((tag: string, index: number) => (
                          <span
                            key={`${tag}-${index}`}
                            className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
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

          {/* Infinite scroll sentinel */}
          {status === "CanLoadMore" && <div ref={sentinelRef} className="h-1" />}
          {status === "LoadingMore" && (
            <div className="flex justify-center pt-2">
              <Loader2 className="size-5 animate-spin text-[#3182F6]" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
