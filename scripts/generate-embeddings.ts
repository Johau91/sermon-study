import { mkdirSync } from "fs";
import path from "path";
import { getDb } from "../src/lib/db";
import {
  generateEmbeddings,
  generateEmbedding,
  embeddingToBuffer,
} from "../src/lib/embeddings";

// Ensure data directory exists
mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

const BATCH_SIZE = 10;
const COMMIT_EVERY = 500;

async function main() {
  const forceFlag = process.argv.includes("--force");
  const db = getDb();

  if (forceFlag) {
    console.log("--force: Dropping vec_chunks and clearing all embeddings...");
    try {
      db.exec(`DROP TABLE IF EXISTS vec_chunks`);
    } catch {
      // vec_chunks may not exist
    }
    // Recreate vec_chunks with 1024 dimensions
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding float[1024] distance_metric=cosine
      );
    `);
    db.exec(`UPDATE chunks SET embedding = NULL`);
    console.log("All embeddings cleared. Starting fresh.\n");
  }

  // Get all chunks that need embeddings
  const chunks = db
    .prepare(`SELECT id, content FROM chunks WHERE embedding IS NULL`)
    .all() as { id: number; content: string }[];

  if (chunks.length === 0) {
    console.log("No chunks need embeddings. All up to date!");
    return;
  }

  console.log(`Generating embeddings for ${chunks.length} chunks...\n`);

  let completed = 0;
  let failed = 0;

  const updateChunk = db.prepare(
    `UPDATE chunks SET embedding = ? WHERE id = ?`
  );
  const deleteVec = db.prepare(
    `DELETE FROM vec_chunks WHERE chunk_id = ?`
  );
  const insertVec = db.prepare(
    `INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)`
  );

  // Process in batches
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    try {
      let embeddings: Float32Array[];

      if (batch.length === 1) {
        const emb = await generateEmbedding(batch[0].content);
        embeddings = [emb];
      } else {
        embeddings = await generateEmbeddings(
          batch.map((c) => c.content)
        );
      }

      // Write batch to DB
      const tx = db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          const buffer = embeddingToBuffer(embeddings[j]);
          updateChunk.run(buffer, batch[j].id);
          deleteVec.run(BigInt(batch[j].id));
          insertVec.run(BigInt(batch[j].id), buffer);
        }
      });
      tx();

      completed += batch.length;
    } catch (err) {
      // Fallback: try one-by-one for the failed batch
      for (const chunk of batch) {
        try {
          const embedding = await generateEmbedding(chunk.content);
          const buffer = embeddingToBuffer(embedding);
          db.transaction(() => {
            updateChunk.run(buffer, chunk.id);
            deleteVec.run(BigInt(chunk.id));
            insertVec.run(BigInt(chunk.id), buffer);
          })();
          completed++;
        } catch (innerErr) {
          failed++;
          console.error(`\n  Failed chunk ${chunk.id}: ${innerErr}`);
        }
      }
    }

    // Progress display
    const pct = Math.round((completed / chunks.length) * 100);
    const bar =
      "█".repeat(Math.floor(pct / 2)) +
      "░".repeat(50 - Math.floor(pct / 2));
    process.stdout.write(
      `\r  [${bar}] ${pct}% (${completed}/${chunks.length})`
    );

    // Periodic checkpoint info
    if (completed > 0 && completed % COMMIT_EVERY < BATCH_SIZE) {
      process.stdout.write(` [checkpoint @ ${completed}]`);
    }
  }

  console.log(
    `\n\nDone! Generated ${completed} embeddings, ${failed} failed.`
  );
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
