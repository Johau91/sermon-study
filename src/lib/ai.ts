const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || "2048");
const NUM_BATCH = Number(process.env.OLLAMA_NUM_BATCH || "64");
const LOW_VRAM = process.env.OLLAMA_LOW_VRAM !== "false";

const OLLAMA_OPTIONS = {
  num_ctx: NUM_CTX,
  num_batch: NUM_BATCH,
  low_vram: LOW_VRAM,
};

export async function* streamChat(
  messages: { role: "user" | "assistant"; content: string }[],
  systemPrompt?: string
): AsyncGenerator<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            systemPrompt ||
            "당신은 설교 학습을 돕는 AI 도우미입니다. 한국어로 답변합니다.",
        },
        ...messages,
      ],
      options: OLLAMA_OPTIONS,
      stream: true,
    }),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.message?.content) {
          yield data.message.content;
        }
      } catch {
        // skip malformed lines
      }
    }
  }
}

export async function generateText(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            systemPrompt ||
            "당신은 설교 학습을 돕는 AI 도우미입니다. 한국어로 답변합니다.",
        },
        { role: "user", content: prompt },
      ],
      options: OLLAMA_OPTIONS,
      stream: false,
    }),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return data.message?.content || "";
}

export async function generateQuiz(
  sermonTitle: string,
  sermonContent: string,
  count: number = 3
): Promise<{ question: string; expected_answer: string }[]> {
  const prompt = `다음 설교 내용을 바탕으로 ${count}개의 학습 퀴즈를 만들어주세요.

설교 제목: ${sermonTitle}
설교 내용:
${sermonContent.slice(0, 3000)}

다음 JSON 배열 형식으로만 응답하세요 (다른 텍스트 없이):
[{"question": "질문", "expected_answer": "모범 답안"}]

퀴즈는 설교의 핵심 메시지, 성경 구절의 의미, 실생활 적용에 대한 질문으로 구성해주세요.`;

  const text = await generateText(prompt);

  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch {
    // fallback
  }

  return [
    {
      question: "이 설교의 핵심 메시지는 무엇인가요?",
      expected_answer: "설교 내용을 바탕으로 답변해주세요.",
    },
  ];
}

export async function generateSummary(
  title: string,
  transcript: string
): Promise<string> {
  return generateText(
    `다음 설교의 핵심 요약을 3-5문장으로 작성해주세요.\n\n제목: ${title}\n\n내용:\n${transcript.slice(0, 4000)}`,
    "설교 내용을 간결하게 요약하는 도우미입니다."
  );
}
