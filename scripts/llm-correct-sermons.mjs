import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const execFileAsync = promisify(execFile);

/* ── CLI args ─────────────────────────────────────────────── */
const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");
const CONCURRENCY = parseInt(
  process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] || "4"
);
const BATCH_SIZE = parseInt(
  process.argv.find((a) => a.startsWith("--batch="))?.split("=")[1] || "5"
);
const SERMON_ID = process.argv
  .find((a) => a.startsWith("--sermon="))
  ?.split("=")[1];
const RESUME = process.argv.includes("--resume");
const APPLY = process.argv.includes("--apply");

/* ── Database ─────────────────────────────────────────────── */
const DB_PATH = path.join(process.cwd(), "data", "sermons.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 10000");
// NOTE: sqlite-vec not loaded — not needed for corrections

// Create tracking table for resume support
db.exec(`
  CREATE TABLE IF NOT EXISTS llm_corrections (
    chunk_id INTEGER PRIMARY KEY,
    original_content TEXT NOT NULL,
    corrected_content TEXT NOT NULL,
    changed INTEGER NOT NULL DEFAULT 0,
    corrected_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

/* ── Prompt ───────────────────────────────────────────────── */
const SYSTEM_PROMPT = `당신은 한국어 설교 음성인식(ASR) 텍스트 교정 전문가입니다.

규칙:
1. 음성인식 오류로 인한 오타만 수정하세요 (예: "반속" → "반석", "가늠" → "간음", "합덕" → "합독")
2. 의미를 변경하거나 내용을 추가/삭제하지 마세요
3. 문장 구조를 재구성하지 마세요
4. 성경 용어, 기독교 용어의 오인식을 우선적으로 수정하세요
5. 완전히 깨진 텍스트(의미 파악 불가)는 그대로 두세요
6. 수정된 텍스트만 출력하세요. 설명이나 주석을 붙이지 마세요
7. 원문과 동일하면 그대로 출력하세요`;

/* ── Claude CLI call (temp file for prompt) ──────────────── */
let tmpCounter = 0;

const PROMPT_TEMPLATE = (text) =>
  `아래 한국어 설교 음성인식 텍스트의 오타를 교정해서 출력하세요. 규칙: 음성인식 오류 오탈자만 수정. 성경/기독교 용어 오인식 우선 수정. 의미 변경/추가/삭제 금지. 문장 구조 재구성 금지. 완전히 깨진 텍스트는 그대로. 교정된 텍스트만 출력하고 설명이나 마크다운 서식 절대 붙이지 마세요.\n\n${text}`;

async function correctWithClaude(text) {
  const promptFile = path.join(os.tmpdir(), `sermon-prompt-${process.pid}-${tmpCounter++}.txt`);
  try {
    fs.writeFileSync(promptFile, PROMPT_TEMPLATE(text), "utf-8");

    const { stdout } = await execFileAsync(
      "/bin/sh",
      ["-c", `cat "${promptFile}" | claude -p - --output-format text --model haiku`],
      {
        timeout: 120000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env },
      }
    );
    const result = stdout.trim();
    if (VERBOSE && !result) console.error(`\n  ⚠ Empty response for chunk`);
    return result || null;
  } catch (err) {
    const msg = err.stderr || err.message || "unknown error";
    console.error(`\n  ⚠ Claude error: ${String(msg).slice(0, 300)}`);
    return null;
  } finally {
    try { fs.unlinkSync(promptFile); } catch {}
  }
}

/* ── Process a single chunk ───────────────────────────────── */
async function processChunk(chunk) {
  const { id, content } = chunk;

  // Skip very short chunks
  if (content.length < 30) {
    if (VERBOSE) console.log(`  [${id}] Skip (too short)`);
    return { id, changed: false };
  }

  let corrected;
  try {
    corrected = await correctWithClaude(content);
  } catch (e) {
    console.error(`\n  ⚠ [${id}] correctWithClaude threw: ${e.message}`);
    return { id, changed: false, error: true };
  }
  if (!corrected) {
    return { id, changed: false, error: true };
  }

  // Check if anything changed
  const changed = corrected !== content;

  if (!DRY_RUN) {
    try {
      // Save correction record (chunks updated later via --apply)
      db.prepare(`
        INSERT OR REPLACE INTO llm_corrections (chunk_id, original_content, corrected_content, changed)
        VALUES (?, ?, ?, ?)
      `).run(id, content, corrected, changed ? 1 : 0);
    } catch (e) {
      console.error(`\n  ⚠ [${id}] DB write error: ${e.message}`);
      return { id, changed: false, error: true };
    }
  }

  if (VERBOSE && changed) {
    const diff = content.substring(0, 80) + " → " + corrected.substring(0, 80);
    console.log(`  [${id}] Changed: ${diff}`);
  }

  return { id, changed };
}

/* ── Process chunks in parallel batches ───────────────────── */
async function processBatch(chunks) {
  const results = await Promise.allSettled(
    chunks.map((chunk) => processChunk(chunk))
  );
  return results.map((r) =>
    r.status === "fulfilled" ? r.value : { changed: false, error: true }
  );
}

/* ── Apply mode: bulk-update chunks from llm_corrections ─── */
function applyCorrections() {
  console.log("═══════════════════════════════════════════════════");
  console.log(" LLM 교정 결과 적용 (llm_corrections → chunks)");
  console.log("═══════════════════════════════════════════════════\n");

  // Need sqlite-vec loaded for FTS triggers on chunks
  sqliteVec.load(db);

  const rows = db.prepare(
    `SELECT chunk_id, corrected_content FROM llm_corrections WHERE changed = 1`
  ).all();

  console.log(`적용 대상: ${rows.length}개 청크\n`);
  if (rows.length === 0) return;

  let applied = 0;
  const update = db.prepare("UPDATE chunks SET content = ? WHERE id = ?");
  const tx = db.transaction(() => {
    for (const row of rows) {
      update.run(row.corrected_content, row.chunk_id);
      applied++;
    }
  });
  tx();
  console.log(`완료: ${applied}개 청크 업데이트`);
}

/* ── Main ─────────────────────────────────────────────────── */
async function main() {
  if (APPLY) {
    applyCorrections();
    return;
  }

  console.log("═══════════════════════════════════════════════════");
  console.log(" LLM 설교 교정 (Claude CLI)");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log(`  Resume: ${RESUME}`);
  if (SERMON_ID) console.log(`  Sermon ID: ${SERMON_ID}`);
  console.log("──────────────────────────────────────────────────");

  // Build query
  let query = "SELECT c.id, c.content FROM chunks c";
  const params = [];

  if (RESUME) {
    query += " LEFT JOIN llm_corrections lc ON c.id = lc.chunk_id WHERE lc.chunk_id IS NULL";
    if (SERMON_ID) {
      query += " AND c.sermon_id = ?";
      params.push(SERMON_ID);
    }
  } else if (SERMON_ID) {
    query += " WHERE c.sermon_id = ?";
    params.push(SERMON_ID);
  }

  query += " ORDER BY c.sermon_id, c.chunk_index";

  const allChunks = db.prepare(query).all(...params);
  const totalChunks = allChunks.length;
  console.log(`\n총 ${totalChunks}개 청크 처리 예정\n`);

  if (totalChunks === 0) {
    console.log("처리할 청크가 없습니다.");
    return;
  }

  let processed = 0;
  let changed = 0;
  let errors = 0;
  const startTime = Date.now();

  // Process in batches of CONCURRENCY
  for (let i = 0; i < allChunks.length; i += CONCURRENCY) {
    const batch = allChunks.slice(i, i + CONCURRENCY);
    const results = await processBatch(batch);

    for (const result of results) {
      processed++;
      if (result.changed) changed++;
      if (result.error) errors++;
    }

    // Progress report
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const remaining = (totalChunks - processed) / rate;
    const pct = ((processed / totalChunks) * 100).toFixed(1);

    process.stdout.write(
      `\r  [${processed}/${totalChunks}] ${pct}% | ` +
        `수정: ${changed} | 오류: ${errors} | ` +
        `${rate.toFixed(1)}/s | 남은시간: ${formatTime(remaining)}   `
    );
  }

  console.log("\n\n══════════════════════════════════════════════════");
  console.log(`  완료: ${processed}개 처리, ${changed}개 수정, ${errors}개 오류`);
  console.log("══════════════════════════════════════════════════");
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
