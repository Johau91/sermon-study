import { hybridSearch, type SearchResult } from "./search";
import { generateText, streamChat } from "./ai";
import { getDb } from "./db";

export interface RagContext {
  results: SearchResult[];
  contextText: string;
}

type ChatTurn = { role: "user" | "assistant"; content: string };

const RECENT_HISTORY_COUNT = 8;
const HISTORY_SUMMARY_CHAR_LIMIT = 6000;

export async function buildContext(query: string): Promise<RagContext> {
  const results = await hybridSearch(query, 5);

  const contextText = results
    .map(
      (r, i) =>
        `[${i + 1}] 설교: "${r.sermon_title}"\n${r.chunk.content}`
    )
    .join("\n\n---\n\n");

  return { results, contextText };
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

  // Yield references first
  yield { type: "refs", refs: results };

  const systemPrompt = `당신은 연세중앙교회 설교를 바탕으로 학습을 돕는 AI 도우미입니다.
아래 설교 내용을 참고하여 질문에 답변해주세요.
답변 시 어떤 설교를 참고했는지 [1], [2] 등으로 표시해주세요.
설교 내용에 없는 내용은 추측하지 말고, 관련 설교가 없다면 솔직히 말씀해주세요.

참고 설교 내용:
${contextText}`;

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
