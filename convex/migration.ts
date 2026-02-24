import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const batchInsertSermons = mutation({
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
      const id = await ctx.db.insert("sermons", sermon);
      ids.push({ originalId: sermon.originalId, convexId: id });
    }
    return ids;
  },
});

export const batchInsertChunks = mutation({
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

export const batchInsertBibleVerses = mutation({
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

export const batchInsertChatMessages = mutation({
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

export const batchInsertQuizRecords = mutation({
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

export const batchInsertSettings = mutation({
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
