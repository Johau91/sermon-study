"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  return key;
}

function getEmbedModel(): string {
  return process.env.OPENROUTER_EMBED_MODEL || "openai/text-embedding-3-small";
}

function getChatModel(): string {
  return process.env.OPENROUTER_CHAT_MODEL || "openai/gpt-4.1-mini";
}

export async function generateEmbeddingInternal(
  text: string
): Promise<number[]> {
  const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getEmbedModel(),
      input: text.slice(0, 8000),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter embedding error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getEmbedModel(),
      input: texts.map((t) => t.slice(0, 8000)),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter embedding error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.data
    .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((d: { embedding: number[] }) => d.embedding);
}

export async function generateTextInternal(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getChatModel(),
      messages: [
        {
          role: "system",
          content:
            systemPrompt ||
            "당신은 설교 학습을 돕는 AI 도우미입니다. 한국어로 답변합니다.",
        },
        { role: "user", content: prompt },
      ],
      stream: false,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function generateJsonInternal(
  prompt: string,
  systemPrompt: string
): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getChatModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      stream: false,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter JSON error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "{}";
}

export async function streamChatInternal(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  model?: string
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || getChatModel(),
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter stream error: ${res.status} ${err}`);
  }
  return res.body!;
}

// Exported actions for direct use

export const generateEmbedding = action({
  args: { text: v.string() },
  handler: async (_ctx, args) => {
    return await generateEmbeddingInternal(args.text);
  },
});

export const generateText = action({
  args: {
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    return await generateTextInternal(args.prompt, args.systemPrompt);
  },
});

export const generateQuiz = action({
  args: {
    sermonTitle: v.string(),
    sermonContent: v.string(),
    count: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const count = args.count ?? 3;
    const prompt = `다음 설교 내용을 바탕으로 ${count}개의 학습 퀴즈를 만들어주세요.

설교 제목: ${args.sermonTitle}
설교 내용:
${args.sermonContent.slice(0, 3000)}

다음 JSON 배열 형식으로만 응답하세요 (다른 텍스트 없이):
[{"question": "질문", "expected_answer": "모범 답안"}]

퀴즈는 설교의 핵심 메시지, 성경 구절의 의미, 실생활 적용에 대한 질문으로 구성해주세요.`;

    const text = await generateTextInternal(prompt);
    try {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
    } catch {
      // fallback
    }
    return [
      {
        question: "이 설교의 핵심 메시지는 무엇인가요?",
        expected_answer: "설교 내용을 바탕으로 답변해주세요.",
      },
    ];
  },
});

export const gradeAnswer = action({
  args: {
    question: v.string(),
    expectedAnswer: v.string(),
    userAnswer: v.string(),
  },
  handler: async (_ctx, args) => {
    const prompt = `설교 퀴즈의 답안을 채점해주세요.

질문: ${args.question}
모범 답안: ${args.expectedAnswer}
학생 답안: ${args.userAnswer}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{"is_correct": true 또는 false, "feedback": "피드백 내용"}

핵심 내용이 맞으면 is_correct를 true로 해주세요. 표현이 다르더라도 의미가 맞으면 정답으로 인정합니다.`;

    const text = await generateTextInternal(prompt);
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          isCorrect: !!parsed.is_correct,
          feedback: parsed.feedback || "채점 완료",
        };
      }
    } catch {
      // fallback
    }
    return { isCorrect: false, feedback: "채점에 실패했습니다." };
  },
});

export const condenseHistory = internalAction({
  args: { history: v.string() },
  handler: async (_ctx, args) => {
    return await generateTextInternal(
      `다음은 이전 대화 기록입니다. 핵심 사실, 질문 의도, 답변 결론만 6줄 이내로 요약해주세요.\n\n${args.history}`,
      "대화 맥락을 짧게 압축하는 요약 도우미입니다. 불필요한 수식어 없이 핵심만 작성하세요."
    );
  },
});
