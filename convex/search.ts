"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { generateEmbeddingInternal } from "./openrouter";

interface SearchHit {
  chunkId: Id<"chunks">;
  sermonId: Id<"sermons">;
  originalSermonId: number;
  sermonTitle: string;
  youtubeId: string;
  sermonSummary: string | null;
  sermonTags: string | null;
  chunkIndex: number;
  content: string;
}

export const hybridSearch = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<(SearchHit & { score: number })[]> => {
    const limit = args.limit ?? 5;
    const k = 60; // RRF constant

    // 1. FTS search via Convex searchIndex
    const ftsResults: SearchHit[] = await ctx.runQuery(
      internal.searchHelpers.ftsSearch,
      { query: args.query, limit: limit * 2 }
    );

    // 2. Vector search
    let vecResults: SearchHit[] = [];
    try {
      const embedding = await generateEmbeddingInternal(args.query);
      const vectorHits = await ctx.vectorSearch("chunks", "by_embedding", {
        vector: embedding,
        limit: limit * 2,
      });

      if (vectorHits.length > 0) {
        vecResults = await ctx.runQuery(
          internal.searchHelpers.hydrateChunks,
          { chunkIds: vectorHits.map((h) => h._id) }
        );
        // Preserve vector search order
        const orderMap = new Map(vectorHits.map((h, i) => [h._id as string, i]));
        vecResults.sort(
          (a: SearchHit, b: SearchHit) =>
            (orderMap.get(a.chunkId as string) ?? 0) -
            (orderMap.get(b.chunkId as string) ?? 0)
        );
      }
    } catch {
      // Vector search unavailable (no embeddings yet) — fall back to FTS only
    }

    // 3. RRF fusion
    const scores = new Map<string, { result: SearchHit; score: number }>();

    ftsResults.forEach((r: SearchHit, idx: number) => {
      const key = r.chunkId as string;
      const rrfScore = 1 / (k + idx + 1);
      const existing = scores.get(key);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(key, { result: r, score: rrfScore });
      }
    });

    vecResults.forEach((r: SearchHit, idx: number) => {
      const key = r.chunkId as string;
      const rrfScore = 1 / (k + idx + 1);
      const existing = scores.get(key);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(key, { result: r, score: rrfScore });
      }
    });

    // 4. Diversity filter: max 2 chunks per sermon
    const sorted = [...scores.values()].sort((a, b) => b.score - a.score);
    const sermonCounts = new Map<string, number>();
    const diverse: { result: SearchHit; score: number }[] = [];

    for (const item of sorted) {
      const sid = item.result.sermonId as string;
      const count = sermonCounts.get(sid) || 0;
      if (count >= 2) continue;
      sermonCounts.set(sid, count + 1);
      diverse.push(item);
      if (diverse.length >= limit) break;
    }

    return diverse.map((d) => ({
      ...d.result,
      score: d.score,
    }));
  },
});
