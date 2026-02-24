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
    <div className="space-y-4">
      {/* Back Navigation */}
      <Link
        href="/sermons"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-[#3182F6]"
      >
        <ArrowLeft className="size-4" />
        설교 목록
      </Link>

      {/* Header Card */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
        <h1 className="text-lg font-bold leading-7 text-gray-900 sm:text-[22px] sm:leading-8">
          {sermon.title}
        </h1>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
          <Calendar className="size-3.5" />
          {sermon.publishedAt
            ? new Date(sermon.publishedAt).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : "날짜 미상"}
        </div>

        {/* Tags */}
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

        {/* Action Buttons — icon-only on mobile, with text on sm+ */}
        <div className="mt-4 flex items-center gap-2">
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="YouTube에서 보기"
            className="flex size-11 items-center justify-center rounded-xl bg-white text-gray-600 ring-1 ring-gray-200 transition-all hover:bg-gray-50 active:scale-95 sm:h-10 sm:w-auto sm:gap-2 sm:px-4"
          >
            <ExternalLink className="size-[18px] sm:size-4" />
            <span className="hidden sm:inline text-sm font-medium">YouTube</span>
          </a>
          <Link
            href={`/study?sermonId=${sermon.originalId}`}
            title="퀴즈 시작"
            className="flex size-11 items-center justify-center rounded-xl bg-[#3182F6] text-white shadow-sm transition-all hover:bg-[#2B71DE] active:scale-95 sm:h-10 sm:w-auto sm:gap-2 sm:px-4"
          >
            <GraduationCap className="size-[18px] sm:size-4" />
            <span className="hidden sm:inline text-sm font-semibold">퀴즈</span>
          </Link>
          <Link
            href={`/chat?sermonId=${sermon.originalId}`}
            title="이 설교에 대해 질문하기"
            className="flex size-11 items-center justify-center rounded-xl bg-white text-gray-600 ring-1 ring-gray-200 transition-all hover:bg-gray-50 active:scale-95 sm:h-10 sm:w-auto sm:gap-2 sm:px-4"
          >
            <MessageCircle className="size-[18px] sm:size-4" />
            <span className="hidden sm:inline text-sm font-medium">질문</span>
          </Link>
        </div>
      </div>

      {/* Summary — collapsible */}
      {sermon.summary && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          <button
            type="button"
            onClick={() => setSummaryOpen(!summaryOpen)}
            className="flex w-full items-center justify-between px-5 py-4"
          >
            <h2 className="text-base font-bold text-gray-900">요약</h2>
            <ChevronDown
              className={`size-5 text-gray-400 transition-transform duration-200 ${summaryOpen ? "rotate-180" : ""}`}
            />
          </button>
          {summaryOpen && (
            <div className="border-t border-gray-100 px-5 pb-5 pt-3">
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-gray-700">
                {sermon.summary}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Transcript */}
      {(sermon.transcriptCorrected || sermon.transcriptRaw) && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">설교 전문</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                {sermon.transcriptCorrected
                  ? "교정된 설교 내용입니다."
                  : "음성인식 원문입니다."}
              </p>
            </div>
            {!editing ? (
              <button
                type="button"
                onClick={startEdit}
                title="텍스트 수정"
                className="flex size-10 items-center justify-center rounded-xl text-gray-500 ring-1 ring-gray-200 transition-all hover:bg-gray-50 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3"
              >
                <Pencil className="size-4" />
                <span className="hidden sm:inline text-sm font-medium">수정</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="flex size-10 items-center justify-center rounded-xl text-gray-500 ring-1 ring-gray-200 transition-all hover:bg-gray-50 disabled:opacity-60 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3"
                >
                  <X className="size-4" />
                  <span className="hidden sm:inline text-sm font-medium">취소</span>
                </button>
                <button
                  type="button"
                  onClick={saveTranscriptHandler}
                  disabled={saving}
                  className="flex size-10 items-center justify-center rounded-xl bg-[#3182F6] text-white transition-all hover:bg-[#2B71DE] disabled:opacity-70 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  <span className="hidden sm:inline text-sm font-semibold">저장</span>
                </button>
              </div>
            )}
          </div>
          <div className="border-t border-gray-100" />
          <div className="px-5 py-4">
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
              <div className="reading-content whitespace-pre-wrap text-[15px] leading-8 text-gray-700">
                {formatTranscript(displayTranscript)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
