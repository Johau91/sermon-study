"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    <div className="space-y-6">
      {/* Back Navigation */}
      <Link
        href="/sermons"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-[#3182F6]"
      >
        <ArrowLeft className="size-4" />
        설교 목록
      </Link>

      {/* Header Card */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/[0.04]">
        <h1 className="text-xl font-bold leading-8 text-gray-900 sm:text-[22px]">
          {sermon.title}
        </h1>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-400">
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
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-gray-200 transition-all hover:bg-gray-50 active:scale-[0.97] sm:w-auto sm:py-2.5"
          >
            <ExternalLink className="size-4" />
            YouTube에서 보기
          </a>
          <Link
            href={`/study?sermonId=${sermon.originalId}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3182F6] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#2B71DE] active:scale-[0.97] sm:w-auto sm:py-2.5"
          >
            <GraduationCap className="size-4" />
            퀴즈 시작
          </Link>
          <Link
            href={`/chat?sermonId=${sermon.originalId}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-gray-200 transition-all hover:bg-gray-50 active:scale-[0.97] sm:w-auto sm:py-2.5"
          >
            <MessageCircle className="size-4" />
            이 설교에 대해 질문하기
          </Link>
        </div>
      </div>

      {/* Summary */}
      {sermon.summary && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/[0.04]">
          <h2 className="text-lg font-bold text-gray-900">요약</h2>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-gray-700">
            {sermon.summary}
          </p>
        </div>
      )}

      {/* Transcript */}
      {(sermon.transcriptCorrected || sermon.transcriptRaw) && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          <div className="px-5 pb-4 pt-5 sm:flex sm:items-start sm:justify-between sm:px-6 sm:pt-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">설교 전문</h2>
              <p className="mt-1 text-xs text-gray-400">
                {sermon.transcriptCorrected
                  ? "교정된 설교 내용입니다."
                  : "음성인식 원문입니다. 일부 오류가 있을 수 있습니다."}
              </p>
            </div>
            {!editing ? (
              <button
                type="button"
                onClick={startEdit}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 transition-all hover:bg-gray-50 sm:mt-0"
              >
                <Pencil className="size-4" />
                텍스트 수정
              </button>
            ) : (
              <div className="mt-3 flex items-center gap-2 sm:mt-0">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="size-4" />
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveTranscriptHandler}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#3182F6] px-3.5 py-2 text-sm font-semibold text-white transition-all hover:bg-[#2B71DE] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  저장
                </button>
              </div>
            )}
          </div>
          <div className="border-t border-gray-100" />
          <div className="px-5 py-4 sm:px-6">
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="h-[55vh] min-h-[320px] w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-base leading-8 text-gray-800 outline-none ring-[#3182F6] transition focus:ring-2 sm:h-[500px]"
                />
                {saveError && (
                  <p className="text-sm text-red-500">{saveError}</p>
                )}
              </div>
            ) : (
              <ScrollArea className="h-[60vh] min-h-[320px] sm:h-[500px]">
                <div className="reading-content whitespace-pre-wrap pr-2 text-gray-700">
                  {formatTranscript(displayTranscript)}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
