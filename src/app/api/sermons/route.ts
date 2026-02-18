import { NextRequest, NextResponse } from "next/server";
import { getDb, type Sermon } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    let sermons: Sermon[];

    if (search) {
      sermons = db
        .prepare(
          `SELECT id, youtube_id, title, published_at, summary, tags, created_at
           FROM sermons
           WHERE title LIKE ? OR summary LIKE ? OR tags LIKE ?
           ORDER BY published_at DESC`
        )
        .all(`%${search}%`, `%${search}%`, `%${search}%`) as Sermon[];
    } else {
      sermons = db
        .prepare(
          `SELECT id, youtube_id, title, published_at, summary, tags, created_at
           FROM sermons
           ORDER BY published_at DESC`
        )
        .all() as Sermon[];
    }

    return NextResponse.json(sermons);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
