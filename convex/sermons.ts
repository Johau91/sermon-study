import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.search && args.search.trim()) {
      const results = await ctx.db
        .query("sermons")
        .withSearchIndex("search_title", (q) => q.search("title", args.search!))
        .take(args.limit ?? 100);
      return results.map((s) => ({
        _id: s._id,
        originalId: s.originalId,
        youtubeId: s.youtubeId,
        title: s.title,
        publishedAt: s.publishedAt,
        summary: s.summary,
        tags: s.tags,
        _creationTime: s._creationTime,
      }));
    }

    const sermons = await ctx.db
      .query("sermons")
      .order("desc")
      .take(args.limit ?? 50);

    return sermons.map((s) => ({
      _id: s._id,
      originalId: s.originalId,
      youtubeId: s.youtubeId,
      title: s.title,
      publishedAt: s.publishedAt,
      summary: s.summary,
      tags: s.tags,
      _creationTime: s._creationTime,
    }));
  },
});

export const getByOriginalId = query({
  args: { originalId: v.number() },
  handler: async (ctx, args) => {
    const sermon = await ctx.db
      .query("sermons")
      .withIndex("by_originalId", (q) => q.eq("originalId", args.originalId))
      .first();
    if (!sermon) return null;

    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", sermon._id))
      .collect();

    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    return {
      ...sermon,
      chunks: chunks.map((c) => ({
        _id: c._id,
        chunkIndex: c.chunkIndex,
        content: c.content,
      })),
    };
  },
});

export const getById = query({
  args: { id: v.id("sermons") },
  handler: async (ctx, args) => {
    const sermon = await ctx.db.get(args.id);
    if (!sermon) return null;

    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", sermon._id))
      .collect();

    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    return {
      ...sermon,
      chunks: chunks.map((c) => ({
        _id: c._id,
        chunkIndex: c.chunkIndex,
        content: c.content,
      })),
    };
  },
});

export const updateTranscript = mutation({
  args: {
    id: v.id("sermons"),
    transcript: v.string(),
  },
  handler: async (ctx, args) => {
    const sermon = await ctx.db.get(args.id);
    if (!sermon) throw new Error("Sermon not found");

    const normalized = args.transcript.replace(/\r\n/g, "\n").trim();
    const updateField =
      sermon.transcriptCorrected !== undefined && sermon.transcriptCorrected !== null
        ? "transcriptCorrected"
        : "transcriptRaw";

    await ctx.db.patch(args.id, { [updateField]: normalized });

    // Delete existing chunks
    const existingChunks = await ctx.db
      .query("chunks")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", args.id))
      .collect();
    for (const chunk of existingChunks) {
      await ctx.db.delete(chunk._id);
    }

    // Re-chunk
    const chunks = chunkText(normalized);
    for (const chunk of chunks) {
      await ctx.db.insert("chunks", {
        sermonId: args.id,
        originalSermonId: sermon.originalId,
        chunkIndex: chunk.index,
        content: chunk.content,
      });
    }

    return { chunkCount: chunks.length };
  },
});

export const totalCount = query({
  args: {},
  handler: async (ctx) => {
    const setting = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", "sermon_count"))
      .first();
    return setting ? parseInt(setting.value, 10) : 0;
  },
});

// Inline chunker (same logic as src/lib/chunker.ts)
function chunkText(
  text: string,
  chunkSize = 800,
  overlap = 150
): { index: number; content: string }[] {
  if (!text || text.trim().length === 0) return [];
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= chunkSize) {
    return [{ index: 0, content: cleaned }];
  }
  const chunks: { index: number; content: string }[] = [];
  let start = 0;
  let index = 0;
  while (start < cleaned.length) {
    let end = start + chunkSize;
    if (end < cleaned.length) {
      const segment = cleaned.slice(start, end);
      const lastPeriod = Math.max(
        segment.lastIndexOf(". "),
        segment.lastIndexOf("다. "),
        segment.lastIndexOf("요. "),
        segment.lastIndexOf("! "),
        segment.lastIndexOf("? ")
      );
      if (lastPeriod > chunkSize * 0.5) {
        end = start + lastPeriod + 2;
      }
    } else {
      end = cleaned.length;
    }
    chunks.push({ index, content: cleaned.slice(start, end).trim() });
    if (end >= cleaned.length) break;
    start = end - overlap;
    index++;
  }
  return chunks;
}
