import { execSync } from "node:child_process";
import path from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const DB_PATH = path.join(process.cwd(), "data", "sermons.db");
const db = new Database(DB_PATH);
sqliteVec.load(db);

const BAD_PATTERNS = ["[youtube]%", "[info]%", "ERROR:%"];

function cleanSubtitles(raw) {
  const lines = raw.split("\n");
  const textLines = [];
  let prevLine = "";

  for (const line of lines) {
    if (
      line.startsWith("WEBVTT") ||
      line.startsWith("Kind:") ||
      line.startsWith("Language:") ||
      line.startsWith("NOTE") ||
      /^\d{2}:\d{2}/.test(line) ||
      /^align:/.test(line) ||
      /position:\d+%/.test(line) ||
      line.trim() === ""
    ) {
      continue;
    }

    const cleaned = line
      .replace(/align:start\s*/g, "")
      .replace(/position:\d+%\s*/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&gt;/g, "")
      .replace(/&lt;/g, "")
      .replace(/&amp;/g, "&")
      .replace(/\[음악\]/g, "")
      .replace(/\[박수\]/g, "")
      .replace(/\[웃음\]/g, "")
      .trim();

    if (!cleaned) continue;
    if (cleaned === prevLine) continue;

    const lastIndex = textLines.length - 1;
    const lastLine = lastIndex >= 0 ? textLines[lastIndex] : "";

    if (lastLine && cleaned.startsWith(lastLine)) {
      textLines[lastIndex] = cleaned;
      prevLine = cleaned;
      continue;
    }
    if (lastLine && lastLine.startsWith(cleaned)) {
      continue;
    }

    textLines.push(cleaned);
    prevLine = cleaned;
  }

  return textLines.join(" ").replace(/\s+/g, " ").trim();
}

function getTranscript(videoId) {
  try {
    const tmpBase = `/tmp/yt-sub-${videoId}`;
    const raw = execSync(
      `yt-dlp --write-auto-sub --sub-lang ko --sub-format vtt --skip-download --quiet --no-warnings -o "${tmpBase}" "https://www.youtube.com/watch?v=${videoId}" && cat "${tmpBase}.ko.vtt" && rm -f "${tmpBase}"*`,
      { encoding: "utf-8", timeout: 90000, maxBuffer: 20 * 1024 * 1024 }
    );
    if (!raw || raw.trim().length < 100) return null;
    return cleanSubtitles(raw);
  } catch {
    return null;
  }
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

const where = BAD_PATTERNS.map(() => "transcript_raw LIKE ?").join(" OR ");
const sermons = db
  .prepare(`SELECT id, youtube_id, title FROM sermons WHERE ${where} ORDER BY id ASC`)
  .all(...BAD_PATTERNS);

if (sermons.length === 0) {
  console.log("No bad transcripts found.");
  process.exit(0);
}

console.log(`Found ${sermons.length} bad transcripts.`);

const selectChunkIds = db.prepare("SELECT id FROM chunks WHERE sermon_id = ? ORDER BY id");
const deleteChunks = db.prepare("DELETE FROM chunks WHERE sermon_id = ?");
const updateTranscript = db.prepare("UPDATE sermons SET transcript_raw = ? WHERE id = ?");
const insertChunk = db.prepare(
  "INSERT OR IGNORE INTO chunks (sermon_id, chunk_index, content) VALUES (?, ?, ?)"
);

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

let fixed = 0;
let failed = 0;

try {
  dropChunkTriggers();

  for (let i = 0; i < sermons.length; i++) {
    const sermon = sermons[i];
    console.log(`[${i + 1}/${sermons.length}] ${sermon.title}`);

    const transcript = getTranscript(sermon.youtube_id);
    if (!transcript || transcript.length < 100) {
      console.log("  -> Failed to fetch transcript");
      failed += 1;
      continue;
    }

    const chunks = chunkText(transcript);
    const tx = db.transaction(() => {
      const chunkRows = selectChunkIds.all(sermon.id);
      if (chunkRows.length > 0) {
        const ids = chunkRows.map((r) => r.id);
        const placeholders = ids.map(() => "?").join(",");
        db.prepare(`DELETE FROM vec_chunks WHERE chunk_id IN (${placeholders})`).run(...ids);
      }

      deleteChunks.run(sermon.id);
      updateTranscript.run(transcript, sermon.id);

      for (const chunk of chunks) {
        insertChunk.run(sermon.id, chunk.index, chunk.content);
      }
    });

    tx();
    console.log(`  -> Fixed (${chunks.length} chunks)`);
    fixed += 1;
  }
} finally {
  rebuildFtsAndTriggers();
}

console.log(`Done. fixed=${fixed}, failed=${failed}`);
