import { query } from "./_generated/server";
import { v } from "convex/values";

export const getVerses = query({
  args: {
    translation: v.string(),
    book: v.string(),
    chapter: v.number(),
    verseStart: v.number(),
    verseEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const start = Math.min(args.verseStart, args.verseEnd);
    const end = Math.max(args.verseStart, args.verseEnd);

    // Query using index, then filter verse range in memory
    const candidates = await ctx.db
      .query("bibleVerses")
      .withIndex("by_ref", (q) =>
        q
          .eq("translation", args.translation)
          .eq("book", args.book)
          .eq("chapter", args.chapter)
      )
      .collect();

    return candidates
      .filter((v) => v.verse >= start && v.verse <= end)
      .sort((a, b) => a.verse - b.verse);
  },
});
