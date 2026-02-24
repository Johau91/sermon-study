import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { streamChatInternal } from "./openrouter";
import { extractBibleReferences } from "./lib/bibleParser";

const http = httpRouter();

http.route({
  path: "/chat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const {
      message,
      sessionId,
      history = [],
    } = body as {
      message: string;
      sessionId: string;
      history: { role: string; content: string }[];
    };

    if (!message || !sessionId) {
      return new Response(
        JSON.stringify({ error: "message and sessionId required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. RAG context via hybrid search
    const searchResults = await ctx.runAction(api.search.hybridSearch, {
      query: message,
      limit: 5,
    });

    // 2. Build context text
    const contextText = searchResults
      .map(
        (r: { sermonTitle: string; sermonSummary: string | null; sermonTags: string | null; content: string }, i: number) => {
          let header = `[${i + 1}] 설교: "${r.sermonTitle}"`;
          if (r.sermonSummary) header += `\n요약: ${r.sermonSummary}`;
          if (r.sermonTags) header += `\n태그: ${r.sermonTags}`;
          return `${header}\n${r.content}`;
        }
      )
      .join("\n\n---\n\n");

    // 3. Bible context
    let bibleContext = "";
    const bibleRefs = extractBibleReferences(message, 3);
    for (const ref of bibleRefs) {
      const verses = await ctx.runQuery(api.bible.getVerses, {
        translation: "개역한글",
        book: ref.book,
        chapter: ref.chapter,
        verseStart: ref.verseStart,
        verseEnd: ref.verseEnd,
      });
      if (verses.length > 0) {
        const refLabel = `${ref.book} ${ref.chapter}:${ref.verseStart}${ref.verseEnd !== ref.verseStart ? `-${ref.verseEnd}` : ""}`;
        const body = verses.map((v: { verse: number; text: string }) => `${v.verse}절 ${v.text}`).join("\n");
        bibleContext += `[개역한글] ${refLabel}\n${body}\n\n`;
      }
    }

    // 4. Load AI style
    const settings = await ctx.runQuery(api.settings.getAll, {});
    let stylePrompt = `답변 스타일:
- 설교하듯 이야기 방식으로 친근하고 따뜻하게 설명하세요.
- "여러분", "우리" 같은 표현을 자연스럽게 사용하세요.
- 딱딱한 나열 대신, 맥락을 풀어서 쉽게 이해할 수 있도록 이야기하세요.
- 비유와 예화를 활용하여 이해하기 쉽게 전달하세요.
- 마지막에 따뜻한 격려나 적용 포인트를 한 마디 덧붙이세요.`;

    if (settings.ai_custom_prompt) {
      stylePrompt = settings.ai_custom_prompt;
    }

    const systemPrompt = `# 역할
연세중앙교회 윤석전 목사의 설교를 바탕으로 답변하는 AI 도우미입니다.

# 답변 스타일
${stylePrompt}

# 답변 형식
- 2~4단락으로 답변하되, 핵심 내용을 먼저 제시하세요.
- 여러 설교가 관련될 경우 비교·종합하여 답변하세요.
- 답변에 출처 번호 [1], [2] 등을 자연스럽게 포함하세요.

# 절대 규칙
1. 아래 "참고 설교 내용"에 있는 내용만 근거로 답변하세요.
2. 목사 이름, 교회 이름, 설교 제목을 지어내지 마세요. 참고 설교에 명시된 것만 쓰세요.
3. 참고 설교에 없는 내용이면 "아쉽지만 제공된 설교에서는 관련 내용을 찾지 못했습니다. 다른 질문을 해주시겠어요?"라고 답하세요.
4. 외부 지식이나 일반 신학 지식으로 보충하지 마세요.

# 참고 설교 내용
${contextText}
${bibleContext ? `\n# 참고 성경(개역한글)\n${bibleContext}` : ""}`;

    // 5. Condense history if too long
    let condensedHistory = history;
    if (history.length > 8) {
      const oldHistory = history.slice(0, -8);
      const recentHistory = history.slice(-8);
      const oldText = oldHistory
        .map((m) => `${m.role === "user" ? "사용자" : "어시스턴트"}: ${m.content}`)
        .join("\n")
        .slice(0, 6000);
      try {
        const summary = await ctx.runAction(internal.openrouter.condenseHistory, {
          history: oldText,
        });
        if (summary.trim()) {
          condensedHistory = [
            { role: "assistant", content: `[이전 대화 요약]\n${summary.trim()}` },
            ...recentHistory,
          ];
        } else {
          condensedHistory = recentHistory;
        }
      } catch {
        condensedHistory = recentHistory;
      }
    }

    const messages = [...condensedHistory, { role: "user", content: message }];

    // 5.5. Load AI model preference
    const chatModel = settings.ai_chat_model || undefined;

    // 6. Emit refs then stream AI response
    const encoder = new TextEncoder();

    const refs = searchResults.map(
      (r: { sermonId: string; sermonTitle: string; originalSermonId: number }) => ({
        sermon_id: r.originalSermonId,
        title: r.sermonTitle,
      })
    );

    const stream = new ReadableStream({
      async start(controller) {
        // Send refs first
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "refs", refs }) + "\n")
        );

        let fullResponse = "";
        try {
          const aiStream = await streamChatInternal(messages, systemPrompt, chatModel);
          const reader = aiStream.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({ type: "text", text: content }) + "\n"
                    )
                  );
                }
              } catch {
                // skip
              }
            }
          }
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "error", error: errorMsg }) + "\n"
            )
          );
        }

        // Save to DB
        try {
          await ctx.runMutation(api.chat.saveMessages, {
            sessionId,
            userMessage: message,
            assistantMessage: fullResponse,
            sermonRefs: JSON.stringify(refs),
          });
        } catch {
          // Don't fail the stream for DB errors
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// CORS preflight
http.route({
  path: "/chat",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

export default http;
