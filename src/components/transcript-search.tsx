"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";

interface Props {
  transcript: string;
  fontSize: number;
}

export default function TranscriptSearch({ transcript, fontSize }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const matchRefs = useRef<(HTMLElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
    matchRefs.current = [];
  }, [debouncedQuery]);

  // Build highlighted segments
  const { segments, matchCount } = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return { segments: [{ text: transcript, isMatch: false }], matchCount: 0 };
    }

    const escaped = debouncedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = transcript.split(regex);

    let count = 0;
    const segs = parts.map((part) => {
      const isMatch = regex.test(part);
      regex.lastIndex = 0; // reset regex state
      if (isMatch) count++;
      return { text: part, isMatch };
    });

    return { segments: segs, matchCount: count };
  }, [transcript, debouncedQuery]);

  // Scroll to active match
  useEffect(() => {
    if (matchCount === 0) return;
    const el = matchRefs.current[activeIndex];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex, matchCount]);

  const goNext = useCallback(() => {
    if (matchCount === 0) return;
    setActiveIndex((prev) => (prev + 1) % matchCount);
  }, [matchCount]);

  const goPrev = useCallback(() => {
    if (matchCount === 0) return;
    setActiveIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }, [matchCount]);

  const resetSearch = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setActiveIndex(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) goPrev();
        else goNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        resetSearch();
      }
    },
    [goNext, goPrev, resetSearch]
  );

  // Render highlighted transcript
  let matchIdx = 0;
  const rendered = segments.map((seg, i) => {
    if (!seg.isMatch) {
      return <span key={i}>{seg.text}</span>;
    }
    const currentMatchIdx = matchIdx++;
    const isActive = currentMatchIdx === activeIndex;
    return (
      <mark
        key={i}
        ref={(el) => {
          matchRefs.current[currentMatchIdx] = el;
        }}
        className={
          isActive
            ? "rounded-sm bg-[#3182F6]/30 text-foreground"
            : "rounded-sm bg-yellow-200 text-foreground dark:bg-yellow-500/30"
        }
      >
        {seg.text}
      </mark>
    );
  });

  return (
    <div>
      {/* Search bar */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex flex-1 items-center">
          <Search className="absolute left-2.5 size-3.5 text-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="본문 검색..."
            className="h-8 w-full rounded-lg bg-muted pl-8 pr-8 text-[13px] text-foreground placeholder:text-subtle outline-none transition-colors focus:ring-2 focus:ring-[#3182F6]/30"
          />
          {query && (
            <button
              type="button"
              onClick={resetSearch}
              className="absolute right-2 flex items-center justify-center text-subtle hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {matchCount > 0 && (
          <>
            <span className="shrink-0 text-[11px] text-subtle">
              {activeIndex + 1}/{matchCount}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={goPrev}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
                aria-label="이전 매치"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
                aria-label="다음 매치"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Transcript with highlights */}
      <div
        ref={containerRef}
        className="whitespace-pre-line leading-[1.85] text-foreground"
        style={{ fontSize: `${fontSize}px` }}
      >
        {rendered}
      </div>
    </div>
  );
}
