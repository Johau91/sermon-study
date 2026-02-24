/**
 * Migrate data from SQLite to Convex.
 *
 * Usage: npx tsx scripts/migrate-to-convex.ts
 *
 * Requires:
 *   - data/sermons.db to exist (SQLite source)
 *   - CONVEX_DEPLOYMENT set in .env.local
 *   - Convex functions deployed (npx convex dev --once)
 */

import Database from "better-sqlite3";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

const DB_PATH = path.join(process.cwd(), "data", "sermons.db");
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
  console.error("NEXT_PUBLIC_CONVEX_URL not set. Check .env.local");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);
const db = new Database(DB_PATH, { readonly: true });

const BATCH_SIZE = 50;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── 1. Bible Verses ──────────────────────────────────────────────────
async function migrateBibleVerses() {
  console.log("\n📖 Migrating bible verses...");
  const rows = db
    .prepare("SELECT translation, book, chapter, verse, text FROM bible_verses")
    .all() as { translation: string; book: string; chapter: number; verse: number; text: string }[];

  console.log(`  Found ${rows.length} verses`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await client.mutation(api.migration.batchInsertBibleVerses, {
      verses: batch,
    });
    if ((i / BATCH_SIZE) % 10 === 0) {
      process.stdout.write(`  ${i + batch.length}/${rows.length}\r`);
    }
    await sleep(50);
  }
  console.log(`  ✅ ${rows.length} bible verses migrated`);
}

// ─── 2. Sermons ──────────────────────────────────────────────────────
async function migrateSermons(): Promise<Map<number, Id<"sermons">>> {
  console.log("\n⛪ Migrating sermons...");
  const rows = db
    .prepare(
      `SELECT id, youtube_id, title, published_at, transcript_raw, transcript_corrected, summary, tags
       FROM sermons ORDER BY id`
    )
    .all() as {
    id: number;
    youtube_id: string;
    title: string;
    published_at: string | null;
    transcript_raw: string | null;
    transcript_corrected: string | null;
    summary: string | null;
    tags: string | null;
  }[];

  console.log(`  Found ${rows.length} sermons`);

  const idMap = new Map<number, Id<"sermons">>();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
      originalId: r.id,
      youtubeId: r.youtube_id,
      title: r.title,
      publishedAt: r.published_at ?? undefined,
      transcriptRaw: r.transcript_raw ?? undefined,
      transcriptCorrected: r.transcript_corrected ?? undefined,
      summary: r.summary ?? undefined,
      tags: r.tags ?? undefined,
    }));

    const results = await client.mutation(
      api.migration.batchInsertSermons,
      { sermons: batch }
    );

    for (const { originalId, convexId } of results as { originalId: number; convexId: Id<"sermons"> }[]) {
      idMap.set(originalId, convexId);
    }

    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}\r`);
    await sleep(50);
  }

  console.log(`  ✅ ${rows.length} sermons migrated`);
  return idMap;
}

// ─── 3. Chunks ──────────────────────────────────────────────────────
async function migrateChunks(sermonIdMap: Map<number, Id<"sermons">>) {
  console.log("\n📄 Migrating chunks...");
  const rows = db
    .prepare("SELECT id, sermon_id, chunk_index, content FROM chunks ORDER BY id")
    .all() as { id: number; sermon_id: number; chunk_index: number; content: string }[];

  console.log(`  Found ${rows.length} chunks`);

  let migrated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const convexBatch = [];

    for (const row of batch) {
      const convexSermonId = sermonIdMap.get(row.sermon_id);
      if (!convexSermonId) {
        skipped++;
        continue;
      }
      convexBatch.push({
        sermonId: convexSermonId,
        originalSermonId: row.sermon_id,
        chunkIndex: row.chunk_index,
        content: row.content,
      });
    }

    if (convexBatch.length > 0) {
      await client.mutation(api.migration.batchInsertChunks, {
        chunks: convexBatch,
      });
      migrated += convexBatch.length;
    }

    if ((i / BATCH_SIZE) % 20 === 0) {
      process.stdout.write(`  ${migrated}/${rows.length}\r`);
    }
    await sleep(50);
  }

  console.log(`  ✅ ${migrated} chunks migrated (${skipped} skipped)`);
}

// ─── 4. Chat Messages ──────────────────────────────────────────────
async function migrateChatMessages() {
  console.log("\n💬 Migrating chat messages...");
  const rows = db
    .prepare("SELECT session_id, role, content, sermon_refs FROM chat_messages ORDER BY id")
    .all() as { session_id: string; role: string; content: string; sermon_refs: string | null }[];

  console.log(`  Found ${rows.length} messages`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
      sessionId: r.session_id,
      role: r.role as "user" | "assistant",
      content: r.content,
      sermonRefs: r.sermon_refs ?? undefined,
    }));

    await client.mutation(api.migration.batchInsertChatMessages, {
      messages: batch,
    });
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}\r`);
    await sleep(50);
  }

  console.log(`  ✅ ${rows.length} chat messages migrated`);
}

// ─── 5. Quiz Records ──────────────────────────────────────────────
async function migrateQuizRecords(sermonIdMap: Map<number, Id<"sermons">>) {
  console.log("\n📝 Migrating quiz records...");
  const rows = db
    .prepare(
      "SELECT sermon_id, question, expected_answer, user_answer, is_correct, feedback FROM quiz_records ORDER BY id"
    )
    .all() as {
    sermon_id: number | null;
    question: string;
    expected_answer: string;
    user_answer: string | null;
    is_correct: number | null;
    feedback: string | null;
  }[];

  console.log(`  Found ${rows.length} quiz records`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
      originalSermonId: r.sermon_id ?? undefined,
      sermonId: r.sermon_id ? sermonIdMap.get(r.sermon_id) : undefined,
      question: r.question,
      expectedAnswer: r.expected_answer,
      userAnswer: r.user_answer ?? undefined,
      isCorrect: r.is_correct !== null ? r.is_correct === 1 : undefined,
      feedback: r.feedback ?? undefined,
    }));

    await client.mutation(api.migration.batchInsertQuizRecords, {
      records: batch,
    });
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}\r`);
    await sleep(50);
  }

  console.log(`  ✅ ${rows.length} quiz records migrated`);
}

// ─── 6. Settings ──────────────────────────────────────────────────
async function migrateSettings() {
  console.log("\n⚙️  Migrating settings...");
  const rows = db
    .prepare("SELECT key, value FROM app_settings")
    .all() as { key: string; value: string }[];

  if (rows.length > 0) {
    await client.mutation(api.migration.batchInsertSettings, {
      settings: rows,
    });
  }

  console.log(`  ✅ ${rows.length} settings migrated`);
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Starting Convex migration...");
  console.log(`  Source: ${DB_PATH}`);
  console.log(`  Target: ${CONVEX_URL}`);

  await migrateBibleVerses();
  const sermonIdMap = await migrateSermons();
  await migrateChunks(sermonIdMap);
  await migrateChatMessages();
  await migrateQuizRecords(sermonIdMap);
  await migrateSettings();

  console.log("\n🎉 Migration complete!");
  console.log(`  Sermons: ${sermonIdMap.size}`);
  console.log("  Run 'npx convex run embeddings:processEmbeddingBatch' to generate embeddings.");

  db.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
