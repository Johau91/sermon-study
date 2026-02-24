import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getChunksWithoutEmbeddings = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const chunks = await ctx.db.query("chunks").take(args.limit * 10);
    // Filter to those without embeddings
    const missing = chunks
      .filter((c) => c.embedding === undefined || c.embedding === null)
      .slice(0, args.limit);
    return missing.map((c) => ({
      _id: c._id,
      content: c.content,
    }));
  },
});

export const saveEmbedding = internalMutation({
  args: {
    chunkId: v.id("chunks"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chunkId, { embedding: args.embedding });
  },
});
