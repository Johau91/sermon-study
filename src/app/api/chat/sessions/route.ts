import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `
          SELECT
            session_id,
            MAX(created_at) AS last_message_at,
            COUNT(*) AS message_count,
            MAX(CASE WHEN role = 'user' THEN content END) AS latest_user_message
          FROM chat_messages
          GROUP BY session_id
          ORDER BY last_message_at DESC
          LIMIT 50
        `
      )
      .all() as {
      session_id: string;
      last_message_at: string;
      message_count: number;
      latest_user_message: string | null;
    }[];

    const sessions = rows.map((row) => ({
      sessionId: row.session_id,
      lastMessageAt: row.last_message_at,
      messageCount: row.message_count,
      title: row.latest_user_message || "새 대화",
    }));

    return Response.json({ sessions });
  } catch {
    return Response.json(
      { error: "채팅 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
