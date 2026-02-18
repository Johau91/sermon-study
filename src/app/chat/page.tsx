"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Send,
  Loader2,
  MessageCircle,
  BookOpen,
  RotateCcw,
} from "lucide-react";

interface SermonRef {
  sermon_id: number;
  title: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  refs?: SermonRef[];
}

interface ChatSessionSummary {
  sessionId: string;
  title: string;
  lastMessageAt: string;
  messageCount: number;
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const sermonId = searchParams.get("sermonId");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingSessionMessages, setIsLoadingSessionMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize session
  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  // Auto-send initial message if sermonId is present
  useEffect(() => {
    if (sermonId && sessionId && messages.length === 0) {
      setInput(`설교 #${sermonId}에 대해 알려주세요.`);
    }
  }, [sermonId, sessionId, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/sessions");
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: ChatSessionSummary[] };
      setSessions(data.sessions || []);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const loadSession = useCallback(
    async (targetSessionId: string) => {
      if (!targetSessionId || targetSessionId === sessionId || isStreaming) return;

      setIsLoadingSessionMessages(true);
      setError(null);
      try {
        const res = await fetch(`/api/chat/sessions/${targetSessionId}`);
        if (!res.ok) {
          throw new Error("대화 내용을 불러올 수 없습니다.");
        }
        const data = (await res.json()) as { messages?: ChatMessage[] };
        setSessionId(targetSessionId);
        setMessages(data.messages || []);
        setInput("");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "대화 내용을 불러오지 못했습니다."
        );
      } finally {
        setIsLoadingSessionMessages(false);
      }
    },
    [isStreaming, sessionId]
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isStreaming) return;

      const userMessage: ChatMessage = { role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setError(null);
      setIsStreaming(true);

      // Add placeholder for assistant response
      setMessages((prev) => [...prev, { role: "assistant", content: "", refs: [] }]);

      try {
        const res = await fetch("/api/chat", {
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

          // Parse SSE or streamed text
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.type === "refs" && parsed.refs) {
                  refs = parsed.refs.map((r: { sermon_id: number; sermon_title?: string; title?: string }) => ({
                    sermon_id: r.sermon_id,
                    title: r.sermon_title || r.title || `설교 #${r.sermon_id}`,
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
                }
              } catch {
                // Not JSON, treat as plain text
                assistantContent += data;
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
            } else if (line.trim() && !line.startsWith(":")) {
              // NDJSON format (raw JSON per line)
              try {
                const parsed = JSON.parse(line);
                if (parsed.type === "error" && parsed.error) {
                  // Show error but continue
                  assistantContent += `[오류: ${parsed.error}]\n`;
                } else if (parsed.type === "refs" && parsed.refs) {
                  refs = parsed.refs.map((r: { sermon_id: number; sermon_title?: string; title?: string }) => ({
                    sermon_id: r.sermon_id,
                    title: r.sermon_title || r.title || `설교 #${r.sermon_id}`,
                  }));
                } else if (parsed.type === "text" && parsed.text) {
                  assistantContent += parsed.text;
                }
              } catch {
                assistantContent += line;
              }
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
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "채팅 중 오류가 발생했습니다."
        );
        // Remove the empty assistant message on error
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
        void refreshSessions();
      }
    },
    [input, isStreaming, sessionId, messages, refreshSessions]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const resetChat = () => {
    setMessages([]);
    setInput("");
    setSessionId(crypto.randomUUID());
    setError(null);
  };

  const formatSessionTitle = (title: string) => {
    const trimmed = title.trim();
    if (trimmed.length <= 36) return trimmed;
    return `${trimmed.slice(0, 36)}...`;
  };

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageCircle className="size-6" />
            AI 채팅
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            설교 내용에 대해 자유롭게 질문하세요.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetChat}>
          <RotateCcw className="mr-2 size-4" />
          새 대화
        </Button>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Session List */}
        <Card className="hidden w-72 shrink-0 md:flex md:flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">채팅 목록</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <ScrollArea className="h-full px-3 pb-3">
              {isLoadingSessions ? (
                <div className="py-4 text-sm text-muted-foreground">
                  목록 불러오는 중...
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-4 text-sm text-muted-foreground">
                  아직 저장된 대화가 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <button
                      key={session.sessionId}
                      type="button"
                      onClick={() => void loadSession(session.sessionId)}
                      disabled={isStreaming || isLoadingSessionMessages}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        session.sessionId === sessionId
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted"
                      }`}
                    >
                      <p className="line-clamp-2 font-medium">
                        {formatSessionTitle(session.title)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(session.lastMessageAt).toLocaleString("ko-KR")}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat Messages */}
        <Card className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b p-3 md:hidden">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-2">
                {sessions.map((session) => (
                  <button
                    key={`mobile-${session.sessionId}`}
                    type="button"
                    onClick={() => void loadSession(session.sessionId)}
                    disabled={isStreaming || isLoadingSessionMessages}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      session.sessionId === sessionId
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    }`}
                  >
                    {formatSessionTitle(session.title)}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <ScrollArea className="flex-1 p-4">
            {isLoadingSessionMessages ? (
              <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-muted-foreground">
                대화 내용을 불러오는 중...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-muted-foreground">
                <MessageCircle className="mb-4 size-12 opacity-30" />
                <p className="text-lg font-medium">설교에 대해 질문해 보세요</p>
                <p className="mt-2 max-w-sm text-sm">
                  등록된 설교 내용을 바탕으로 AI가 답변합니다.
                  성경 구절, 설교 내용, 적용 방법 등 무엇이든 물어보세요.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {/* Message content */}
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {msg.content}
                        {msg.role === "assistant" &&
                          isStreaming &&
                          i === messages.length - 1 && (
                            <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-current" />
                          )}
                      </div>

                      {/* Sermon references */}
                      {msg.refs && msg.refs.length > 0 && (
                        <div className="mt-3 border-t pt-2">
                          <p className="mb-1.5 text-xs font-medium opacity-70">
                            참고 설교
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {msg.refs.map((ref, refIndex) => (
                              <Link
                                key={`${ref.sermon_id}-${refIndex}`}
                                href={`/sermons/${ref.sermon_id}`}
                              >
                                <Badge
                                  variant="outline"
                                  className="cursor-pointer text-xs hover:bg-background/50"
                                >
                                  <BookOpen className="mr-1 size-3" />
                                  {ref.title}
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

        {/* Error */}
        {error && (
          <>
            <Separator />
            <div className="px-4 py-2 text-sm text-destructive">{error}</div>
          </>
        )}

        {/* Input Area */}
        <Separator />
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 p-4"
        >
          <Textarea
            ref={textareaRef}
            placeholder="설교에 대해 질문하세요... (Shift+Enter: 줄바꿈)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="min-h-[44px] max-h-[120px] resize-none"
            disabled={isStreaming}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>
      </Card>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>}>
      <ChatPageInner />
    </Suspense>
  );
}
