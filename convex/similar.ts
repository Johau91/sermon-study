"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateEmbeddingInternal } from "./openrouter";

export const findSimilar = action({
  args: {
    sermonId: v.id("sermons"),
    summaryText: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 3;

    const embedding = await generateEmbeddingInternal(args.summaryText);
    const vectorHits = await ctx.vectorSearch("chunks", "by_embedding", {
      vector: embedding,
      limit: limit * 5,
    });

    if (vectorHits.length === 0) return [];

    const hydrated = await ctx.runQuery(
      internal.searchHelpers.hydrateChunks,
      { chunkIds: vectorHits.map((h) => h._id) }
    );

    // Deduplicate by sermon, exclude self
    const seen = new Set<string>();
    const results: {
      originalSermonId: number;
      title: string;
      summary: string | null;
      tags: string | null;
    }[] = [];

    // Preserve vector search order
    const orderMap = new Map(vectorHits.map((h, i) => [h._id as string, i]));
    hydrated.sort(
      (a, b) =>
        (orderMap.get(a.chunkId as string) ?? 0) -
        (orderMap.get(b.chunkId as string) ?? 0)
    );

    for (const chunk of hydrated) {
      const sid = chunk.sermonId as string;
      if (sid === (args.sermonId as string)) continue;
      if (seen.has(sid)) continue;
      seen.add(sid);
      results.push({
        originalSermonId: chunk.originalSermonId,
        title: chunk.sermonTitle,
        summary: chunk.sermonSummary,
        tags: chunk.sermonTags,
      });
      if (results.length >= limit) break;
    }

    return results;
  },
});
