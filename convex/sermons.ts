import { query, mutation, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.search && args.search.trim()) {
      const results = await ctx.db
        .query("sermons")
        .withSearchIndex("search_title", (q) => q.search("title", args.search!))
        .take(100);
      return {
        page: results.map((s) => ({
          _id: s._id,
          originalId: s.originalId,
          youtubeId: s.youtubeId,
          title: s.title,
          publishedAt: s.publishedAt,
          summary: s.summary,
          tags: s.tags,
          _creationTime: s._creationTime,
        })),
        isDone: true,
        continueCursor: "",
      };
    }

    const result = await ctx.db
      .query("sermons")
      .withIndex("by_originalId")
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page.map((s) => ({
        _id: s._id,
        originalId: s.originalId,
        youtubeId: s.youtubeId,
        title: s.title,
        publishedAt: s.publishedAt,
        summary: s.summary,
        tags: s.tags,
        _creationTime: s._creationTime,
      })),
    };
  },
});

export const getAdjacentByOriginalId = query({
  args: { originalId: v.number() },
  handler: async (ctx, args) => {
    // prev = originalId가 더 큰 (최신) 설교
    const prev = await ctx.db
      .query("sermons")
      .withIndex("by_originalId", (q) => q.gt("originalId", args.originalId))
      .order("asc")
      .first();
    // next = originalId가 더 작은 (오래된) 설교
    const next = await ctx.db
      .query("sermons")
      .withIndex("by_originalId", (q) => q.lt("originalId", args.originalId))
      .order("desc")
      .first();
    return {
      prev: prev ? { originalId: prev.originalId, title: prev.title } : null,
      next: next ? { originalId: next.originalId, title: next.title } : null,
    };
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

    const transcript = await ctx.db
      .query("transcripts")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", sermon._id))
      .first();

    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", sermon._id))
      .collect();

    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    return {
      ...sermon,
      transcriptRaw: transcript?.transcriptRaw ?? sermon.transcriptRaw,
      transcriptCorrected: transcript?.transcriptCorrected ?? sermon.transcriptCorrected,
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

    const transcript = await ctx.db
      .query("transcripts")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", sermon._id))
      .first();

    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", sermon._id))
      .collect();

    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    return {
      ...sermon,
      transcriptRaw: transcript?.transcriptRaw ?? sermon.transcriptRaw,
      transcriptCorrected: transcript?.transcriptCorrected ?? sermon.transcriptCorrected,
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

    // Upsert into transcripts table
    const existing = await ctx.db
      .query("transcripts")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", args.id))
      .first();

    const updateField =
      (existing?.transcriptCorrected ?? sermon.transcriptCorrected) != null
        ? "transcriptCorrected"
        : "transcriptRaw";

    if (existing) {
      await ctx.db.patch(existing._id, { [updateField]: normalized });
    } else {
      await ctx.db.insert("transcripts", {
        sermonId: args.id,
        [updateField]: normalized,
      });
    }

    await ctx.db.patch(args.id, { hasTranscript: true });

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

// Patch only the transcript text, preserving chunks and embeddings
export const patchTranscriptText = mutation({
  args: { id: v.id("sermons"), text: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transcripts")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", args.id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { transcriptCorrected: args.text });
    } else {
      await ctx.db.insert("transcripts", {
        sermonId: args.id,
        transcriptCorrected: args.text,
      });
    }
  },
});

// Lightweight query for dashboard (only recent N sermons, no transcripts)
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const sermons = await ctx.db
      .query("sermons")
      .order("desc")
      .take(args.limit ?? 4);
    return sermons.map((s) => ({
      _id: s._id,
      originalId: s.originalId,
      title: s.title,
      publishedAt: s.publishedAt,
    }));
  },
});

// Internal paginated query — each call gets its own 16MB read budget
export const _listTagsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("sermons")
      .paginate({ numItems: 100, cursor: args.cursor ?? undefined } as any);
    const tags: string[] = [];
    for (const s of result.page) {
      if (!s.tags) continue;
      for (const raw of s.tags.split(",")) {
        const t = raw.trim();
        if (t) tags.push(t);
      }
    }
    return {
      tags,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const listTags = action({
  args: {},
  handler: async (ctx) => {
    const tagCounts = new Map<string, number>();
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page: { tags: string[]; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(internal.sermons._listTagsPage, { cursor });
      for (const tag of page.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
      isDone = page.isDone;
      cursor = page.continueCursor;
    }

    return [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
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
  chunkSize = 1500,
  overlap = 200
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
