import path from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const DB_PATH = path.join(process.cwd(), "data", "sermons.db");
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || "2048");
const NUM_BATCH = Number(process.env.OLLAMA_NUM_BATCH || "64");
const LOW_VRAM = process.env.OLLAMA_LOW_VRAM !== "false";

const db = new Database(DB_PATH);
sqliteVec.load(db);

function splitText(text, maxLen = 900) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sentences = cleaned.split(/(?<=[.!?다])\s+/);
  const chunks = [];
  let current = "";

  for (const s of sentences) {
    if (!s) continue;
    if ((current + " " + s).trim().length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = s;
    } else {
      current = (current + " " + s).trim();
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [cleaned];
}

async function correctChunk(text) {
  const prompt = `다음은 설교 자동자막 텍스트다. 의미를 바꾸지 말고 한국어 문장만 자연스럽게 교정해라.\n규칙:\n1) 성경/신앙 용어를 올바르게 교정\n2) 오인식 단어 교정\n3) 문장부호/띄어쓰기 정리\n4) 새 내용 추가 금지\n5) 출력은 교정문만\n\n텍스트:\n${text}`;

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      options: { num_ctx: NUM_CTX, num_batch: NUM_BATCH, low_vram: LOW_VRAM },
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.status}`);
  }

  const data = await res.json();
  const out = String(data.message?.content || "").trim();
  return out.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
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

async function main() {
  const sermons = db.prepare("SELECT id, title, transcript_raw FROM sermons ORDER BY id ASC").all();

  const selectChunkIds = db.prepare("SELECT id FROM chunks WHERE sermon_id = ? ORDER BY id");
  const deleteChunks = db.prepare("DELETE FROM chunks WHERE sermon_id = ?");
  const updateTranscript = db.prepare("UPDATE sermons SET transcript_raw = ? WHERE id = ?");
  const insertChunk = db.prepare("INSERT INTO chunks (sermon_id, chunk_index, content) VALUES (?, ?, ?)");

  dropChunkTriggers();
  try {
    for (const sermon of sermons) {
      const raw = String(sermon.transcript_raw || "").trim();
      if (!raw || raw.startsWith("[youtube]")) {
        console.log(`[SKIP] ${sermon.id} ${sermon.title}`);
        continue;
      }

      console.log(`[FIX] ${sermon.id} ${sermon.title}`);
      const parts = splitText(raw, 900);
      const correctedParts = [];
      for (let i = 0; i < parts.length; i++) {
        const fixed = await correctChunk(parts[i]);
        correctedParts.push(fixed || parts[i]);
        process.stdout.write(`  - part ${i + 1}/${parts.length}\r`);
      }
      process.stdout.write("\n");

      const corrected = correctedParts.join(" ").replace(/\s+/g, " ").trim();
      const newChunks = chunkText(corrected);

      const tx = db.transaction(() => {
        const oldChunkIds = selectChunkIds.all(sermon.id).map((r) => Number(r.id));
        if (oldChunkIds.length > 0) {
          const placeholders = oldChunkIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM vec_chunks WHERE chunk_id IN (${placeholders})`).run(...oldChunkIds);
        }

        deleteChunks.run(sermon.id);
        updateTranscript.run(corrected, sermon.id);
        for (const c of newChunks) insertChunk.run(sermon.id, c.index, c.content);
      });

      tx();
      console.log(`  -> updated (${newChunks.length} chunks)`);
    }
  } finally {
    rebuildFtsAndTriggers();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
