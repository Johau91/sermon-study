import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const LLM_CORRECTION_VERSION = 1;

/** Paginate sermons needing LLM correction (version mismatch). */
export const getUncorrectedLlmPage = internalQuery({
  args: {
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("sermons")
      .paginate({ numItems: args.numItems, cursor: args.cursor });

    const uncorrected = result.page
      .filter(
        (s) =>
          s.transcriptCorrected &&
          s.transcriptCorrected.trim().length > 0 &&
          (s.llmCorrectionVersion ?? 0) !== LLM_CORRECTION_VERSION
      )
      .map((s) => ({
        _id: s._id,
        originalId: s.originalId,
        title: s.title,
        transcriptCorrected: s.transcriptCorrected!,
      }));

    return {
      sermons: uncorrected,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** Get bible verses for a reference (internal version of bible:getVerses). */
export const getBibleVerses = internalQuery({
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

/** Save LLM-corrected text, re-chunk. */
export const saveLlmCorrection = internalMutation({
  args: {
    sermonId: v.id("sermons"),
    originalSermonId: v.number(),
    correctedText: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sermonId, {
      transcriptCorrected: args.correctedText,
      llmCorrectionVersion: LLM_CORRECTION_VERSION,
    });

    // Delete existing chunks
    const existingChunks = await ctx.db
      .query("chunks")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", args.sermonId))
      .collect();
    for (const chunk of existingChunks) {
      await ctx.db.delete(chunk._id);
    }

    // Re-chunk
    const chunks = chunkText(args.correctedText);
    for (const chunk of chunks) {
      await ctx.db.insert("chunks", {
        sermonId: args.sermonId,
        originalSermonId: args.originalSermonId,
        chunkIndex: chunk.index,
        content: chunk.content,
      });
    }

    return { chunksCreated: chunks.length };
  },
});

/** Stamp LLM correction version without changing text. */
export const stampLlmVersion = internalMutation({
  args: { sermonId: v.id("sermons") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sermonId, {
      llmCorrectionVersion: LLM_CORRECTION_VERSION,
    });
  },
});

/** Count LLM correction progress in a single page. */
export const llmCorrectionProgressPage = internalQuery({
  args: {
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("sermons")
      .paginate({ numItems: args.numItems, cursor: args.cursor });

    let total = 0;
    let corrected = 0;
    for (const s of result.page) {
      if (s.transcriptCorrected && s.transcriptCorrected.trim().length > 0) {
        total++;
        if ((s.llmCorrectionVersion ?? 0) === LLM_CORRECTION_VERSION) {
          corrected++;
        }
      }
    }

    return {
      total,
      corrected,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

// Inline chunker (same as transcriptCleanupHelpers.ts)
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
