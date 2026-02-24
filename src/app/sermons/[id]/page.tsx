"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
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
} from "lucide-react";

export default function SermonDetailPage() {
  const params = useParams();
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
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-[#3182F6]" />
      </div>
    );
  }

  if (sermon === null) {
    return (
      <div className="space-y-4">
        <Link
          href="/sermons"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3182F6]"
        >
          <ArrowLeft className="size-3.5" />
          목록
        </Link>
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/[0.04]">
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
    <div className="space-y-3">
      {/* Back */}
      <Link
        href="/sermons"
        className="inline-flex items-center gap-1 text-[13px] text-gray-400 hover:text-[#3182F6]"
      >
        <ArrowLeft className="size-3.5" />
        목록
      </Link>

      {/* Header card */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex items-start gap-3 px-4 pt-4 pb-3 sm:px-5">
          {/* Title & meta */}
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-bold leading-snug text-gray-900 sm:text-lg">
              {sermon.title}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-gray-400">
              <span>{dateStr}</span>
              {tags.map((tag, i) => (
                <span key={i} className="rounded bg-gray-100 px-1.5 py-px font-medium text-gray-500">
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
              className="flex size-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <MoreVertical className="size-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/[0.08]">
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Play className="size-4 text-red-500" />
                  영상 보기
                </a>
                <Link
                  href={`/study?sermonId=${sermon.originalId}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <GraduationCap className="size-4 text-[#3182F6]" />
                  퀴즈
                </Link>
                <Link
                  href={`/chat?sermonId=${sermon.originalId}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <MessageCircle className="size-4 text-gray-400" />
                  질문하기
                </Link>
                {displayTranscript && !editing && (
                  <>
                    <div className="mx-3 my-1 border-t border-gray-100" />
                    <button
                      type="button"
                      onClick={startEdit}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <Pencil className="size-4 text-gray-400" />
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
          <div className="border-t border-gray-100">
            <button
              type="button"
              onClick={() => setSummaryOpen(!summaryOpen)}
              className="flex w-full items-center justify-between px-4 py-2.5 sm:px-5"
            >
              <span className="text-[12px] font-semibold text-gray-500">요약</span>
              <ChevronDown
                className={`size-3.5 text-gray-400 transition-transform duration-200 ${summaryOpen ? "rotate-180" : ""}`}
              />
            </button>
            {summaryOpen && (
              <div className="border-t border-gray-50 px-4 pb-4 pt-2 sm:px-5">
                <p className="text-[13px] leading-[1.7] text-gray-600">
                  {sermon.summary}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transcript */}
      {displayTranscript && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          {editing && (
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 sm:px-5">
              <span className="text-[11px] font-medium text-gray-400">편집 중</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-60"
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
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-300">
                {sermon.transcriptCorrected ? "교정본" : "원문"}
              </p>
            )}
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="h-[60vh] min-h-[280px] w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-[15px] leading-8 text-gray-800 outline-none transition focus:ring-2 focus:ring-[#3182F6]"
                />
                {saveError && (
                  <p className="text-sm text-red-500">{saveError}</p>
                )}
              </div>
            ) : (
              <div className="whitespace-pre-line text-[15px] leading-[1.85] text-gray-700">
                {displayTranscript}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prev / Next navigation */}
      {adjacent && (adjacent.prev || adjacent.next) && (
        <div className="flex gap-3">
          {adjacent.next ? (
            <Link
              href={`/sermons/${adjacent.next.originalId}`}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04] transition-all hover:shadow-md hover:ring-[#3182F6]/20"
            >
              <ChevronLeft className="size-4 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400">이전 설교</p>
                <p className="truncate text-sm font-medium text-gray-700">{adjacent.next.title}</p>
              </div>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
          {adjacent.prev ? (
            <Link
              href={`/sermons/${adjacent.prev.originalId}`}
              className="flex min-w-0 flex-1 items-center justify-end gap-2 rounded-2xl bg-white p-4 text-right shadow-sm ring-1 ring-black/[0.04] transition-all hover:shadow-md hover:ring-[#3182F6]/20"
            >
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400">다음 설교</p>
                <p className="truncate text-sm font-medium text-gray-700">{adjacent.prev.title}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-gray-400" />
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      )}
    </div>
  );
}
