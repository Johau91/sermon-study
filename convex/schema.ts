import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sermons: defineTable({
    originalId: v.number(),
    youtubeId: v.string(),
    title: v.string(),
    publishedAt: v.optional(v.string()),
    transcriptRaw: v.optional(v.string()),
    transcriptCorrected: v.optional(v.string()),
    summary: v.optional(v.string()),
    tags: v.optional(v.string()),
    patternVersion: v.optional(v.number()),
    llmCorrectionVersion: v.optional(v.number()),
    hasTranscript: v.optional(v.boolean()),
  })
    .index("by_originalId", ["originalId"])
    .index("by_youtubeId", ["youtubeId"])
    .searchIndex("search_title", { searchField: "title" }),

  transcripts: defineTable({
    sermonId: v.id("sermons"),
    transcriptRaw: v.optional(v.string()),
    transcriptCorrected: v.optional(v.string()),
  }).index("by_sermonId", ["sermonId"]),

  chunks: defineTable({
    sermonId: v.id("sermons"),
    originalSermonId: v.number(),
    chunkIndex: v.number(),
    content: v.string(),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_sermonId", ["sermonId", "chunkIndex"])
    .index("by_originalSermonId", ["originalSermonId"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["sermonId"],
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["sermonId"],
    }),

  chatMessages: defineTable({
    sessionId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    sermonRefs: v.optional(v.string()),
  }).index("by_sessionId", ["sessionId"]),

  quizRecords: defineTable({
    sermonId: v.optional(v.id("sermons")),
    originalSermonId: v.optional(v.number()),
    question: v.string(),
    expectedAnswer: v.string(),
    userAnswer: v.optional(v.string()),
    isCorrect: v.optional(v.boolean()),
    feedback: v.optional(v.string()),
  }).index("by_sermonId", ["sermonId"]),

  dailyStudy: defineTable({
    date: v.string(),
    sermonId: v.optional(v.id("sermons")),
    topic: v.optional(v.string()),
    questions: v.optional(v.string()),
    completed: v.boolean(),
  }).index("by_date", ["date"]),

  studySessions: defineTable({
    sermonId: v.optional(v.id("sermons")),
    sessionType: v.union(
      v.literal("chat"),
      v.literal("quiz"),
      v.literal("reading")
    ),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
  }),

  bibleVerses: defineTable({
    translation: v.string(),
    book: v.string(),
    chapter: v.number(),
    verse: v.number(),
    text: v.string(),
  }).index("by_ref", ["translation", "book", "chapter", "verse"]),

  appSettings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
