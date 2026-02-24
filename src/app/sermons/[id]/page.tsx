"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  Play,
  GraduationCap,
  MessageCircle,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Minus,
  Plus,
  StickyNote,
} from "lucide-react";
import {
  getFontSize,
  setFontSize as saveFontSize,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  markAsRead,
  setLastRead,
  getSermonNote,
  setSermonNote,
} from "@/lib/preferences";
import TranscriptSearch from "@/components/transcript-search";
import SimilarSermons from "@/components/similar-sermons";

export default function SermonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id as string);

  const sermon = useQuery(api.sermons.getByOriginalId, { originalId: id });
  const adjacent = useQuery(api.sermons.getAdjacentByOriginalId, { originalId: id });
  const updateTranscript = useMutation(api.sermons.updateTranscript);

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Font size
  const [fontSize, setFontSizeState] = useState(15);
  useEffect(() => {
    setFontSizeState(getFontSize());
  }, []);

  const changeFontSize = (delta: number) => {
    const next = saveFontSize(fontSize + delta);
    setFontSizeState(next);
  };

  // Reading progress
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Mark as read + last read tracking
  useEffect(() => {
    if (sermon && sermon.title) {
      markAsRead(id);
      setLastRead(id, 0, sermon.title);
    }
  }, [id, sermon]);

  // Debounced last read scroll update
  useEffect(() => {
    if (!sermon) return;
    let timer: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setLastRead(id, window.scrollY, sermon.title);
      }, 1000);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [id, sermon]);

  // Sermon notes
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const noteTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setNoteText(getSermonNote(id));
  }, [id]);

  const handleNoteChange = (value: string) => {
    setNoteText(value);
    clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => {
      setSermonNote(id, value);
    }, 1000);
  };

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when editing text
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (!adjacent) return;

      if (e.key === "ArrowLeft" && adjacent.next) {
        router.push(`/sermons/${adjacent.next.originalId}`);
      } else if (e.key === "ArrowRight" && adjacent.prev) {
        router.push(`/sermons/${adjacent.prev.originalId}`);
      }
    },
    [adjacent, router]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const loading = sermon === undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" role="status" aria-label="로딩 중">
        <Loader2 className="size-6 animate-spin text-[#3182F6]" />
      </div>
    );
  }

  if (sermon === null) {
    return (
      <div className="space-y-4">
        <Link
          href="/sermons"
          className="inline-flex items-center gap-1 text-sm text-subtle hover:text-[#3182F6]"
        >
          <ArrowLeft className="size-3.5" />
          목록
        </Link>
        <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border">
          설교를 찾을 수 없습니다.
        </div>
      </div>
    );
  }

  const tags = sermon.tags ? sermon.tags.split(",").map((t) => t.trim()) : [];
  const youtubeUrl = `https://www.youtube.com/watch?v=${sermon.youtubeId}`;
  const displayTranscript =
    sermon.transcriptCorrected || sermon.transcriptRaw || "";

  const dateStr = sermon.publishedAt
    ? new Date(sermon.publishedAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "날짜 미상";

  const startEdit = () => {
    setSaveError(null);
    setEditText(displayTranscript);
    setEditing(true);
    setMenuOpen(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSaveError(null);
  };

  const saveTranscriptHandler = async () => {
    if (!editText.trim()) {
      setSaveError("설교 전문은 비워둘 수 없습니다.");
      return;
    }
    try {
      setSaving(true);
      setSaveError(null);
      await updateTranscript({ id: sermon._id, transcript: editText });
      setEditing(false);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "저장 중 오류가 발생했습니다."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Reading progress bar */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="읽기 진행률"
        className="fixed left-0 top-0 z-[60] h-[3px] origin-left bg-primary transition-transform duration-150 motion-reduce:transition-none"
        style={{ transform: `scaleX(${progress / 100})`, width: "100%" }}
      />

      <div className="space-y-3">
        {/* Back */}
        <Link
          href="/sermons"
          className="inline-flex items-center gap-1 text-[13px] text-subtle hover:text-[#3182F6]"
        >
          <ArrowLeft className="size-3.5" />
          목록
        </Link>

        {/* Header card */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
          <div className="flex items-start gap-3 px-4 pt-4 pb-3 sm:px-5">
            {/* Title & meta */}
            <div className="min-w-0 flex-1">
              <h1 className="text-[16px] font-bold leading-snug text-foreground sm:text-lg">
                {sermon.title}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-subtle">
                <span>{dateStr}</span>
                {tags.map((tag, i) => (
                  <span key={i} className="rounded bg-muted px-1.5 py-px font-medium text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Quick menu */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="메뉴"
                aria-expanded={menuOpen}
                className="flex size-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-muted hover:text-foreground"
              >
                <MoreVertical className="size-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-xl bg-popover py-1 shadow-lg ring-1 ring-border">
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-foreground transition-colors hover:bg-muted"
                  >
                    <Play className="size-4 text-red-500" />
                    영상 보기
                  </a>
                  <Link
                    href={`/study?sermonId=${sermon.originalId}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-foreground transition-colors hover:bg-muted"
                  >
                    <GraduationCap className="size-4 text-[#3182F6]" />
                    퀴즈
                  </Link>
                  <Link
                    href={`/chat?sermonId=${sermon.originalId}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-foreground transition-colors hover:bg-muted"
                  >
                    <MessageCircle className="size-4 text-subtle" />
                    질문하기
                  </Link>
                  {displayTranscript && !editing && (
                    <>
                      <div className="mx-3 my-1 border-t border-border" />
                      <button
                        type="button"
                        onClick={startEdit}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-foreground transition-colors hover:bg-muted"
                      >
                        <Pencil className="size-4 text-subtle" />
                        전문 수정
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Summary accordion */}
          {sermon.summary && (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => setSummaryOpen(!summaryOpen)}
                aria-expanded={summaryOpen}
                className="flex w-full items-center justify-between px-4 py-2.5 sm:px-5"
              >
                <span className="text-[12px] font-semibold text-muted-foreground">요약</span>
                <ChevronDown
                  className={`size-3.5 text-subtle transition-transform duration-200 motion-reduce:transition-none ${summaryOpen ? "rotate-180" : ""}`}
                />
              </button>
              {summaryOpen && (
                <div className="border-t border-border/50 px-4 pb-4 pt-2 sm:px-5">
                  <p className="text-[13px] leading-[1.7] text-muted-foreground">
                    {sermon.summary}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transcript */}
        {displayTranscript && (
          <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {editing && (
              <div className="flex items-center justify-between border-b border-border px-4 py-2 sm:px-5">
                <span className="text-[11px] font-medium text-subtle">편집 중</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground ring-1 ring-border hover:bg-muted disabled:opacity-60"
                  >
                    <X className="size-3" />
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={saveTranscriptHandler}
                    disabled={saving}
                    className="flex h-7 items-center gap-1 rounded-md bg-[#3182F6] px-2 text-[11px] font-semibold text-white hover:bg-[#2B71DE] disabled:opacity-70"
                  >
                    {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                    저장
                  </button>
                </div>
              </div>
            )}

            <div className="px-4 py-4 sm:px-5 sm:py-5">
              {!editing && (
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
                    {sermon.transcriptCorrected ? "교정본" : "원문"}
                  </p>
                  {/* Font size controls */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => changeFontSize(-1)}
                      disabled={fontSize <= MIN_FONT_SIZE}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                      aria-label="글자 줄이기"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="w-8 text-center text-[11px] font-medium text-subtle">
                      {fontSize}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeFontSize(1)}
                      disabled={fontSize >= MAX_FONT_SIZE}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                      aria-label="글자 키우기"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                </div>
              )}
              {editing ? (
                <div className="space-y-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="h-[60vh] min-h-[280px] w-full resize-y rounded-xl border border-border bg-card px-4 py-3 text-[15px] leading-8 text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3182F6]"
                  />
                  {saveError && (
                    <p className="text-sm text-red-500">{saveError}</p>
                  )}
                </div>
              ) : (
                <TranscriptSearch transcript={displayTranscript} fontSize={fontSize} />
              )}
            </div>
          </div>
        )}

        {/* Sermon Notes */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
          <button
            type="button"
            onClick={() => setNoteOpen(!noteOpen)}
            aria-expanded={noteOpen}
            className="flex w-full items-center justify-between px-4 py-3 sm:px-5"
          >
            <div className="flex items-center gap-2">
              <StickyNote className="size-4 text-subtle" />
              <span className="text-sm font-semibold text-foreground">메모</span>
              {noteText && !noteOpen && (
                <span className="text-xs text-muted-foreground">작성됨</span>
              )}
            </div>
            <ChevronDown
              className={`size-3.5 text-subtle transition-transform duration-200 motion-reduce:transition-none ${noteOpen ? "rotate-180" : ""}`}
            />
          </button>
          {noteOpen && (
            <div className="border-t border-border px-4 pb-4 pt-3 sm:px-5">
              <textarea
                value={noteText}
                onChange={(e) => handleNoteChange(e.target.value)}
                rows={4}
                placeholder="이 설교에 대한 메모를 자유롭게 작성하세요..."
                className="w-full resize-none rounded-xl bg-muted p-4 text-sm leading-7 text-foreground placeholder:text-subtle transition-all focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3182F6]/30"
              />
            </div>
          )}
        </div>

        {/* Similar sermons */}
        {sermon.summary && (
          <SimilarSermons sermonId={sermon._id} summaryText={sermon.summary} />
        )}

        {/* Prev / Next navigation */}
        {adjacent && (adjacent.prev || adjacent.next) && (
          <div className="flex gap-3">
            {adjacent.next ? (
              <Link
                href={`/sermons/${adjacent.next.originalId}`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition-all hover:shadow-md hover:ring-[#3182F6]/20"
              >
                <ChevronLeft className="size-4 shrink-0 text-subtle" />
                <div className="min-w-0">
                  <p className="text-[11px] text-subtle">이전 설교</p>
                  <p className="truncate text-sm font-medium text-foreground">{adjacent.next.title}</p>
                </div>
              </Link>
            ) : (
              <div className="flex-1" />
            )}
            {adjacent.prev ? (
              <Link
                href={`/sermons/${adjacent.prev.originalId}`}
                className="flex min-w-0 flex-1 items-center justify-end gap-2 rounded-2xl bg-card p-4 text-right shadow-sm ring-1 ring-border transition-all hover:shadow-md hover:ring-[#3182F6]/20"
              >
                <div className="min-w-0">
                  <p className="text-[11px] text-subtle">다음 설교</p>
                  <p className="truncate text-sm font-medium text-foreground">{adjacent.prev.title}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-subtle" />
              </Link>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        )}
      </div>
    </>
  );
}
