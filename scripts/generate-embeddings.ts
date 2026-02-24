import { mkdirSync } from "fs";
import path from "path";
import { getDb } from "../src/lib/db";
import {
  generateEmbeddings,
  generateEmbedding,
  getQdrantClient,
  ensureQdrantCollection,
  QDRANT_COLLECTION,
} from "../src/lib/embeddings";

// Ensure data directory exists
mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

const BATCH_SIZE = 10;
const QDRANT_BATCH_SIZE = 100;

async function main() {
  const forceFlag = process.argv.includes("--force");
  const db = getDb();
  const qdrant = getQdrantClient();

  await ensureQdrantCollection();

  if (forceFlag) {
    console.log("--force: Deleting all vectors from Qdrant and clearing embeddings...");
    // Delete all points from Qdrant collection
    await qdrant.delete(QDRANT_COLLECTION, {
      filter: { must: [{ is_empty: { key: "chunk_id" } }] },
    }).catch(() => null);
    // Simpler: delete and recreate the collection
    await qdrant.deleteCollection(QDRANT_COLLECTION).catch(() => null);
    await ensureQdrantCollection();
    // Mark all chunks as needing re-embedding (use a flag column approach — we track via Qdrant)
    console.log("Qdrant collection cleared. Starting fresh.\n");
  }

  // Get existing Qdrant chunk IDs to skip already-embedded chunks
  let embeddedIds = new Set<number>();
  try {
    // Scroll through all points to get existing chunk_ids
    let offset: number | string | null = null;
    do {
      const result = await qdrant.scroll(QDRANT_COLLECTION, {
        limit: 1000,
        offset: offset ?? undefined,
        with_payload: ["chunk_id"],
        with_vector: false,
      });
      for (const point of result.points) {
        const cid = (point.payload as { chunk_id: number }).chunk_id;
        if (cid != null) embeddedIds.add(cid);
      }
      const next = result.next_page_offset;
      offset = (typeof next === "string" || typeof next === "number") ? next : null;
    } while (offset != null);
  } catch {
    // Empty collection or connection issue — proceed with all chunks
  }

  // Get all chunks
  const allChunks = db
    .prepare(`SELECT id, sermon_id, content FROM chunks`)
    .all() as { id: number; sermon_id: number; content: string }[];

  const chunks = allChunks.filter(c => !embeddedIds.has(c.id));

  if (chunks.length === 0) {
    console.log(`No chunks need embeddings. All ${allChunks.length} chunks up to date!`);
    return;
  }

  console.log(`Generating embeddings for ${chunks.length} chunks (${embeddedIds.size} already done)...\n`);

  let completed = 0;
  let failed = 0;
  // Buffer for Qdrant batch upsert
  const upsertBuffer: Array<{
    id: number;
    vector: number[];
    payload: { chunk_id: number; sermon_id: number; content: string };
  }> = [];

  async function flushUpsertBuffer() {
    if (upsertBuffer.length === 0) return;
    await qdrant.upsert(QDRANT_COLLECTION, {
      wait: true,
      points: upsertBuffer.map(p => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    });
    upsertBuffer.length = 0;
  }

  // Process in batches
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    try {
      let embeddings: Float32Array[];

      if (batch.length === 1) {
        const emb = await generateEmbedding(batch[0].content);
        embeddings = [emb];
      } else {
        embeddings = await generateEmbeddings(batch.map((c) => c.content));
      }

      for (let j = 0; j < batch.length; j++) {
        upsertBuffer.push({
          id: batch[j].id,
          vector: Array.from(embeddings[j]),
          payload: {
            chunk_id: batch[j].id,
            sermon_id: batch[j].sermon_id,
            content: batch[j].content,
          },
        });
      }

      completed += batch.length;
    } catch (err) {
      // Fallback: try one-by-one
      for (const chunk of batch) {
        try {
          const embedding = await generateEmbedding(chunk.content);
          upsertBuffer.push({
            id: chunk.id,
            vector: Array.from(embedding),
            payload: {
              chunk_id: chunk.id,
              sermon_id: chunk.sermon_id,
              content: chunk.content,
            },
          });
          completed++;
        } catch (innerErr) {
          failed++;
          console.error(`\n  Failed chunk ${chunk.id}: ${innerErr}`);
        }
      }
    }

    // Flush Qdrant buffer every QDRANT_BATCH_SIZE points
    if (upsertBuffer.length >= QDRANT_BATCH_SIZE) {
      await flushUpsertBuffer();
    }

    // Progress display
    const pct = Math.round((completed / chunks.length) * 100);
    const bar =
      "█".repeat(Math.floor(pct / 2)) +
      "░".repeat(50 - Math.floor(pct / 2));
    process.stdout.write(
      `\r  [${bar}] ${pct}% (${completed}/${chunks.length})`
    );
  }

  // Final flush
  await flushUpsertBuffer();

  console.log(
    `\n\nDone! Generated ${completed} embeddings, ${failed} failed.`
  );

  // Verify
  const info = await qdrant.getCollection(QDRANT_COLLECTION);
  console.log(`Qdrant collection has ${info.points_count} points total.`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
