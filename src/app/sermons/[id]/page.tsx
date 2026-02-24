"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  ExternalLink,
  GraduationCap,
  MessageCircle,
  Calendar,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { formatTranscript } from "@/lib/format-transcript";

export default function SermonDetailPage() {
  const params = useParams();
  const id = Number(params.id as string);

  const sermon = useQuery(api.sermons.getByOriginalId, { originalId: id });
  const updateTranscript = useMutation(api.sermons.updateTranscript);

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

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
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-[#3182F6]"
        >
          <ArrowLeft className="size-4" />
          설교 목록
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

  const startEdit = () => {
    setSaveError(null);
    setEditText(displayTranscript);
    setEditing(true);
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
    <div className="space-y-3 sm:space-y-4">
      {/* Back */}
      <Link
        href="/sermons"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-400 transition-colors hover:text-[#3182F6]"
      >
        <ArrowLeft className="size-3.5" />
        목록
      </Link>

      {/* Single unified card for header + actions + summary */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
        {/* Title & Meta */}
        <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          <h1 className="text-[17px] font-bold leading-[1.4] text-gray-900 sm:text-xl">
            {sermon.title}
          </h1>

          <div className="mt-2 flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Calendar className="size-3" />
              {sermon.publishedAt
                ? new Date(sermon.publishedAt).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "날짜 미상"}
            </span>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag, index) => (
                  <span
                    key={`${tag}-${index}`}
                    className="rounded bg-gray-100 px-1.5 py-px text-[11px] font-medium text-gray-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-1.5 border-t border-gray-100 px-4 py-2.5 sm:px-6">
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="YouTube에서 보기"
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 active:scale-95"
          >
            <ExternalLink className="size-4" />
            <span className="hidden xs:inline sm:inline">YouTube</span>
          </a>
          <Link
            href={`/study?sermonId=${sermon.originalId}`}
            title="퀴즈 시작"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[#3182F6] px-3 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#2B71DE] active:scale-95"
          >
            <GraduationCap className="size-4" />
            퀴즈
          </Link>
          <Link
            href={`/chat?sermonId=${sermon.originalId}`}
            title="이 설교에 대해 질문하기"
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 active:scale-95"
          >
            <MessageCircle className="size-4" />
            <span className="hidden xs:inline sm:inline">질문</span>
          </Link>

          {/* Spacer + Edit button pushed to right */}
          <div className="ml-auto">
            {!editing && (sermon.transcriptCorrected || sermon.transcriptRaw) && (
              <button
                type="button"
                onClick={startEdit}
                title="텍스트 수정"
                className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <Pencil className="size-3.5" />
                <span className="hidden sm:inline">수정</span>
              </button>
            )}
          </div>
        </div>

        {/* Summary accordion */}
        {sermon.summary && (
          <>
            <div className="border-t border-gray-100">
              <button
                type="button"
                onClick={() => setSummaryOpen(!summaryOpen)}
                className="flex w-full items-center justify-between px-4 py-3 sm:px-6"
              >
                <span className="text-[13px] font-semibold text-gray-900">요약</span>
                <ChevronDown
                  className={`size-4 text-gray-400 transition-transform duration-200 ${summaryOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>
            {summaryOpen && (
              <div className="border-t border-gray-50 px-4 pb-4 pt-2 sm:px-6">
                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-600">
                  {sermon.summary}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Transcript */}
      {(sermon.transcriptCorrected || sermon.transcriptRaw) && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          {/* Editing toolbar */}
          {editing && (
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 sm:px-6">
              <span className="text-xs font-medium text-gray-500">편집 중</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200 transition-all hover:bg-gray-50 disabled:opacity-60"
                >
                  <X className="size-3.5" />
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveTranscriptHandler}
                  disabled={saving}
                  className="flex h-8 items-center gap-1 rounded-lg bg-[#3182F6] px-2.5 text-xs font-semibold text-white transition-all hover:bg-[#2B71DE] disabled:opacity-70"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  저장
                </button>
              </div>
            </div>
          )}

          <div className="px-4 py-4 sm:px-6 sm:py-5">
            {!editing && (
              <p className="mb-3 text-[11px] font-medium text-gray-400">
                {sermon.transcriptCorrected ? "교정본" : "음성인식 원문"}
              </p>
            )}
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="h-[60vh] min-h-[280px] w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-[15px] leading-8 text-gray-800 outline-none ring-[#3182F6] transition focus:ring-2"
                />
                {saveError && (
                  <p className="text-sm text-red-500">{saveError}</p>
                )}
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-[15px] leading-[1.9] text-gray-700">
                {formatTranscript(displayTranscript)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
