import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const ftsSearch = internalQuery({
  args: {
    query: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("chunks")
      .withSearchIndex("search_content", (q) => q.search("content", args.query))
      .take(args.limit);

    const hydrated = [];
    for (const chunk of results) {
      const sermon = await ctx.db.get(chunk.sermonId);
      if (!sermon) continue;
      hydrated.push({
        chunkId: chunk._id,
        sermonId: sermon._id,
        originalSermonId: sermon.originalId,
        sermonTitle: sermon.title,
        youtubeId: sermon.youtubeId,
        sermonSummary: sermon.summary ?? null,
        sermonTags: sermon.tags ?? null,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
      });
    }
    return hydrated;
  },
});

export const hydrateChunks = internalQuery({
  args: {
    chunkIds: v.array(v.id("chunks")),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const chunkId of args.chunkIds) {
      const chunk = await ctx.db.get(chunkId);
      if (!chunk) continue;
      const sermon = await ctx.db.get(chunk.sermonId);
      if (!sermon) continue;
      results.push({
        chunkId: chunk._id,
        sermonId: sermon._id,
        originalSermonId: sermon.originalId,
        sermonTitle: sermon.title,
        youtubeId: sermon.youtubeId,
        sermonSummary: sermon.summary ?? null,
        sermonTags: sermon.tags ?? null,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
      });
    }
    return results;
  },
});
