"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Markdown from "react-markdown";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Loader2,
  MessageCircle,
  BookOpen,
  Plus,
  X,
  Copy,
  Check,
} from "lucide-react";

const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL!;

interface SermonRef {
  sermon_id: number;
  title: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  refs?: SermonRef[];
}

const SUGGESTED_QUESTIONS = [
  "부활이 뭐야?",
  "오늘의 설교 추천해줘",
  "성경에서 사랑이란?",
];

function ChatPageInner() {
  const searchParams = useSearchParams();
  const sermonId = searchParams.get("sermonId");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [isLoadingSessionMessages, setIsLoadingSessionMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mutations
  const deleteSessionMutation = useMutation(api.chat.deleteSession);

  // Convex reactive session list
  const sessionsData = useQuery(api.chat.listSessions, {});
  const sessions = sessionsData ?? [];
  const isLoadingSessions = sessionsData === undefined;

  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (sermonId && sessionId && messages.length === 0) {
      setInput(`설교 #${sermonId}에 대해 알려주세요.`);
    }
  }, [sermonId, sessionId, messages.length]);

  const shouldScrollRef = useRef(false);
  useEffect(() => {
    if (shouldScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    shouldScrollRef.current = isStreaming;
  }, [isStreaming]);

  // Load messages for current session reactively
  const sessionMessages = useQuery(
    api.chat.getSessionMessages,
    sessionId ? { sessionId } : "skip"
  );

  // Sync loaded session messages when switching sessions (only if not streaming)
  useEffect(() => {
    if (sessionMessages && sessionMessages.length > 0 && !isStreaming) {
      const loaded: ChatMessage[] = sessionMessages.map((m) => ({
        role: m.role,
        content: m.content,
        refs: m.refs?.map((r: { sermon_id: string; title: string }) => ({
          sermon_id: Number(r.sermon_id) || 0,
          title: r.title,
        })),
      }));
      // Only overwrite if messages are empty (fresh session load)
      if (messages.length === 0) {
        setMessages(loaded);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionMessages, isStreaming]);

  const resetChat = useCallback(() => {
    setMessages([]);
    setInput("");
    setSessionId(crypto.randomUUID());
    setError(null);
  }, []);

  // Auto-focus input
  useEffect(() => {
    if (!isStreaming && !isLoadingSessionMessages) {
      textareaRef.current?.focus();
    }
  }, [isStreaming, isLoadingSessionMessages, sessionId]);

  const handleDeleteSession = useCallback(
    async (targetSessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await deleteSessionMutation({ sessionId: targetSessionId });
      if (targetSessionId === sessionId) {
        resetChat();
      }
    },
    [deleteSessionMutation, sessionId, resetChat]
  );

  const handleCopy = useCallback(async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isStreaming) return;

      shouldScrollRef.current = true;
      const userMessage: ChatMessage = { role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setError(null);
      setIsStreaming(true);

      setMessages((prev) => [...prev, { role: "assistant", content: "", refs: [] }]);

      try {
        const res = await fetch(`${CONVEX_SITE_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            sessionId,
            history: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!res.ok) {
          throw new Error("채팅 응답을 받을 수 없습니다.");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("스트리밍을 시작할 수 없습니다.");

        const decoder = new TextDecoder();
        let assistantContent = "";
        let refs: SermonRef[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === "refs" && parsed.refs) {
                refs = parsed.refs.map((r: { sermon_id: number; title: string }) => ({
                  sermon_id: r.sermon_id,
                  title: r.title || `설교 #${r.sermon_id}`,
                }));
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = { ...last, refs };
                  }
                  return updated;
                });
              } else if (parsed.type === "text" && parsed.text) {
                assistantContent += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: assistantContent,
                      refs,
                    };
                  }
                  return updated;
                });
              } else if (parsed.type === "error" && parsed.error) {
                assistantContent += `[오류: ${parsed.error}]\n`;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: assistantContent,
                      refs,
                    };
                  }
                  return updated;
                });
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "채팅 중 오류가 발생했습니다."
        );
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant" && !last.content) {
            updated.pop();
          }
          return updated;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [input, isStreaming, sessionId, messages]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestion = (question: string) => {
    setInput(question);
    setTimeout(() => {
      const form = document.getElementById("chat-form") as HTMLFormElement;
      form?.requestSubmit();
    }, 0);
  };

  const formatSessionTitle = (title: string) => {
    const trimmed = title.trim();
    if (trimmed.length <= 30) return trimmed;
    return `${trimmed.slice(0, 30)}...`;
  };

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금";
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}일 전`;
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
      {/* Sidebar - Session List */}
      <aside className="hidden w-72 shrink-0 flex-col overflow-hidden border-r bg-card md:flex">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg font-bold text-foreground">채팅</h2>
          <button
            type="button"
            onClick={resetChat}
            className="flex size-9 items-center justify-center rounded-xl text-subtle transition-colors hover:bg-muted hover:text-foreground"
            title="새 대화"
          >
            <Plus className="size-5" />
          </button>
        </div>

        <ScrollArea className="flex-1 px-2">
          {isLoadingSessions ? (
            <div className="px-3 py-4 text-sm text-subtle">
              불러오는 중...
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-4 text-sm text-subtle">
              아직 대화가 없습니다
            </div>
          ) : (
            <div className="space-y-0.5 pb-4">
              {sessions.map((session) => {
                const isActive = session.sessionId === sessionId;
                return (
                  <div
                    key={session.sessionId}
                    className={`group relative flex items-center rounded-xl transition-all ${
                      isActive
                        ? "bg-[#3182F6]/5"
                        : "hover:bg-muted"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSessionId(session.sessionId);
                        setMessages([]);
                        setInput("");
                        setError(null);
                      }}
                      disabled={isStreaming || isLoadingSessionMessages}
                      className="min-w-0 flex-1 px-3 py-2.5 text-left"
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#3182F6]" />
                      )}
                      <p className={`line-clamp-2 text-sm ${isActive ? "font-semibold text-[#3182F6]" : "font-medium text-foreground"}`}>
                        {formatSessionTitle(session.title)}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">
                        {formatTime(session.lastMessageAt)}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(session.sessionId, e)}
                      className="mr-2 flex size-7 shrink-0 items-center justify-center rounded-lg text-subtle opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950/30"
                      title="삭제"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </aside>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Mobile session pills */}
        {sessions.length > 0 && (
          <div className="border-b bg-card px-4 py-2 md:hidden">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-2">
                {sessions.map((session) => {
                  const isActive = session.sessionId === sessionId;
                  return (
                    <div key={`mobile-${session.sessionId}`} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSessionId(session.sessionId);
                          setMessages([]);
                          setInput("");
                        }}
                        disabled={isStreaming || isLoadingSessionMessages}
                        className={`rounded-full py-1.5 pl-3.5 pr-7 text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-[#3182F6] text-white"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {formatSessionTitle(session.title)}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(session.sessionId, e)}
                        className={`absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full transition-colors ${
                          isActive
                            ? "text-white/70 hover:text-white"
                            : "text-muted-foreground/50 hover:text-foreground"
                        }`}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-6">
            {isLoadingSessionMessages ? (
              <div className="flex h-[60vh] items-center justify-center">
                <div className="flex items-center gap-3 text-subtle">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-base">대화를 불러오는 중...</span>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-[60vh] flex-col items-center justify-center">
                <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-[#3182F6]/10">
                  <MessageCircle className="size-8 text-[#3182F6]" />
                </div>
                <h2 className="text-xl font-bold text-foreground">
                  무엇이든 물어보세요
                </h2>
                <p className="mt-2 text-center text-base leading-7 text-muted-foreground">
                  설교 내용을 바탕으로 AI가 답변합니다
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleSuggestion(q)}
                      className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-all hover:border-[#3182F6]/30 hover:bg-[#3182F6]/5 hover:text-[#3182F6] active:scale-[0.97]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 pb-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`chat-bubble-animate flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div className="group/msg flex max-w-[90%] flex-col gap-1.5 sm:max-w-[85%]">
                      <div
                        className={`relative px-4 py-3 ${
                          msg.role === "user"
                            ? "rounded-[20px] rounded-tr-[4px] bg-[#3182F6] text-white"
                            : "rounded-[20px] rounded-tl-[4px] bg-card shadow-sm"
                        }`}
                      >
                        <div className={`text-base leading-7 ${msg.role === "assistant" ? "text-foreground" : ""}`}>
                          {msg.role === "assistant" ? (
                            <div className="prose max-w-none prose-p:my-2 prose-headings:text-foreground prose-a:text-[#3182F6] dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                              <Markdown>{msg.content}</Markdown>
                            </div>
                          ) : (
                            <span className="whitespace-pre-wrap">{msg.content}</span>
                          )}
                          {msg.role === "assistant" &&
                            isStreaming &&
                            i === messages.length - 1 &&
                            !msg.content && (
                              <div className="flex items-center gap-1.5 py-1">
                                <span className="typing-dot-1 inline-block size-2 rounded-full bg-subtle" />
                                <span className="typing-dot-2 inline-block size-2 rounded-full bg-subtle" />
                                <span className="typing-dot-3 inline-block size-2 rounded-full bg-subtle" />
                              </div>
                            )}
                          {msg.role === "assistant" &&
                            isStreaming &&
                            i === messages.length - 1 &&
                            msg.content && (
                              <span className="ml-0.5 inline-block size-1.5 animate-pulse rounded-full bg-subtle align-middle" />
                            )}
                        </div>
                        {msg.role === "assistant" && msg.content && !(isStreaming && i === messages.length - 1) && (
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.content, i)}
                            className="absolute -bottom-3 right-2 flex size-7 items-center justify-center rounded-lg bg-card text-subtle opacity-0 shadow-sm ring-1 ring-border transition-all hover:text-foreground group-hover/msg:opacity-100"
                            title="복사"
                          >
                            {copiedIndex === i ? (
                              <Check className="size-3.5 text-green-500" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {msg.refs && msg.refs.length > 0 && (
                        <div className={`flex flex-wrap gap-1.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          {msg.refs.map((ref, refIndex) => (
                            <Link
                              key={`${ref.sermon_id}-${refIndex}`}
                              href={`/sermons/${ref.sermon_id}`}
                              className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:text-[#3182F6]"
                            >
                              <BookOpen className="size-3 text-[#3182F6]" />
                              <span className="max-w-[200px] truncate">{ref.title}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-auto max-w-2xl px-4 pb-2">
            <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="bg-gradient-to-t from-background via-background to-transparent pt-2">
          <div className="mx-auto max-w-2xl px-4 pb-4">
            <form
              id="chat-form"
              onSubmit={handleSubmit}
              className="flex items-end gap-2 rounded-2xl bg-card p-2 shadow-lg shadow-black/5 ring-1 ring-border"
            >
              <textarea
                ref={textareaRef}
                placeholder="설교에 대해 질문하세요..."
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                rows={1}
                className="flex-1 resize-none bg-transparent px-3 py-2.5 text-base leading-7 text-foreground placeholder:text-subtle focus:outline-none"
                disabled={isStreaming}
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#3182F6] text-white transition-all hover:bg-[#2B71DE] disabled:bg-muted disabled:text-muted-foreground active:scale-95"
              >
                {isStreaming ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </button>
            </form>
            <p className="mt-2 text-center text-xs text-subtle">
              Shift+Enter로 줄바꿈
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center bg-background">
          <Loader2 className="size-8 animate-spin text-[#3182F6]" />
        </div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
