import { mkdirSync } from "fs";
import path from "path";
import { getDb } from "../src/lib/db";
import { generateEmbedding, embeddingToBuffer } from "../src/lib/embeddings";

// Ensure data directory exists
mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

function syncVecChunks(db: ReturnType<typeof getDb>) {
  // Migrate existing BLOB embeddings into vec_chunks
  const rows = db
    .prepare(
      `SELECT c.id, c.embedding FROM chunks c
       WHERE c.embedding IS NOT NULL
         AND c.id NOT IN (SELECT chunk_id FROM vec_chunks)`
    )
    .all() as { id: number; embedding: Buffer }[];

  if (rows.length === 0) {
    console.log("vec_chunks already in sync.");
    return;
  }

  console.log(`Syncing ${rows.length} existing embeddings to vec_chunks...`);
  const insertVec = db.prepare(
    `INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)`
  );

  const tx = db.transaction(() => {
    for (const row of rows) {
      insertVec.run(BigInt(row.id), row.embedding);
    }
  });
  tx();
  console.log(`Synced ${rows.length} rows to vec_chunks.`);
}

async function main() {
  const db = getDb();

  // First, sync any existing BLOB embeddings to vec_chunks
  syncVecChunks(db);

  // Get all chunks without embeddings
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
  const insertVec = db.prepare(
    `INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)`
  );

  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk.content);
      const buffer = embeddingToBuffer(embedding);

      db.transaction(() => {
        updateChunk.run(buffer, chunk.id);
        insertVec.run(BigInt(chunk.id), buffer);
      })();

      completed++;

      // Progress display
      const pct = Math.round((completed / chunks.length) * 100);
      const bar =
        "█".repeat(Math.floor(pct / 2)) +
        "░".repeat(50 - Math.floor(pct / 2));
      process.stdout.write(
        `\r  [${bar}] ${pct}% (${completed}/${chunks.length})`
      );
    } catch (err) {
      failed++;
      console.error(`\n  Failed chunk ${chunk.id}: ${err}`);
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
