import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

/* ── CLI args ─────────────────────────────────────────────── */
const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");
const CONCURRENCY = parseInt(
  process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] || "10"
);
const SERMON_ID = process.argv
  .find((a) => a.startsWith("--sermon="))
  ?.split("=")[1];
const ID_FROM = parseInt(
  process.argv.find((a) => a.startsWith("--id-from="))?.split("=")[1] || "0"
);
const ID_TO = parseInt(
  process.argv.find((a) => a.startsWith("--id-to="))?.split("=")[1] || "999999"
);
const YOUTUBE_ONLY = process.argv.includes("--youtube-only");
const APPLY = process.argv.includes("--apply");

/* ── Database ─────────────────────────────────────────────── */
const DB_PATH = path.join(process.cwd(), "data", "sermons.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 10000");

// Tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS llm_sermon_corrections (
    sermon_id INTEGER PRIMARY KEY,
    original_text TEXT NOT NULL,
    corrected_text TEXT NOT NULL,
    changed INTEGER NOT NULL DEFAULT 0,
    corrected_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

/* ── Bible lookup ─────────────────────────────────────────── */
const BIBLE_BOOKS = [
  "창세기","출애굽기","레위기","민수기","신명기","여호수아","사사기","룻기",
  "사무엘상","사무엘하","열왕기상","열왕기하","역대상","역대하","에스라",
  "느헤미야","에스더","욥기","시편","잠언","전도서","아가","이사야",
  "예레미야","에스겔","다니엘","호세아","요엘","아모스","오바댜","요나",
  "미가","나훔","하박국","스바냐","학개","스가랴","말라기",
  "마태복음","마가복음","누가복음","요한복음","사도행전","로마서",
  "고린도전서","고린도후서","갈라디아서","에베소서","빌립보서","골로새서",
  "데살로니가전서","데살로니가후서","디모데전서","디모데후서","디도서",
  "빌레몬서","히브리서","야고보서","베드로전서","베드로후서",
  "요한일서","요한이서","요한삼서","유다서","요한계시록",
];

function extractBibleRefs(text) {
  const pattern = new RegExp(
    `(${BIBLE_BOOKS.join("|")})\\s*(\\d+)(?:장|:)(\\d+)(?:[-~](\\d+))?절?`,
    "g"
  );
  const refs = [];
  let m;
  while ((m = pattern.exec(text)) !== null) {
    refs.push({ book: m[1], chapter: parseInt(m[2]), verse: parseInt(m[3]) });
  }
  return refs;
}

function getBibleContext(text) {
  const refs = extractBibleRefs(text);
  if (refs.length === 0) return "";
  const unique = refs.slice(0, 20); // max 20 verses
  const verses = [];
  for (const r of unique) {
    try {
      const row = db.prepare(
        "SELECT text FROM bible_verses WHERE translation='개역한글' AND book=? AND chapter=? AND verse=?"
      ).get(r.book, r.chapter, r.verse);
      if (row) verses.push(`${r.book} ${r.chapter}:${r.verse} "${row.text}"`);
    } catch {}
  }
  return verses.length > 0
    ? `\n[개역한글 성경 참조]\n${verses.join("\n")}\n`
    : "";
}

/* ── Prompt ───────────────────────────────────────────────── */
const PROMPT_TEMPLATE = (text) => {
  const bibleCtx = getBibleContext(text);
  return `당신은 한국어 설교 음성인식(ASR) 텍스트 교정 전문가입니다.

아래 설교 텍스트에서 음성인식 오류로 인한 오타만 수정하세요.
- 성경 용어, 기독교 용어의 오인식을 우선적으로 수정
- 성경 구절은 개역한글 번역 표현을 따르세요${bibleCtx ? " (아래 참조 구절 활용)" : ""}
- 의미를 변경하거나 내용을 추가/삭제하지 마세요
- 문장 구조를 재구성하지 마세요
- 완전히 깨진 텍스트(의미 파악 불가)는 그대로 두세요
- 교정된 전체 텍스트만 출력하세요. 설명, 주석, 마크다운 서식 절대 금지
${bibleCtx}
===
${text}
===`;
};

/* ── Claude CLI call ─────────────────────────────────────── */
let tmpCounter = 0;

async function correctWithClaude(text) {
  const promptFile = path.join(os.tmpdir(), `sermon-full-${process.pid}-${tmpCounter++}.txt`);
  try {
    fs.writeFileSync(promptFile, PROMPT_TEMPLATE(text), "utf-8");
    const { stdout } = await execFileAsync(
      "/bin/sh",
      ["-c", `cat "${promptFile}" | claude -p - --output-format text --model haiku`],
      { timeout: 300000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env } }
    );
    return stdout.trim() || null;
  } catch (err) {
    const msg = err.stderr || err.message || "unknown error";
    console.error(`\n  ⚠ Claude error: ${String(msg).slice(0, 200)}`);
    return null;
  } finally {
    try { fs.unlinkSync(promptFile); } catch {}
  }
}

