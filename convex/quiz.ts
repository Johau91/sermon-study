import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const records = await ctx.db.query("quizRecords").collect();
    const answered = records.filter((r) => r.userAnswer != null);
    const correct = answered.filter((r) => r.isCorrect === true);
    const uniqueSermons = new Set(
      answered.filter((r) => r.sermonId).map((r) => r.sermonId)
    );

    return {
      completedStudies: uniqueSermons.size,
      averageScore:
        answered.length > 0
          ? Math.round((correct.length / answered.length) * 100)
          : 0,
    };
  },
});

export const getBySermonId = query({
  args: { sermonId: v.id("sermons") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quizRecords")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", args.sermonId))
      .collect();
  },
});

export const saveQuizRecords = mutation({
  args: {
    sermonId: v.id("sermons"),
    questions: v.array(
      v.object({
        question: v.string(),
        expected_answer: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const sermon = await ctx.db.get(args.sermonId);
    const ids = [];
    for (const q of args.questions) {
      const id = await ctx.db.insert("quizRecords", {
        sermonId: args.sermonId,
        originalSermonId: sermon?.originalId,
        question: q.question,
        expectedAnswer: q.expected_answer,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const submitAnswer = mutation({
  args: {
    quizId: v.id("quizRecords"),
    userAnswer: v.string(),
    isCorrect: v.boolean(),
    feedback: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.quizId, {
      userAnswer: args.userAnswer,
      isCorrect: args.isCorrect,
      feedback: args.feedback,
    });
  },
});
