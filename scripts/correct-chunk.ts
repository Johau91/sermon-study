import { getDb } from "../src/lib/db";

const chunkId = Number(process.argv[2]);
const newContent = process.argv[3];

if (!chunkId || !newContent) {
  console.error("Usage: tsx scripts/correct-chunk.ts <chunk_id> <new_content>");
  process.exit(1);
}

const db = getDb();
db.prepare("UPDATE chunks SET content = ? WHERE id = ?").run(newContent, chunkId);
console.log(`Updated chunk ${chunkId}`);
