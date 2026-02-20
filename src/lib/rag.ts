import { hybridSearch, type SearchResult } from "./search";
import { generateText, streamChat } from "./ai";
import { getBibleContextForQuery } from "./bible";
import { getDb } from "./db";

export interface RagContext {
  results: SearchResult[];
  contextText: string;
}

type ChatTurn = { role: "user" | "assistant"; content: string };

const RECENT_HISTORY_COUNT = 8;
const HISTORY_SUMMARY_CHAR_LIMIT = 6000;

export async function buildContext(query: string): Promise<RagContext> {
  // Fetch more results, then apply diversity filter (max 2 chunks per sermon)
  const rawResults = await hybridSearch(query, 10);

  const sermonCounts = new Map<number, number>();
  const diverseResults: SearchResult[] = [];
  for (const r of rawResults) {
    const count = sermonCounts.get(r.sermon_id) || 0;
    if (count >= 2) continue;
    sermonCounts.set(r.sermon_id, count + 1);
    diverseResults.push(r);
    if (diverseResults.length >= 5) break;
  }

  const contextText = diverseResults
    .map((r, i) => {
      let header = `[${i + 1}] 설교: "${r.sermon_title}"`;
      if (r.sermon_summary) header += `\n요약: ${r.sermon_summary}`;
      if (r.sermon_tags) header += `\n태그: ${r.sermon_tags}`;
      return `${header}\n${r.chunk.content}`;
    })
    .join("\n\n---\n\n");

  return { results: diverseResults, contextText };
}

async function condenseHistory(chatHistory: ChatTurn[]): Promise<ChatTurn[]> {
  if (chatHistory.length <= RECENT_HISTORY_COUNT) {
    return chatHistory;
  }

  const oldHistory = chatHistory.slice(0, -RECENT_HISTORY_COUNT);
  const recentHistory = chatHistory.slice(-RECENT_HISTORY_COUNT);
  const oldText = oldHistory
    .map((m) => `${m.role === "user" ? "사용자" : "어시스턴트"}: ${m.content}`)
    .join("\n")
    .slice(0, HISTORY_SUMMARY_CHAR_LIMIT);

  try {
    const summary = await generateText(
      `다음은 이전 대화 기록입니다. 핵심 사실, 질문 의도, 답변 결론만 6줄 이내로 요약해주세요.\n\n${oldText}`,
      "대화 맥락을 짧게 압축하는 요약 도우미입니다. 불필요한 수식어 없이 핵심만 작성하세요."
    );

    if (summary.trim()) {
      return [
        {
          role: "assistant",
          content: `[이전 대화 요약]\n${summary.trim()}`,
        },
        ...recentHistory,
      ];
    }
  } catch {
    // Fall back to recent-only history if summarization fails.
  }

  return recentHistory;
}

export async function* ragChat(
  query: string,
  chatHistory: ChatTurn[] = [],
  sessionId?: string
): AsyncGenerator<{ type: "text"; text: string } | { type: "refs"; refs: SearchResult[] }> {
  const { results, contextText } = await buildContext(query);
  const bibleContext = getBibleContextForQuery(query, "개역한글");

  // Yield references first (strip embedding to keep payload small)
  yield {
    type: "refs",
    refs: results.map((r) => ({
      chunk: { id: r.chunk.id, sermon_id: r.chunk.sermon_id, chunk_index: r.chunk.chunk_index, content: r.chunk.content },
      sermon_id: r.sermon_id,
      sermon_title: r.sermon_title,
      sermon_summary: r.sermon_summary,
      sermon_tags: r.sermon_tags,
      youtube_id: r.youtube_id,
      score: r.score,
    })),
  };

  // Load AI style settings from DB
  const db = getDb();
  let stylePrompt = `답변 스타일:
- 설교하듯 이야기 방식으로 친근하고 따뜻하게 설명하세요.
- "여러분", "우리" 같은 표현을 자연스럽게 사용하세요.
- 딱딱한 나열 대신, 맥락을 풀어서 쉽게 이해할 수 있도록 이야기하세요.
- 비유와 예화를 활용하여 이해하기 쉽게 전달하세요.
- 마지막에 따뜻한 격려나 적용 포인트를 한 마디 덧붙이세요.`;

  try {
    const styleRow = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("ai_style") as { value: string } | undefined;
    const customRow = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("ai_custom_prompt") as { value: string } | undefined;

    if (customRow?.value) {
      stylePrompt = customRow.value;
    }
    // If style is not custom, use the stored custom_prompt which matches the preset
    if (styleRow?.value && styleRow.value !== "custom" && !customRow?.value) {
      // Default style prompt is already set above
    }
  } catch {
    // Use default style if DB read fails
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

  const condensedHistory = await condenseHistory(chatHistory);

  const messages = [
    ...condensedHistory,
    { role: "user" as const, content: query },
  ];

  let fullResponse = "";
  for await (const text of streamChat(messages, systemPrompt)) {
    fullResponse += text;
    yield { type: "text", text };
  }

  // Save chat messages to DB
  if (sessionId) {
    const db = getDb();
    const insert = db.prepare(
      "INSERT INTO chat_messages (session_id, role, content, sermon_refs) VALUES (?, ?, ?, ?)"
    );
    insert.run(sessionId, "user", query, null);
    insert.run(
      sessionId,
      "assistant",
      fullResponse,
      JSON.stringify(results.map((r) => ({ sermon_id: r.sermon_id, title: r.sermon_title })))
    );
  }
}
