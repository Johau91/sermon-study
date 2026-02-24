import { internalQuery, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { applyAsrCorrections, PATTERN_VERSION } from "./lib/asrPatterns";

/** Paginate all sermons with transcripts (public, for script HTTP access). */
export const getAllSermonsPagePublic = query({
  args: {
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("sermons")
      .paginate({ numItems: args.numItems, cursor: args.cursor });

    const sermons = result.page
      .filter((s) => s.transcriptRaw && s.transcriptRaw.trim().length > 0)
      .map((s) => ({
        _id: s._id,
        originalId: s.originalId,
        title: s.title,
        transcriptRaw: s.transcriptRaw!,
        transcriptCorrected: s.transcriptCorrected ?? null,
      }));

    return {
      sermons,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** Paginate all sermons with transcripts (for reprocessing). */
export const getAllSermonsPage = internalQuery({
  args: {
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("sermons")
      .paginate({ numItems: args.numItems, cursor: args.cursor });

    const sermons = result.page
      .filter((s) => s.transcriptRaw && s.transcriptRaw.trim().length > 0)
      .map((s) => ({
        _id: s._id,
        originalId: s.originalId,
        title: s.title,
        transcriptRaw: s.transcriptRaw!,
        transcriptCorrected: s.transcriptCorrected ?? null,
        patternVersion: s.patternVersion ?? 0,
      }));

    return {
      sermons,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** Count NAS audio sermons needing transcription (single page). */
export const nasAudioCountPage = internalQuery({
  args: {
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("sermons")
      .paginate({ numItems: args.numItems, cursor: args.cursor });
    let count = 0;
    for (const s of result.page) {
      if (s.transcriptRaw && s.transcriptRaw.startsWith("[nas-audio]")) {
        count++;
      }
    }
    return { count, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

/** Count corrected vs total in a single page (stays under read limit). */
export const correctionProgressPage = internalQuery({
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
      total++;
      if (s.transcriptCorrected !== undefined && s.transcriptCorrected !== null) {
        corrected++;
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

/**
 * Paginate through sermons, returning uncorrected ones from the current page.
 * Uses Convex's built-in pagination to stay under the 16MB read limit.
 */
export const getUncorrectedPage = internalQuery({
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
          s.transcriptRaw &&
          s.transcriptRaw.trim().length > 0 &&
          (s.transcriptCorrected === undefined ||
            s.transcriptCorrected === null)
      )
      .map((s) => ({
        _id: s._id,
        originalId: s.originalId,
        title: s.title,
        transcriptRaw: s.transcriptRaw!,
      }));

    return {
      sermons: uncorrected,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * Save corrected transcript and re-chunk the sermon.
 * Deletes old chunks, creates new ones (without embeddings — those are regenerated separately).
 */
export const applyCorrection = internalMutation({
  args: {
    sermonId: v.id("sermons"),
    originalSermonId: v.number(),
    correctedText: v.string(),
    patternVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Save corrected transcript (preserve original in transcriptRaw)
    await ctx.db.patch(args.sermonId, {
      transcriptCorrected: args.correctedText,
      patternVersion: args.patternVersion ?? PATTERN_VERSION,
    });

    // Delete existing chunks
    const existingChunks = await ctx.db
      .query("chunks")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", args.sermonId))
      .collect();
    for (const chunk of existingChunks) {
      await ctx.db.delete(chunk._id);
    }

    // Re-chunk with corrected text
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

/**
 * Paginate NAS audio sermons (transcriptRaw starts with "[nas-audio]").
 * Returns _id, originalId, title, transcriptRaw for each match.
 */
export const getNasAudioPage = internalQuery({
  args: {
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("sermons")
      .paginate({ numItems: args.numItems, cursor: args.cursor });

    const nasSermons = result.page
      .filter((s) => s.transcriptRaw && s.transcriptRaw.startsWith("[nas-audio]"))
      .map((s) => ({
        _id: s._id,
        originalId: s.originalId,
        title: s.title,
        transcriptRaw: s.transcriptRaw!,
      }));

    return {
      sermons: nasSermons,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * Save a Whisper transcript for a NAS audio sermon.
 * Overwrites transcriptRaw, applies ASR corrections → transcriptCorrected,
 * deletes old chunks, and re-chunks.
 */
export const saveNasTranscript = internalMutation({
  args: {
    sermonId: v.id("sermons"),
    originalSermonId: v.number(),
    rawTranscript: v.string(),
  },
  handler: async (ctx, args) => {
    // Overwrite transcriptRaw with actual transcript
    const corrected = applyAsrCorrections(args.rawTranscript);
    await ctx.db.patch(args.sermonId, {
      transcriptRaw: args.rawTranscript,
      transcriptCorrected: corrected,
      patternVersion: PATTERN_VERSION,
    });

    // Delete existing chunks
    const existingChunks = await ctx.db
      .query("chunks")
      .withIndex("by_sermonId", (q) => q.eq("sermonId", args.sermonId))
      .collect();
    for (const chunk of existingChunks) {
      await ctx.db.delete(chunk._id);
    }

    // Re-chunk with corrected text
    const chunks = chunkText(corrected);
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

// Inline chunker (same logic as convex/sermons.ts)
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
