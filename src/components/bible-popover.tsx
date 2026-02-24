"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { BibleRef } from "../../convex/lib/bibleParser";
import { Loader2 } from "lucide-react";

interface Props {
  bibleRef: BibleRef;
  anchorEl: HTMLElement;
  onClose: () => void;
}

export default function BiblePopover({ bibleRef, anchorEl, onClose }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [flipAbove, setFlipAbove] = useState(false);

  const verses = useQuery(api.bible.getVerses, {
    translation: "개역한글",
    book: bibleRef.book,
    chapter: bibleRef.chapter,
    verseStart: bibleRef.verseStart,
    verseEnd: bibleRef.verseEnd,
  });

  // Position the popover
  const updatePosition = useCallback(() => {
    const rect = anchorEl.getBoundingClientRect();
    const popoverHeight = popoverRef.current?.offsetHeight ?? 200;
    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldFlip = spaceBelow < popoverHeight + 8 && rect.top > spaceBelow;

    setFlipAbove(shouldFlip);
    setPosition({
      top: shouldFlip ? rect.top + window.scrollY - 8 : rect.bottom + window.scrollY + 8,
      left: Math.max(
        8,
        Math.min(
          rect.left + window.scrollX + rect.width / 2 - 160,
          window.innerWidth - 328
        )
      ),
    });
  }, [anchorEl]);

  useEffect(() => {
    updatePosition();
  }, [updatePosition, verses]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorEl, onClose]);

  const label =
    bibleRef.verseStart === bibleRef.verseEnd
      ? `${bibleRef.book} ${bibleRef.chapter}:${bibleRef.verseStart}`
      : `${bibleRef.book} ${bibleRef.chapter}:${bibleRef.verseStart}-${bibleRef.verseEnd}`;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={label}
      className="fixed z-50 w-80 rounded-xl bg-popover p-4 shadow-lg ring-1 ring-border"
      style={{
        top: position.top,
        left: position.left,
        transform: flipAbove ? "translateY(-100%)" : undefined,
      }}
    >
      <p className="mb-2 text-[13px] font-semibold text-foreground">{label}</p>
      {verses === undefined ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="size-4 animate-spin text-subtle" />
        </div>
      ) : verses.length === 0 ? (
        <p className="text-[13px] text-subtle">구절을 찾을 수 없습니다.</p>
      ) : (
        <div className="space-y-1 text-[13px] leading-relaxed text-foreground">
          {verses.map((v) => (
            <p key={v.verse}>
              <span className="mr-1 text-subtle">{v.verse}</span>
              {v.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
