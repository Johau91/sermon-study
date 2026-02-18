import { NextRequest, NextResponse } from "next/server";
import { hybridSearch } from "@/lib/search";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const limit = Number(searchParams.get("limit")) || 5;
    const results = await hybridSearch(query, limit);

    // Strip embedding blobs from response
    const cleaned = results.map((r) => ({
      sermon_id: r.sermon_id,
      sermon_title: r.sermon_title,
      youtube_id: r.youtube_id,
      score: r.score,
      chunk: {
        id: r.chunk.id,
        sermon_id: r.chunk.sermon_id,
        chunk_index: r.chunk.chunk_index,
        content: r.chunk.content,
      },
    }));

    return NextResponse.json({ results: cleaned });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
