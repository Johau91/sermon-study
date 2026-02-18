import { NextRequest, NextResponse } from "next/server";
import { getDb, type QuizRecord, type Sermon } from "@/lib/db";
import { generateQuiz, generateText } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body as { action: string };

    if (action === "generate") {
      const { sermonId } = body as { action: string; sermonId: number };

      if (!sermonId || typeof sermonId !== "number") {
        return NextResponse.json(
          { error: "sermonId is required" },
          { status: 400 }
        );
      }

      const db = getDb();
      const sermon = db
        .prepare("SELECT * FROM sermons WHERE id = ?")
        .get(sermonId) as Sermon | undefined;

      if (!sermon) {
        return NextResponse.json(
          { error: "Sermon not found" },
          { status: 404 }
        );
      }

      const content =
        sermon.transcript_raw || sermon.summary || sermon.title;
      const quizItems = await generateQuiz(sermon.title, content);

      // Save generated quiz records to DB
      const insert = db.prepare(
        `INSERT INTO quiz_records (sermon_id, question, expected_answer)
         VALUES (?, ?, ?)`
      );

      const insertMany = db.transaction(
        (items: { question: string; expected_answer: string }[]) => {
          const ids: number[] = [];
          for (const item of items) {
            const result = insert.run(sermonId, item.question, item.expected_answer);
            ids.push(Number(result.lastInsertRowid));
          }
          return ids;
        }
      );

      const ids = insertMany(quizItems);

      const records = ids.map((id, i) => ({
        id,
        sermon_id: sermonId,
        question: quizItems[i].question,
        expected_answer: quizItems[i].expected_answer,
        user_answer: null,
        is_correct: null,
        feedback: null,
      }));

      return NextResponse.json({ quiz: records });
    }

    if (action === "submit") {
      const { quizId, answer } = body as {
        action: string;
        quizId: number;
        answer: string;
      };

      if (!quizId || typeof quizId !== "number") {
        return NextResponse.json(
          { error: "quizId is required" },
          { status: 400 }
        );
      }

      if (!answer || typeof answer !== "string") {
        return NextResponse.json(
          { error: "answer is required" },
          { status: 400 }
        );
      }

      const db = getDb();
      const record = db
        .prepare("SELECT * FROM quiz_records WHERE id = ?")
        .get(quizId) as QuizRecord | undefined;

      if (!record) {
        return NextResponse.json(
          { error: "Quiz record not found" },
          { status: 404 }
        );
      }

      // Grade the answer using AI
      const gradePrompt = `설교 퀴즈의 답안을 채점해주세요.

질문: ${record.question}
모범 답안: ${record.expected_answer}
학생 답안: ${answer}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{"is_correct": true 또는 false, "feedback": "피드백 내용"}

핵심 내용이 맞으면 is_correct를 true로 해주세요. 표현이 다르더라도 의미가 맞으면 정답으로 인정합니다.`;

      const gradeText = await generateText(gradePrompt);

      let isCorrect = 0;
      let feedback = "채점에 실패했습니다. 다시 시도해주세요.";

      try {
        const match = gradeText.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          isCorrect = parsed.is_correct ? 1 : 0;
          feedback = parsed.feedback || feedback;
        }
      } catch {
        // Use fallback values
      }

      // Update record in DB
      db.prepare(
        `UPDATE quiz_records
         SET user_answer = ?, is_correct = ?, feedback = ?
         WHERE id = ?`
      ).run(answer, isCorrect, feedback, quizId);

      return NextResponse.json({
        id: quizId,
        question: record.question,
        expected_answer: record.expected_answer,
        user_answer: answer,
        is_correct: isCorrect,
        feedback,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'generate' or 'submit'." },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const db = getDb();

    // Aggregate stats for dashboard
    if (searchParams.get("today") === "true") {
      const stats = db
        .prepare(
          `SELECT
             COUNT(DISTINCT CASE WHEN user_answer IS NOT NULL THEN sermon_id END) as completedStudies,
             CASE WHEN COUNT(CASE WHEN user_answer IS NOT NULL THEN 1 END) > 0
               THEN ROUND(100.0 * COUNT(CASE WHEN is_correct = 1 THEN 1 END) / COUNT(CASE WHEN user_answer IS NOT NULL THEN 1 END))
               ELSE 0 END as averageScore
           FROM quiz_records`
        )
        .get() as { completedStudies: number; averageScore: number };

      return NextResponse.json(stats);
    }

    const sermonIdParam = searchParams.get("sermonId");

    if (!sermonIdParam) {
      return NextResponse.json(
        { error: "sermonId query parameter is required" },
        { status: 400 }
      );
    }

    const sermonId = Number(sermonIdParam);
    if (isNaN(sermonId)) {
      return NextResponse.json(
        { error: "Invalid sermonId" },
        { status: 400 }
      );
    }

    const records = db
      .prepare(
        `SELECT id, sermon_id, question, expected_answer, user_answer, is_correct, feedback, created_at
         FROM quiz_records
         WHERE sermon_id = ?
         ORDER BY created_at DESC`
      )
      .all(sermonId) as QuizRecord[];

    return NextResponse.json({ records });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
