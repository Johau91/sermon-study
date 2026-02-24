"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { generateEmbeddingsBatch } from "./openrouter";

// Find chunks without embeddings and process them in batches
export const processEmbeddingBatch = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ processed: number; done: boolean }> => {
    const batchSize = args.batchSize ?? 50;

    // Scan through pages to find chunks without embeddings
    let cursor = args.cursor;
    let totalProcessed = 0;

    // Try up to 20 pages to find missing chunks
    for (let attempt = 0; attempt < 20; attempt++) {
      const result = await ctx.runQuery(
        internal.embeddingsHelpers.getChunksWithoutEmbeddings,
        { limit: batchSize, cursor }
      );

      const chunks = result.chunks as { _id: Id<"chunks">; content: string }[];

      if (chunks.length > 0) {
        // Generate embeddings
        const texts = chunks.map((c) => c.content);
        const embeddings = await generateEmbeddingsBatch(texts);

        // Save embeddings
        for (let i = 0; i < chunks.length; i++) {
          await ctx.runMutation(internal.embeddingsHelpers.saveEmbedding, {
            chunkId: chunks[i]._id,
            embedding: embeddings[i],
          });
        }

        totalProcessed += chunks.length;

        // If the page had more missing chunks, stay on same page
        if (result.pageHadMore) {
          await ctx.scheduler.runAfter(1000, internal.embeddings.processEmbeddingBatch, {
            batchSize,
            cursor,
          });
        } else {
          // Move to next page
          await ctx.scheduler.runAfter(1000, internal.embeddings.processEmbeddingBatch, {
            batchSize,
            cursor: result.continueCursor ?? undefined,
          });
        }

        return { processed: totalProcessed, done: false };
      }

      // No missing chunks on this page
      if (result.isDone) {
        // Reached end of all chunks - restart from beginning to verify
        if (cursor) {
          await ctx.scheduler.runAfter(5000, internal.embeddings.processEmbeddingBatch, {
            batchSize,
          });
          return { processed: totalProcessed, done: false };
        }
        return { processed: totalProcessed, done: true };
      }

      // Move to next page
      cursor = result.continueCursor ?? undefined;
    }

    // Scanned 20 pages without finding missing chunks, continue later
    await ctx.scheduler.runAfter(1000, internal.embeddings.processEmbeddingBatch, {
      batchSize,
      cursor,
    });

    return { processed: totalProcessed, done: false };
  },
});
