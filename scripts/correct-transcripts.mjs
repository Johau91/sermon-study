import path from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const DB_PATH = path.join(process.cwd(), "data", "sermons.db");
const db = new Database(DB_PATH);
sqliteVec.load(db);

function applyCorrections(text) {
  let corrected = String(text || "").replace(/\s+/g, " ").trim();

  corrected = corrected
    .replace(/(요한계시록)\s+\1/g, "$1")
    .replace(/(에베소서)\s+\1/g, "$1")
    .replace(/([가-힣]{2,8})\s+\1/g, "$1");

  corrected = corrected
    .replace(/하나\s*님/g, "하나님")
    .replace(/예수\s*님/g, "예수님")
    .replace(/주\s*님/g, "주님")
    .replace(/성\s*령/g, "성령")
    .replace(/그리스\s*도/g, "그리스도")
    .replace(/요한\s*계시록/g, "요한계시록")
    .replace(/예베소서/g, "에베소서")
    .replace(/윤석전목사/g, "윤석전 목사");

  corrected = corrected
    .replace(/(\d+)\s*장\s*(\d+)\s*절/g, "$1장 $2절")
    .replace(/(\d+)\s*:\s*(\d+)/g, "$1:$2")
    .replace(/([가-힣]+)\s*(\d+)\s*장/g, "$1 $2장")
    .replace(/(\d+)\s*절\s*에서\s*(\d+)\s*절/g, "$1절에서 $2절")
    .replace(/\[(음악|박수|웃음)\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return corrected;
}

function chunkText(text, chunkSize = 800, overlap = 150) {
  if (!text || text.trim().length === 0) return [];
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= chunkSize) return [{ index: 0, content: cleaned }];

  const chunks = [];
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
      if (lastPeriod > chunkSize * 0.5) end = start + lastPeriod + 2;
    } else {
      end = cleaned.length;
    }

    chunks.push({ index, content: cleaned.slice(start, end).trim() });
    if (end >= cleaned.length) break;
    start = end - overlap;
    index += 1;
  }

  return chunks;
}

const sermons = db.prepare("SELECT id, transcript_raw FROM sermons ORDER BY id ASC").all();
const selectChunkIds = db.prepare("SELECT id FROM chunks WHERE sermon_id = ? ORDER BY id");
const deleteChunks = db.prepare("DELETE FROM chunks WHERE sermon_id = ?");
const updateTranscript = db.prepare("UPDATE sermons SET transcript_raw = ? WHERE id = ?");
const insertChunk = db.prepare("INSERT INTO chunks (sermon_id, chunk_index, content) VALUES (?, ?, ?)");

function dropChunkTriggers() {
  db.exec(`
    DROP TRIGGER IF EXISTS chunks_ai;
    DROP TRIGGER IF EXISTS chunks_ad;
    DROP TRIGGER IF EXISTS chunks_au;
  `);
}

function rebuildFtsAndTriggers() {
  db.exec(`
    DROP TABLE IF EXISTS chunks_fts;
    CREATE VIRTUAL TABLE chunks_fts USING fts5(
      content,
      content_rowid='id',
      tokenize='unicode61'
    );
    INSERT INTO chunks_fts(rowid, content)
    SELECT id, content FROM chunks;

    CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
    END;

    CREATE TRIGGER chunks_au AFTER UPDATE OF content ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `);
}

let correctedCount = 0;
let skippedLog = 0;
let unchanged = 0;

try {
  dropChunkTriggers();

  const tx = db.transaction(() => {
    for (const sermon of sermons) {
      const raw = sermon.transcript_raw || "";
      if (!raw.trim()) {
        unchanged += 1;
        continue;
      }
      if (raw.startsWith("[youtube]")) {
        skippedLog += 1;
        continue;
      }

      const corrected = applyCorrections(raw);
      if (corrected === raw) {
        unchanged += 1;
        continue;
      }

      const oldChunkIds = selectChunkIds.all(sermon.id).map((r) => Number(r.id));
      if (oldChunkIds.length > 0) {
        const placeholders = oldChunkIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM vec_chunks WHERE chunk_id IN (${placeholders})`).run(...oldChunkIds);
      }

      deleteChunks.run(sermon.id);
      updateTranscript.run(corrected, sermon.id);
      const chunks = chunkText(corrected);
      for (const c of chunks) {
        insertChunk.run(sermon.id, c.index, c.content);
      }

      correctedCount += 1;
    }
  });

  tx();
} finally {
  rebuildFtsAndTriggers();
}

console.log(`Corrected sermons: ${correctedCount}`);
console.log(`Skipped log-only sermons: ${skippedLog}`);
console.log(`Unchanged sermons: ${unchanged}`);
