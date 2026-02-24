import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";

export const batchInsertSermons = internalMutation({
  args: {
    sermons: v.array(
      v.object({
        originalId: v.number(),
        youtubeId: v.string(),
        title: v.string(),
        publishedAt: v.optional(v.string()),
        transcriptRaw: v.optional(v.string()),
        transcriptCorrected: v.optional(v.string()),
        summary: v.optional(v.string()),
        tags: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const sermon of args.sermons) {
      const { transcriptRaw, transcriptCorrected, ...sermonData } = sermon;
      const hasTranscript = !!(transcriptRaw && transcriptRaw.trim().length > 0);
      const id = await ctx.db.insert("sermons", { ...sermonData, hasTranscript });

      if (transcriptRaw || transcriptCorrected) {
        await ctx.db.insert("transcripts", {
          sermonId: id,
          transcriptRaw,
          transcriptCorrected,
        });
      }

      ids.push({ originalId: sermon.originalId, convexId: id });
    }
    return ids;
  },
});


/** Paginate sermons for transcript migration. */
export const migrateTranscriptsPage = internalQuery({
  args: {
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("sermons")
      .paginate({ numItems: args.numItems, cursor: args.cursor });

    const toMigrate = [];
    for (const s of result.page) {
      const existing = await ctx.db
        .query("transcripts")
        .withIndex("by_sermonId", (q) => q.eq("sermonId", s._id))
        .first();
      if (existing) continue;

      if (s.transcriptRaw || s.transcriptCorrected) {
        toMigrate.push({
          sermonId: s._id,
          transcriptRaw: s.transcriptRaw,
          transcriptCorrected: s.transcriptCorrected,
        });
      }
    }

    return {
      sermons: toMigrate,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** Copy transcript data from sermons to transcripts table. */
export const migrateTranscriptsBatch = internalMutation({
  args: {
    batch: v.array(
      v.object({
        sermonId: v.id("sermons"),
        transcriptRaw: v.optional(v.string()),
        transcriptCorrected: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const item of args.batch) {
      await ctx.db.insert("transcripts", {
        sermonId: item.sermonId,
        transcriptRaw: item.transcriptRaw,
        transcriptCorrected: item.transcriptCorrected,
      });
      const hasTranscript = !!(item.transcriptRaw && item.transcriptRaw.trim().length > 0);
      await ctx.db.patch(item.sermonId, { hasTranscript });
    }
    return args.batch.length;
  },
});

export const batchInsertChunks = internalMutation({
  args: {
    chunks: v.array(
      v.object({
        sermonId: v.id("sermons"),
        originalSermonId: v.number(),
        chunkIndex: v.number(),
        content: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const chunk of args.chunks) {
      await ctx.db.insert("chunks", chunk);
    }
    return args.chunks.length;
  },
});

export const batchInsertBibleVerses = internalMutation({
  args: {
    verses: v.array(
      v.object({
        translation: v.string(),
        book: v.string(),
        chapter: v.number(),
        verse: v.number(),
        text: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const verse of args.verses) {
      await ctx.db.insert("bibleVerses", verse);
    }
    return args.verses.length;
  },
});

export const batchInsertChatMessages = internalMutation({
  args: {
    messages: v.array(
      v.object({
        sessionId: v.string(),
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        sermonRefs: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const msg of args.messages) {
      await ctx.db.insert("chatMessages", msg);
    }
    return args.messages.length;
  },
});

export const batchInsertQuizRecords = internalMutation({
  args: {
    records: v.array(
      v.object({
        originalSermonId: v.optional(v.number()),
        sermonId: v.optional(v.id("sermons")),
        question: v.string(),
        expectedAnswer: v.string(),
        userAnswer: v.optional(v.string()),
        isCorrect: v.optional(v.boolean()),
        feedback: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const record of args.records) {
      await ctx.db.insert("quizRecords", record);
    }
    return args.records.length;
  },
});

export const batchInsertSettings = internalMutation({
  args: {
    settings: v.array(
      v.object({
        key: v.string(),
        value: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const setting of args.settings) {
      await ctx.db.insert("appSettings", setting);
    }
    return args.settings.length;
  },
});

// Upsert sermon rows by originalId from SQLite snapshot.
// Used by one-way sync scripts after local transcript corrections.
export const batchUpsertSermonsFromSqlite = mutation({
  args: {
    sermons: v.array(
      v.object({
        originalId: v.number(),
        youtubeId: v.string(),
        title: v.string(),
        publishedAt: v.optional(v.string()),
        transcriptRaw: v.optional(v.string()),
        transcriptCorrected: v.optional(v.string()),
        summary: v.optional(v.string()),
        tags: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const sermon of args.sermons) {
      const existing = await ctx.db
        .query("sermons")
        .withIndex("by_originalId", (q) => q.eq("originalId", sermon.originalId))
        .first();

      const patch = {
        youtubeId: sermon.youtubeId,
        title: sermon.title,
        publishedAt: sermon.publishedAt,
        transcriptRaw: sermon.transcriptRaw,
        transcriptCorrected: sermon.transcriptCorrected,
        summary: sermon.summary,
        tags: sermon.tags,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("sermons", {
          originalId: sermon.originalId,
          ...patch,
        });
        inserted++;
      }
    }
    return { inserted, updated, total: args.sermons.length };
  },
});

// Upsert chunk rows by original sermon id + chunk index from SQLite snapshot.
export const batchUpsertChunksFromSqlite = mutation({
  args: {
    chunks: v.array(
      v.object({
        originalSermonId: v.number(),
        chunkIndex: v.number(),
        content: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    const sermonCache = new Map<number, any>();
    const chunkCache = new Map<number, Map<number, any>>();

    const originalIds = [...new Set(args.chunks.map((c) => c.originalSermonId))];
    for (const originalId of originalIds) {
      const sermon = await ctx.db
        .query("sermons")
        .withIndex("by_originalId", (q) => q.eq("originalId", originalId))
        .first();
      if (!sermon) continue;
      sermonCache.set(originalId, sermon);

      const existingChunks = await ctx.db
        .query("chunks")
        .withIndex("by_sermonId", (q) => q.eq("sermonId", sermon._id))
        .collect();
      const byIndex = new Map<number, any>();
      for (const ch of existingChunks) byIndex.set(ch.chunkIndex, ch);
      chunkCache.set(originalId, byIndex);
    }

    for (const row of args.chunks) {
      const sermon = sermonCache.get(row.originalSermonId);
      if (!sermon) {
        skipped++;
        continue;
      }
      const byIndex = chunkCache.get(row.originalSermonId)!;
      const existing = byIndex.get(row.chunkIndex);
      if (existing) {
        if (existing.content !== row.content) {
          await ctx.db.patch(existing._id, { content: row.content });
          updated++;
        }
      } else {
        const id = await ctx.db.insert("chunks", {
          sermonId: sermon._id,
          originalSermonId: row.originalSermonId,
          chunkIndex: row.chunkIndex,
          content: row.content,
        });
        byIndex.set(row.chunkIndex, { _id: id, content: row.content, chunkIndex: row.chunkIndex });
        inserted++;
      }
    }

    return { inserted, updated, skipped, total: args.chunks.length };
  },
});
