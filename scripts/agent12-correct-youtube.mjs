import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

const DRY_RUN = process.argv.includes("--dry-run");
const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");
const RESUME = process.argv.includes("--resume");
const SHOW_HELP = process.argv.includes("--help") || process.argv.includes("-h");
const CONCURRENCY = parseInt(
  process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] || "1",
  10
);
const LIMIT = parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || "0",
  10
);
const ID_FROM = parseInt(
  process.argv.find((a) => a.startsWith("--id-from="))?.split("=")[1] || "0",
  10
);
const ID_TO = parseInt(
  process.argv.find((a) => a.startsWith("--id-to="))?.split("=")[1] || "9999999",
  10
);
const SERMON_ID = process.argv.find((a) => a.startsWith("--sermon="))?.split("=")[1];
const MODEL = process.argv.find((a) => a.startsWith("--model="))?.split("=")[1] || "haiku";
const PROVIDER = process.argv.find((a) => a.startsWith("--provider="))?.split("=")[1] || "auto";
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || "8192");
const OLLAMA_NUM_BATCH = Number(process.env.OLLAMA_NUM_BATCH || "64");
const OLLAMA_LOW_VRAM = process.env.OLLAMA_LOW_VRAM !== "false";

const DB_PATH = path.join(process.cwd(), "data", "sermons.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 10000");

db.exec(`
  CREATE TABLE IF NOT EXISTS yt_agent12_corrections (
    sermon_id INTEGER PRIMARY KEY,
    original_text TEXT NOT NULL,
    corrected_text TEXT NOT NULL,
    changed INTEGER NOT NULL DEFAULT 0,
    pass_log TEXT,
    corrected_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const BOOKS = [
  "창세기","출애굽기","레위기","민수기","신명기","여호수아","사사기","룻기",
  "사무엘상","사무엘하","열왕기상","열왕기하","역대상","역대하","에스라","느헤미야","에스더",
  "욥기","시편","잠언","전도서","아가","이사야","예레미야","에스겔","다니엘","호세아","요엘",
  "아모스","오바댜","요나","미가","나훔","하박국","스바냐","학개","스가랴","말라기",
  "마태복음","마가복음","누가복음","요한복음","사도행전","로마서","고린도전서","고린도후서",
  "갈라디아서","에베소서","빌립보서","골로새서","데살로니가전서","데살로니가후서","디모데전서",
  "디모데후서","디도서","빌레몬서","히브리서","야고보서","베드로전서","베드로후서",
  "요한일서","요한이서","요한삼서","유다서","요한계시록",
];

function extractBibleRefs(text) {
  const pattern = new RegExp(
    `(${BOOKS.join("|")})\\s*(\\d+)(?:장|:)\\s*(\\d+)(?:[-~](\\d+))?절?`,
    "g"
  );
  const refs = [];
  let m;
  while ((m = pattern.exec(text)) !== null) {
    refs.push({
      book: m[1],
      chapter: Number(m[2]),
      verse: Number(m[3]),
    });
    if (refs.length >= 20) break;
  }
  return refs;
}

function getBibleContext(text) {
  const refs = extractBibleRefs(text);
  if (refs.length === 0) return "";

  const unique = new Set();
  const lines = [];
  for (const ref of refs) {
    const key = `${ref.book}-${ref.chapter}-${ref.verse}`;
    if (unique.has(key)) continue;
    unique.add(key);
    const row = db
      .prepare(
        "SELECT text FROM bible_verses WHERE translation='개역한글' AND book=? AND chapter=? AND verse=?"
      )
      .get(ref.book, ref.chapter, ref.verse);
    if (row?.text) {
      lines.push(`${ref.book} ${ref.chapter}:${ref.verse} ${row.text}`);
    }
  }

  return lines.length ? lines.join("\n") : "";
}

let tmpCounter = 0;

function buildPrompt({ originalText, bibleCtx }) {
  return `당신은 한국어 설교 음성인식(ASR) 텍스트 교정 전문가입니다.

[절대 규칙]
1) 의미 변경 금지, 내용 추가/삭제 금지
2) 문장 구조 재작성 금지 (필요 최소 교정만)
3) 틀린 ASR 표현/성경 용어/장절 표기만 수정
4) 성경 관련 표현은 개역한글 기준으로 맞춤
5) 출력은 교정 텍스트 본문만 (설명/주석/코드블록 금지)

[개역한글 참조]
${bibleCtx || "(추출된 구절 없음)"}

