import { getDb } from "@/lib/db";

type ChatRow = {
  role: "user" | "assistant";
  content: string;
  sermon_refs: string | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await context.params;
    if (!sessionId) {
      return Response.json({ error: "sessionId is required" }, { status: 400 });
    }

    const db = getDb();
    const rows = db
      .prepare(
        `
          SELECT role, content, sermon_refs
          FROM chat_messages
          WHERE session_id = ?
          ORDER BY id ASC
        `
      )
      .all(sessionId) as ChatRow[];

    const messages = rows.map((row) => {
      let refs: { sermon_id: number; title: string }[] | undefined;

      if (row.sermon_refs) {
        try {
          const parsed = JSON.parse(row.sermon_refs) as
            | { sermon_id: number; title?: string }[]
            | null;
          refs = parsed?.map((r) => ({
            sermon_id: r.sermon_id,
            title: r.title || `설교 #${r.sermon_id}`,
          }));
        } catch {
          refs = undefined;
        }
      }

      return {
        role: row.role,
        content: row.content,
        refs,
      };
    });

    return Response.json({ messages });
  } catch {
    return Response.json(
      { error: "대화 내용을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
