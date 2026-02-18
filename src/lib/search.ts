import { getDb, type Chunk } from "./db";
import { generateEmbedding, embeddingToBuffer } from "./embeddings";

export interface SearchResult {
  chunk: Chunk;
  sermon_title: string;
  sermon_id: number;
  youtube_id: string;
  score: number;
}

function buildFtsQuery(query: string): string {
  // Extract meaningful words (2+ chars), join with OR for flexible matching
  const words = query
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (words.length === 0) return query.replace(/[^\p{L}\p{N}\s]/gu, "").trim() || "empty";
  return words.map((w) => `"${w}"`).join(" OR ");
}

export async function ftsSearch(
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const db = getDb();
  const ftsQuery = buildFtsQuery(query);
  let rows;
  try {
    rows = db
      .prepare(
        `
      SELECT c.*, s.title as sermon_title, s.youtube_id,
             rank
      FROM chunks_fts
      JOIN chunks c ON c.id = chunks_fts.rowid
      JOIN sermons s ON s.id = c.sermon_id
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `
      )
      .all(ftsQuery, limit);
  } catch {
    return [];
  }
  const typedRows = rows as (Chunk & {
    sermon_title: string;
    youtube_id: string;
    rank: number;
  })[];

  return typedRows.map((row, idx) => ({
    chunk: {
      id: row.id,
      sermon_id: row.sermon_id,
      chunk_index: row.chunk_index,
      content: row.content,
      embedding: row.embedding,
    },
    sermon_title: row.sermon_title,
    sermon_id: row.sermon_id,
    youtube_id: row.youtube_id,
    score: 1 / (idx + 1), // Rank-based score for RRF
  }));
}

export async function vectorSearch(
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const db = getDb();
  const queryEmbedding = await generateEmbedding(query);
  const queryBuffer = embeddingToBuffer(queryEmbedding);

  const rows = db
    .prepare(
      `
    SELECT vc.chunk_id, vc.distance, c.*, s.title as sermon_title, s.youtube_id
    FROM vec_chunks vc
    JOIN chunks c ON c.id = vc.chunk_id
    JOIN sermons s ON s.id = c.sermon_id
    WHERE vc.embedding MATCH ? AND k = ?
  `
    )
    .all(queryBuffer, limit) as (Chunk & {
    chunk_id: number;
    distance: number;
    sermon_title: string;
    youtube_id: string;
  })[];

  return rows.map((row) => ({
    chunk: {
      id: row.id,
      sermon_id: row.sermon_id,
      chunk_index: row.chunk_index,
      content: row.content,
      embedding: row.embedding,
    },
    sermon_title: row.sermon_title,
    sermon_id: row.sermon_id,
    youtube_id: row.youtube_id,
    score: 1 - row.distance,
  }));
}

// Reciprocal Rank Fusion
export async function hybridSearch(
  query: string,
  limit: number = 5,
  k: number = 60
): Promise<SearchResult[]> {
  // Check if any embeddings exist
  const db = getDb();
  const hasEmbeddings =
    (db.prepare("SELECT COUNT(*) as c FROM vec_chunks").get() as { c: number }).c > 0;

  const ftsResults = await ftsSearch(query, limit * 2);

  // If no embeddings, just return FTS results
  if (!hasEmbeddings) {
    return ftsResults.slice(0, limit);
  }

  const vecResults = await vectorSearch(query, limit * 2);

  const scores = new Map<number, { result: SearchResult; score: number }>();

  ftsResults.forEach((r, idx) => {
    const existing = scores.get(r.chunk.id);
    const rrfScore = 1 / (k + idx + 1);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(r.chunk.id, { result: r, score: rrfScore });
    }
  });

  vecResults.forEach((r, idx) => {
    const existing = scores.get(r.chunk.id);
    const rrfScore = 1 / (k + idx + 1);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(r.chunk.id, { result: r, score: rrfScore });
    }
  });

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({ ...s.result, score: s.score }));
}
