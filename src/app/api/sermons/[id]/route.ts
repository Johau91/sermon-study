import { NextRequest, NextResponse } from "next/server";
import { getDb, type Sermon, type Chunk } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sermonId = Number(id);

    if (isNaN(sermonId)) {
      return NextResponse.json(
        { error: "Invalid sermon id" },
        { status: 400 }
      );
    }

    const db = getDb();

    const sermon = db
      .prepare(
        `SELECT id, youtube_id, title, published_at, transcript_raw, summary, tags, created_at
         FROM sermons WHERE id = ?`
      )
      .get(sermonId) as Sermon | undefined;

    if (!sermon) {
      return NextResponse.json(
        { error: "Sermon not found" },
        { status: 404 }
      );
    }

    const chunks = db
      .prepare(
        `SELECT id, sermon_id, chunk_index, content
         FROM chunks WHERE sermon_id = ? ORDER BY chunk_index`
      )
      .all(sermonId) as Omit<Chunk, "embedding">[];

    return NextResponse.json({ ...sermon, chunks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