[원문]
${originalText}
`;
}

async function callClaude(prompt) {
  const promptFile = path.join(
    os.tmpdir(),
    `agent12-youtube-${process.pid}-${tmpCounter++}.txt`
  );
  try {
    fs.writeFileSync(promptFile, prompt, "utf-8");
    const { stdout } = await execFileAsync(
      "/bin/sh",
      ["-c", `cat "${promptFile}" | claude -p - --output-format text --model ${MODEL}`],
      {
        timeout: 300000,
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env },
      }
    );
    return stdout.trim() || null;
  } catch (err) {
    const msg = err?.stderr || err?.message || "unknown error";
    console.error(`\n  ⚠ Claude error: ${String(msg).slice(0, 300)}`);
    return null;
  } finally {
    try {
      fs.unlinkSync(promptFile);
    } catch {}
  }
}

async function callOllama(prompt) {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: "user", content: prompt }],
        options: {
          num_ctx: OLLAMA_NUM_CTX,
          num_batch: OLLAMA_NUM_BATCH,
          low_vram: OLLAMA_LOW_VRAM,
        },
        stream: false,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out = String(data?.message?.content || "").trim();
    return out || null;
  } catch {
    return null;
  }
}

async function callModel(prompt) {
  if (PROVIDER === "ollama") {
    return await callOllama(prompt);
  }

  if (PROVIDER === "claude") {
    return await callClaude(prompt);
  }

  const byClaude = await callClaude(prompt);
  if (byClaude) return byClaude;

  const byOllama = await callOllama(prompt);
  if (byOllama) {
    console.log("\n  ℹ claude 실패로 ollama 폴백 사용");
    return byOllama;
  }
  return null;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitByOriginalLengths(text, lengths) {
  const clean = normalizeText(text);
  const totalLen = lengths.reduce((a, b) => a + b, 0) || 1;
  const out = [];
  let pos = 0;

  for (let i = 0; i < lengths.length; i++) {
    if (i === lengths.length - 1) {
      out.push(clean.slice(pos).trim());
      break;
    }
    const target = Math.max(1, Math.round((lengths[i] / totalLen) * clean.length));
    let end = Math.min(clean.length, pos + target);
    const window = clean.slice(end, Math.min(clean.length, end + 80));
    const sentenceBreak = window.search(/[.!?다요]\s/);
    if (sentenceBreak >= 0) end += sentenceBreak + 1;
    out.push(clean.slice(pos, end).trim());
    pos = end;
  }

  return out.map((v) => v || "");
}

async function processSermon(sermon) {
  const chunks = db
    .prepare("SELECT id, content, chunk_index FROM chunks WHERE sermon_id=? ORDER BY chunk_index")
    .all(sermon.id);
  if (!chunks.length) return { sermonId: sermon.id, skipped: true };

  const originalText = normalizeText(
    sermon.transcript_raw && sermon.transcript_raw.trim()
      ? sermon.transcript_raw
      : chunks.map((c) => c.content).join("\n\n")
  );
  if (originalText.length < 120) return { sermonId: sermon.id, skipped: true };

  const bibleCtx = getBibleContext(originalText);
  const prompt = buildPrompt({ originalText, bibleCtx });
  const next = await callModel(prompt);
  if (!next) return { sermonId: sermon.id, error: true };

  const current = normalizeText(next);
  const passLog = [];
  const lenRatio = current.length / Math.max(1, originalText.length);
  const looksBroken = lenRatio < 0.5 || lenRatio > 1.8;
  if (looksBroken) {
    passLog.push("single-pass:reject(len-ratio=" + lenRatio.toFixed(2) + ")");
    return { sermonId: sermon.id, error: true };
  }
  passLog.push(`single-pass:${current !== originalText ? "changed" : "same"}`);

  const changed = current !== originalText;
  if (!DRY_RUN) {
    db.prepare(`
      INSERT OR REPLACE INTO yt_agent12_corrections
      (sermon_id, original_text, corrected_text, changed, pass_log)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      sermon.id,
      originalText,
      current,
      changed ? 1 : 0,
      JSON.stringify(passLog)
    );
  }

  if (VERBOSE) {
    console.log(`  [${sermon.id}] ${changed ? "수정됨" : "변경없음"} ${sermon.title}`);
  }
  return { sermonId: sermon.id, changed };
}

function applyCorrections() {
  const rows = db
    .prepare("SELECT sermon_id, corrected_text FROM yt_agent12_corrections WHERE changed = 1")
    .all();

  console.log(`적용 대상: ${rows.length}개 설교`);
  if (rows.length === 0) return;

  const updateSermon = db.prepare("UPDATE sermons SET transcript_raw=? WHERE id=?");
  const updateChunk = db.prepare("UPDATE chunks SET content=? WHERE id=?");
  const selectChunks = db.prepare(
    "SELECT id, content FROM chunks WHERE sermon_id=? ORDER BY chunk_index"
  );

  const tx = db.transaction(() => {
    for (const row of rows) {
      updateSermon.run(row.corrected_text, row.sermon_id);
      const chunks = selectChunks.all(row.sermon_id);
      if (!chunks.length) continue;
      const lengths = chunks.map((c) => (c.content || "").length || 1);
      const parts = splitByOriginalLengths(row.corrected_text, lengths);
      for (let i = 0; i < chunks.length; i++) {
        updateChunk.run(parts[i] ?? "", chunks[i].id);
      }
    }
  });

  tx();
  console.log("적용 완료");
}

