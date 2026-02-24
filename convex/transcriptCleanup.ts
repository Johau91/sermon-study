"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { applyAsrCorrections, PATTERN_VERSION } from "./lib/asrPatterns";

const BATCH_SIZE = 20;
const PAGE_SIZE = 50; // Sermons per paginated query (keeps reads under 16MB)
const NAS_PAGE_SIZE = 200;

type SermonRow = {
  _id: Id<"sermons">;
  originalId: number;
  title: string;
  transcriptRaw: string;
};

/**
 * Self-scheduling batch action that applies regex-based ASR corrections
 * to sermon transcripts. Writes corrected text to `transcriptCorrected`
 * (preserving `transcriptRaw`), deletes old chunks, and re-chunks.
 *
 * Run: npx convex run transcriptCleanup:processBatch
 */
export const processBatch = action({
  args: {
    batchSize: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ processed: number; corrected: number; done: boolean }> => {
    const limit = args.batchSize ?? BATCH_SIZE;

    // 1. Paginate through sermons to find uncorrected ones
    const collected: SermonRow[] = [];
    let cursor: string | null = args.cursor ?? null;
    let tableExhausted = false;

    while (collected.length < limit) {
      const page = await ctx.runQuery(
        internal.transcriptCleanupHelpers.getUncorrectedPage,
        { numItems: PAGE_SIZE, cursor }
      );
      collected.push(...(page.sermons as SermonRow[]));
      cursor = page.continueCursor;
      if (page.isDone) {
        tableExhausted = true;
        break;
      }
    }

    const sermons = collected.slice(0, limit);

    if (sermons.length === 0) {
      console.log("All sermons corrected. Done.");
      return { processed: 0, corrected: 0, done: true };
    }

    // 2. Apply corrections
    let corrected = 0;

    for (const sermon of sermons) {
      const raw = sermon.transcriptRaw;
      const fixed = applyAsrCorrections(raw);
      const hasChanges = fixed !== raw.trim();

      await ctx.runMutation(
        internal.transcriptCleanupHelpers.applyCorrection,
        {
          sermonId: sermon._id,
          originalSermonId: sermon.originalId,
          correctedText: fixed,
          patternVersion: PATTERN_VERSION,
        }
      );

      if (hasChanges) corrected++;
      console.log(
        `[${sermon.originalId}] ${sermon.title} — ${hasChanges ? "corrected" : "no change"}`
      );
    }

    console.log(
      `Batch: ${sermons.length} processed, ${corrected} had changes`
    );

    // 3. Schedule next batch (restart cursor from beginning since corrected ones are now filtered out)
    if (!tableExhausted || sermons.length > 0) {
      await ctx.scheduler.runAfter(500, api.transcriptCleanup.processBatch, {
        batchSize: limit,
      });
    }

    return { processed: sermons.length, corrected, done: false };
  },
});

/**
 * Reprocess all sermons with updated ASR patterns.
 * Only updates DB + re-chunks if the text actually changes.
 *
 * Run: npx convex run transcriptCleanup:reprocessBatch
 */
export const reprocessBatch = action({
  args: {
    batchSize: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ processed: number; updated: number; done: boolean }> => {
    const limit = args.batchSize ?? BATCH_SIZE;
    const cursor: string | null = args.cursor ?? null;

    type AllSermonRow = SermonRow & {
      transcriptCorrected: string | null;
      patternVersion: number;
    };

    const page = await ctx.runQuery(
      internal.transcriptCleanupHelpers.getAllSermonsPage,
      { numItems: PAGE_SIZE, cursor }
    );

    const sermons = page.sermons as AllSermonRow[];

    if (sermons.length === 0 && page.isDone) {
      console.log("Reprocess complete — no more sermons.");
      return { processed: 0, updated: 0, done: true };
    }

    let updated = 0;
    let processed = 0;
    let skipped = 0;

    for (const sermon of sermons.slice(0, limit)) {
      processed++;

      // Skip sermons already processed with current pattern version
      if (sermon.patternVersion === PATTERN_VERSION) {
        skipped++;
        continue;
      }

      const source = sermon.transcriptCorrected ?? sermon.transcriptRaw;
      const fixed = applyAsrCorrections(source);

      if (fixed === source.trim()) {
        // No text change, but still stamp the version to avoid re-reading next time
        await ctx.runMutation(
          internal.transcriptCleanupHelpers.applyCorrection,
          {
            sermonId: sermon._id,
            originalSermonId: sermon.originalId,
            correctedText: source.trim(),
            patternVersion: PATTERN_VERSION,
          }
        );
        continue;
      }

      await ctx.runMutation(
        internal.transcriptCleanupHelpers.applyCorrection,
        {
          sermonId: sermon._id,
          originalSermonId: sermon.originalId,
          correctedText: fixed,
          patternVersion: PATTERN_VERSION,
        }
      );
      updated++;
      console.log(
        `[${sermon.originalId}] ${sermon.title} — updated`
      );
    }

    console.log(
      `Reprocess batch: ${processed} checked, ${skipped} skipped (v${PATTERN_VERSION}), ${updated} updated`
    );

    // Schedule next page
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        500,
        api.transcriptCleanup.reprocessBatch,
        { batchSize: limit, cursor: page.continueCursor }
      );
    }

    return { processed, updated, done: page.isDone };
  },
});

/** Check correction progress across all sermons. */
export const progress = action({
  args: {},
  handler: async (ctx): Promise<{ total: number; corrected: number; remaining: number }> => {
    let total = 0;
    let corrected = 0;
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page: { total: number; corrected: number; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(
          internal.transcriptCleanupHelpers.correctionProgressPage,
          { numItems: 100, cursor }
        );
      total += page.total;
      corrected += page.corrected;
      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    return { total, corrected, remaining: total - corrected };
  },
});

/** Return all NAS audio sermons (for the Python pipeline script). */
export const getNasSermons = action({
  args: {},
  handler: async (
    ctx
  ): Promise<{ sermons: SermonRow[]; count: number }> => {
    const sermons: SermonRow[] = [];
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page: {
        sermons: SermonRow[];
        continueCursor: string;
        isDone: boolean;
      } = await ctx.runQuery(
        internal.transcriptCleanupHelpers.getNasAudioPage,
        { numItems: NAS_PAGE_SIZE, cursor }
      );
      sermons.push(...page.sermons);
      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    return { sermons, count: sermons.length };
  },
});

/** Save a Whisper transcript for a NAS sermon (called from Python script). */
export const saveNasTranscript = action({
  args: {
    sermonId: v.id("sermons"),
    originalSermonId: v.number(),
    rawTranscript: v.string(),
  },
  handler: async (ctx, args): Promise<{ chunksCreated: number }> => {
    return await ctx.runMutation(
      internal.transcriptCleanupHelpers.saveNasTranscript,
      {
        sermonId: args.sermonId,
        originalSermonId: args.originalSermonId,
        rawTranscript: args.rawTranscript,
      }
    );
  },
});

/** Count NAS audio sermons that still need Whisper transcription. */
export const nasAudioCount = action({
  args: {},
  handler: async (ctx): Promise<{ nasAudioCount: number }> => {
    let count = 0;
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page: { count: number; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(
          internal.transcriptCleanupHelpers.nasAudioCountPage,
          { numItems: 200, cursor }
        );
      count += page.count;
      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    return { nasAudioCount: count };
  },
});
