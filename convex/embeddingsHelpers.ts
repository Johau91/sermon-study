import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getChunksWithoutEmbeddings = internalQuery({
  args: { limit: v.number(), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Single paginate call per Convex requirement
    const result = await ctx.db
      .query("chunks")
      .paginate({ numItems: 500, cursor: (args.cursor ?? null) as any });

    const missing = result.page
      .filter((c) => !c.embedding)
      .slice(0, args.limit)
      .map((c) => ({ _id: c._id, content: c.content }));

    return {
      chunks: missing,
      continueCursor: result.isDone ? null : (result.continueCursor as string),
      isDone: result.isDone,
      pageHadMore: result.page.filter((c) => !c.embedding).length > args.limit,
    };
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