function getTargetSermons() {
  if (SERMON_ID) {
    return db
      .prepare(
        "SELECT id, title, youtube_id, transcript_raw FROM sermons WHERE id=? AND youtube_id NOT LIKE 'cd346-%'"
      )
      .all(SERMON_ID);
  }

  let sql = `
    SELECT s.id, s.title, s.youtube_id, s.transcript_raw
    FROM sermons s
  `;
  if (RESUME) {
    sql += `
      LEFT JOIN yt_agent12_corrections c ON c.sermon_id = s.id
      WHERE c.sermon_id IS NULL
    `;
  } else {
    sql += " WHERE 1=1 ";
  }

  sql += `
    AND s.youtube_id NOT LIKE 'cd346-%'
    AND s.id >= ? AND s.id <= ?
    ORDER BY s.id ASC
  `;

  if (LIMIT > 0) {
    sql += ` LIMIT ${LIMIT}`;
  }

  return db.prepare(sql).all(ID_FROM, ID_TO);
}

function formatTime(seconds) {
  if (!isFinite(seconds)) return "계산중";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

async function main() {
  if (SHOW_HELP) {
    console.log(`
사용법:
  node scripts/agent12-correct-youtube.mjs [옵션]

옵션:
  --dry-run             DB 저장 없이 실행
  --apply               저장된 교정 결과를 sermons/chunks에 반영
  --resume              이전 실행 이어서 처리
  --sermon=<id>         특정 설교만 처리
  --id-from=<n>         시작 sermon id (기본 0)
  --id-to=<n>           종료 sermon id (기본 9999999)
  --limit=<n>           처리 개수 제한
  --concurrency=<n>     동시 처리 수 (기본 1)
  --model=<name>        claude 모델명 (기본 haiku)
  --provider=<name>     auto|claude|ollama (기본 auto)
  --verbose             상세 로그
`);
    return;
  }

  if (PROVIDER !== "ollama" && !process.env.CLAUDE_CODE_USE_BEDROCK) {
    // Best-effort check for local CLI availability in common setups.
    try {
      await execFileAsync("/bin/sh", ["-c", "command -v claude >/dev/null 2>&1"], {
        timeout: 5000,
      });
    } catch {
      console.error("claude CLI를 찾을 수 없습니다. 설치/로그인 후 다시 실행하세요.");
      process.exit(1);
    }
  }

  if (APPLY) {
    applyCorrections();
    return;
  }

  const sermons = getTargetSermons();
  console.log("═══════════════════════════════════════════════════");
  console.log(" 유튜브 설교 단일 패스 교정");
  console.log("═══════════════════════════════════════════════════");
  console.log(`모델: ${MODEL}`);
  console.log(`프로바이더: ${PROVIDER} (ollama=${OLLAMA_MODEL})`);
  console.log(`대상: 유튜브 스크립트만 (youtube_id NOT LIKE 'cd346-%')`);
  console.log(`교정 방식: 설교 단일 패스`);
  console.log(`동시성: ${CONCURRENCY}`);
  console.log(`드라이런: ${DRY_RUN}`);
  console.log(`재개모드: ${RESUME}`);
  console.log(`총 ${sermons.length}개`);
  console.log("───────────────────────────────────────────────────");

  if (!sermons.length) return;

  let processed = 0;
  let changed = 0;
  let errors = 0;
  const start = Date.now();

  for (let i = 0; i < sermons.length; i += CONCURRENCY) {
    const batch = sermons.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(processSermon));
    for (const item of results) {
      processed++;
      const val = item.status === "fulfilled" ? item.value : { error: true };
      if (val.changed) changed++;
      if (val.error) errors++;
    }

    const elapsed = (Date.now() - start) / 1000;
    const rate = processed / Math.max(1, elapsed);
    const remain = (sermons.length - processed) / Math.max(0.001, rate);
    const pct = ((processed / sermons.length) * 100).toFixed(1);
    process.stdout.write(
      `\r[${processed}/${sermons.length}] ${pct}% | 수정 ${changed} | 오류 ${errors} | ${rate.toFixed(
        2
      )}/s | 남은 ${formatTime(remain)}`
    );
  }

  console.log("\n───────────────────────────────────────────────────");
  console.log(`완료: 처리 ${processed}, 수정 ${changed}, 오류 ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
