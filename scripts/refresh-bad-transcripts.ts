import { mkdirSync } from "fs";
import path from "path";
import { getDb } from "../src/lib/db";
import { getTranscript } from "../src/lib/youtube";
import { chunkText } from "../src/lib/chunker";

mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

const BAD_PATTERNS = ["[youtube]%", "[info]%", "ERROR:%"];

type SermonRow = {
  id: number;
  youtube_id: string;
  title: string;
};

function buildBadWhere() {
  return BAD_PATTERNS.map(() => "transcript_raw LIKE ?").join(" OR ");
}

async function main() {
  const db = getDb();
  const where = buildBadWhere();

  const sermons = db
    .prepare(
      `SELECT id, youtube_id, title FROM sermons WHERE ${where} ORDER BY id ASC`
    )
    .all(...BAD_PATTERNS) as SermonRow[];

  if (sermons.length === 0) {
    console.log("No bad transcripts found.");
    return;
  }

  console.log(`Found ${sermons.length} bad transcripts.\\n`);

  const selectChunkIds = db.prepare(
    "SELECT id FROM chunks WHERE sermon_id = ? ORDER BY id"
  );
  const deleteChunks = db.prepare("DELETE FROM chunks WHERE sermon_id = ?");
  const updateTranscript = db.prepare(
    "UPDATE sermons SET transcript_raw = ? WHERE id = ?"
  );
  const insertChunk = db.prepare(
    "INSERT OR IGNORE INTO chunks (sermon_id, chunk_index, content) VALUES (?, ?, ?)"
  );

  let fixed = 0;
  let failed = 0;

  for (let i = 0; i < sermons.length; i++) {
    const sermon = sermons[i];
    console.log(`[${i + 1}/${sermons.length}] ${sermon.title}`);

    const transcript = await getTranscript(sermon.youtube_id);
    if (!transcript || transcript.length < 100) {
      console.log("  -> Failed to fetch transcript\\n");
      failed++;
      continue;
    }

    const chunks = chunkText(transcript);

    const tx = db.transaction(() => {
      const chunkRows = selectChunkIds.all(sermon.id) as { id: number }[];
      if (chunkRows.length > 0) {
        const chunkIds = chunkRows.map((r) => r.id);
        const placeholders = chunkIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM vec_chunks WHERE chunk_id IN (${placeholders})`).run(
          ...chunkIds
        );
      }

      deleteChunks.run(sermon.id);
      updateTranscript.run(transcript, sermon.id);
      for (const chunk of chunks) {
        insertChunk.run(sermon.id, chunk.index, chunk.content);
      }
    });

    tx();
    console.log(`  -> Fixed (${chunks.length} chunks)\\n`);
    fixed++;
  }

  console.log(`Done. fixed=${fixed}, failed=${failed}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
