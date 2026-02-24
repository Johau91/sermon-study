"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { generateEmbeddingsBatch } from "./openrouter";

// Find chunks without embeddings and process them in batches
export const processEmbeddingBatch = action({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ processed: number; done: boolean }> => {
    const batchSize = args.batchSize ?? 50;

    // Get chunks missing embeddings
    const chunks: { _id: Id<"chunks">; content: string }[] =
      await ctx.runQuery(
        internal.embeddingsHelpers.getChunksWithoutEmbeddings,
        { limit: batchSize }
      );

    if (chunks.length === 0) {
      return { processed: 0, done: true };
    }

    // Generate embeddings in batch
    const texts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddingsBatch(texts);

    // Save embeddings
    for (let i = 0; i < chunks.length; i++) {
      await ctx.runMutation(internal.embeddingsHelpers.saveEmbedding, {
        chunkId: chunks[i]._id,
        embedding: embeddings[i],
      });
    }

    // Schedule next batch
    await ctx.scheduler.runAfter(
      1000, // 1 second delay to avoid rate limits
      api.embeddings.processEmbeddingBatch,
      { batchSize }
    );

    return { processed: chunks.length, done: false };
  },
});
