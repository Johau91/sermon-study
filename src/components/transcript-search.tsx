"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { parseBibleReference, type BibleRef } from "../../convex/lib/bibleParser";
import BiblePopover from "./bible-popover";

const BIBLE_REF_RE =
  /([가-힣0-9]{1,10}\s*\d{1,3}\s*(?::|장\s*)\s*\d{1,3}(?:\s*[-~]\s*\d{1,3}(?:\s*절)?)?\s*(?:절)?)/g;

interface Segment {
  text: string;
  isMatch: boolean;
  bibleRef: BibleRef | null;
}

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
  const [popover, setPopover] = useState<{
    ref: BibleRef;
    anchorEl: HTMLElement;
  } | null>(null);

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

  // Build highlighted segments (2-pass: search + bible refs)
  const { segments, matchCount } = useMemo(() => {
    // Pass 1: split by search query
    let pass1: { text: string; isMatch: boolean }[];
    let count = 0;

    if (!debouncedQuery.trim()) {
      pass1 = [{ text: transcript, isMatch: false }];
    } else {
      const escaped = debouncedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escaped})`, "gi");
      const parts = transcript.split(regex);
      pass1 = parts.map((part) => {
        const isMatch = regex.test(part);
        regex.lastIndex = 0;
        if (isMatch) count++;
        return { text: part, isMatch };
      });
    }

    // Pass 2: split each segment's text by bible references
    const pass2: Segment[] = [];
    for (const seg of pass1) {
      const subParts = seg.text.split(BIBLE_REF_RE);
      for (const sub of subParts) {
        if (!sub) continue;
        const parsed = parseBibleReference(sub.trim());
        pass2.push({
          text: sub,
          isMatch: seg.isMatch,
          bibleRef: parsed,
        });
      }
    }

    return { segments: pass2, matchCount: count };
  }, [transcript, debouncedQuery]);

  // Scroll to active match (respect reduced motion)
  useEffect(() => {
    if (matchCount === 0) return;
    const el = matchRefs.current[activeIndex];
    if (el) {
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: prefersReduced ? "instant" : "smooth", block: "center" });
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

  const handleBibleClick = useCallback(
    (ref: BibleRef, el: HTMLElement) => {
      setPopover((prev) =>
        prev && prev.anchorEl === el ? null : { ref, anchorEl: el }
      );
    },
    []
  );

  // Render highlighted transcript
  let matchIdx = 0;
  const rendered = segments.map((seg, i) => {
    const bibleButton = seg.bibleRef ? (
      <button
        key={i}
        type="button"
        className="underline decoration-[#3182F6]/40 underline-offset-2 transition-colors hover:text-[#3182F6]"
        onClick={(e) => handleBibleClick(seg.bibleRef!, e.currentTarget)}
      >
        {seg.text}
      </button>
    ) : null;

    if (!seg.isMatch) {
      return bibleButton ?? <span key={i}>{seg.text}</span>;
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
        {bibleButton ?? seg.text}
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
            className="h-8 w-full rounded-lg bg-muted pl-8 pr-8 text-[13px] text-foreground placeholder:text-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3182F6]/30"
          />
          {query && (
            <button
              type="button"
              onClick={resetSearch}
              aria-label="검색 초기화"
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
        className="whitespace-pre-line leading-[2.05] tracking-[0.012em] text-foreground"
        style={{ fontSize: `${fontSize}px` }}
      >
        {rendered}
      </div>

      {popover && (
        <BiblePopover
          bibleRef={popover.ref}
          anchorEl={popover.anchorEl}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