/* ── Process a single sermon ─────────────────────────────── */
async function processSermon(sermon) {
  const { id, title } = sermon;

  // Get all chunks for this sermon, joined as one text
  const chunks = db.prepare(
    "SELECT id, content, chunk_index FROM chunks WHERE sermon_id = ? ORDER BY chunk_index"
  ).all(id);

  if (chunks.length === 0) return { id, changed: false };

  const fullText = chunks.map(c => c.content).join("\n\n");

  // Skip very short sermons
  if (fullText.length < 100) {
    if (VERBOSE) console.log(`  [${id}] Skip (too short)`);
    return { id, changed: false };
  }

  const corrected = await correctWithClaude(fullText);
  if (!corrected) {
    return { id, changed: false, error: true };
  }

  const changed = corrected !== fullText;

  if (!DRY_RUN) {
    try {
      // Save to tracking table
      db.prepare(`
        INSERT OR REPLACE INTO llm_sermon_corrections (sermon_id, original_text, corrected_text, changed)
        VALUES (?, ?, ?, ?)
      `).run(id, fullText, corrected, changed ? 1 : 0);
    } catch (e) {
      console.error(`\n  ⚠ [${id}] DB error: ${e.message}`);
      return { id, changed: false, error: true };
    }
  }

  if (VERBOSE && changed) {
    // Show a snippet of what changed
    const orig = fullText.substring(0, 60);
    const corr = corrected.substring(0, 60);
    if (orig !== corr) console.log(`\n  [${id}] ${title.slice(0, 40)}: ${orig} → ${corr}`);
  }

  return { id, changed };
}

/* ── Apply mode ──────────────────────────────────────────── */
function applyCorrections() {
  console.log("═══════════════════════════════════════════════════");
  console.log(" 교정 결과 적용 (llm_sermon_corrections → chunks)");
  console.log("═══════════════════════════════════════════════════\n");

  const rows = db.prepare(
    "SELECT sermon_id, corrected_text FROM llm_sermon_corrections WHERE changed = 1"
  ).all();
  console.log(`적용 대상: ${rows.length}개 설교\n`);
  if (rows.length === 0) return;

  let applied = 0;
  for (const row of rows) {
    const chunks = db.prepare(
      "SELECT id, chunk_index FROM chunks WHERE sermon_id = ? ORDER BY chunk_index"
    ).all(row.sermon_id);

    // Split corrected text back into chunks (by double newline)
    const correctedParts = row.corrected_text.split("\n\n");

    // If chunk count matches, update 1:1. Otherwise update as best we can.
    if (correctedParts.length === chunks.length) {
      const update = db.prepare("UPDATE chunks SET content = ? WHERE id = ?");
      for (let i = 0; i < chunks.length; i++) {
        if (correctedParts[i] !== undefined) {
          update.run(correctedParts[i], chunks[i].id);
        }
      }
      applied++;
    } else {
      // Fallback: put all corrected text in chunks proportionally
      const totalOrigLen = chunks.reduce((sum, c) => {
        const orig = db.prepare("SELECT content FROM chunks WHERE id = ?").get(c.id);
        return sum + (orig?.content?.length || 0);
      }, 0);

      // Just update all chunks with the full corrected text split evenly
      const fullCorrected = row.corrected_text;
      let pos = 0;
      const update = db.prepare("UPDATE chunks SET content = ? WHERE id = ?");
      for (let i = 0; i < chunks.length; i++) {
        const origChunk = db.prepare("SELECT content FROM chunks WHERE id = ?").get(chunks[i].id);
        const origLen = origChunk?.content?.length || 0;
        const ratio = origLen / totalOrigLen;
        const partLen = Math.round(fullCorrected.length * ratio);
        const part = fullCorrected.substring(pos, pos + partLen);
        update.run(part, chunks[i].id);
        pos += partLen;
      }
      applied++;
    }
  }

  console.log(`완료: ${applied}개 설교의 청크 업데이트`);
}

/* ── Main ─────────────────────────────────────────────────── */
async function main() {
  if (APPLY) {
    applyCorrections();
    return;
  }

  console.log("═══════════════════════════════════════════════════");
  console.log(" LLM 설교 교정 - 설교 단위 (Claude CLI)");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Dry run: ${DRY_RUN}`);
  if (SERMON_ID) console.log(`  Sermon ID: ${SERMON_ID}`);
  console.log("──────────────────────────────────────────────────");

  // Build sermon list
  let sermons;
  if (SERMON_ID) {
    sermons = db.prepare("SELECT id, title FROM sermons WHERE id = ?").all(SERMON_ID);
  } else {
    // Skip already processed sermons, apply optional ID range and youtube filter
    const youtubeFilter = YOUTUBE_ONLY ? "AND s.youtube_id NOT LIKE 'cd346-%'" : "";
    sermons = db.prepare(`
      SELECT s.id, s.title FROM sermons s
      LEFT JOIN llm_sermon_corrections lc ON s.id = lc.sermon_id
      WHERE lc.sermon_id IS NULL
        AND s.id >= ? AND s.id <= ?
        ${youtubeFilter}
      ORDER BY s.id
    `).all(ID_FROM, ID_TO);
  }

  const total = sermons.length;
  console.log(`\n총 ${total}개 설교 처리 예정\n`);
  if (total === 0) { console.log("처리할 설교가 없습니다."); return; }

  let processed = 0, changed = 0, errors = 0;
  const startTime = Date.now();

  // Process in batches of CONCURRENCY
  for (let i = 0; i < sermons.length; i += CONCURRENCY) {
    const batch = sermons.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(s => processSermon(s)));

    for (const r of results) {
      processed++;
      const val = r.status === "fulfilled" ? r.value : { changed: false, error: true };
      if (val.changed) changed++;
      if (val.error) errors++;
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const remaining = (total - processed) / rate;
    const pct = ((processed / total) * 100).toFixed(1);

    process.stdout.write(
      `\r  [${processed}/${total}] ${pct}% | ` +
      `수정: ${changed} | 오류: ${errors} | ` +
      `${rate.toFixed(1)}/s | 남은시간: ${formatTime(remaining)}   `
    );
  }

  console.log(`\n\n══════════════════════════════════════════════════`);
  console.log(`  완료: ${processed}개 처리, ${changed}개 수정, ${errors}개 오류`);
  console.log(`══════════════════════════════════════════════════`);
}

function formatTime(seconds) {
  if (!isFinite(seconds)) return "계산 중...";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

main().catch(console.error);
