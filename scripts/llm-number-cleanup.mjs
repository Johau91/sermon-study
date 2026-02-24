#!/usr/bin/env node
/**
 * Phase 2: LLM-based cleanup of stray ASR digit artifacts.
 *
 * Fetches sermons from Convex, filters those still containing suspicious
 * digit patterns, sends context windows to an LLM for judgement, and
 * optionally applies fixes via the updateTranscript mutation.
 *
 * Usage:
 *   node scripts/llm-number-cleanup.mjs --dry-run          # preview changes
 *   node scripts/llm-number-cleanup.mjs --apply             # apply to Convex
 *   node scripts/llm-number-cleanup.mjs --dry-run --limit=5 # test on 5 sermons
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

/* ── CLI args ─────────────────────────────────────────────── */
const DRY_RUN = process.argv.includes("--dry-run");
const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");
const LIMIT = parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || "0",
  10
);
const CONCURRENCY = parseInt(
  process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] || "3",
  10
);

if (!DRY_RUN && !APPLY) {
  console.error("Usage: node scripts/llm-number-cleanup.mjs [--dry-run | --apply]");
  console.error("  --dry-run     Preview what would change (no writes)");
  console.error("  --apply       Apply changes to Convex");
  console.error("  --limit=N     Only process N sermons");
  console.error("  --concurrency=N  Parallel LLM calls (default 3)");
  console.error("  --verbose     Show detailed output");
  process.exit(1);
}

/* ── Convex HTTP API helpers ──────────────────────────────── */
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  console.error("NEXT_PUBLIC_CONVEX_URL not set. Check .env.local");
  process.exit(1);
}

async function convexMutation(functionPath, args = {}) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: functionPath, args }),
  });
  if (!res.ok) throw new Error(`Convex mutation ${functionPath} failed: ${res.status}`);
  const data = await res.json();
  if (data.status === "error") throw new Error(`Convex error: ${JSON.stringify(data)}`);
  return data.value;
}

/* ── Digit detection ──────────────────────────────────────── */
// Detects digits between Korean characters that are likely ASR artifacts.
// Excludes: scripture refs (장/절/:), dates (년/월/일), counters (개/명/번 etc.)
const UNIT_CHARS = "년월일시분초장절번째차개명원만억배세살편과가지조호주단쪽권대종부위기층회학";
const SUSPICIOUS_DIGIT_RE = new RegExp(
  `(?<=[가-힣])\\s+\\d{1,3}(?=\\s+(?![${UNIT_CHARS}])[가-힣])`,
  "g"
);

function hasSuspiciousDigits(text) {
  return SUSPICIOUS_DIGIT_RE.test(text);
}

function extractDigitContexts(text) {
  const contexts = [];
  const re = new RegExp(
    `(?<=[가-힣])\\s+\\d{1,3}(?=\\s+(?![${UNIT_CHARS}])[가-힣])`,
    "g"
  );
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = Math.max(0, m.index - 30);
    const end = Math.min(text.length, m.index + m[0].length + 30);
    contexts.push({
      match: m[0].trim(),
      context: text.slice(start, end),
      position: m.index,
    });
  }
  return contexts;
}

/* ── LLM call via Claude CLI ──────────────────────────────── */
let tmpCounter = 0;

const PROMPT_TEMPLATE = (text) => `당신은 한국어 설교 음성인식(ASR) 텍스트 교정 전문가입니다.

아래 텍스트에서 ASR 오류로 삽입된 의미 없는 숫자를 제거하세요.

규칙:
- 한글 단어 사이에 갑자기 나타나는 1-3자리 숫자는 ASR이 한국어 음절을 숫자로 오인식한 것
- 예: "귀 10 역사는" → "귀 역사는", "4 왜 우리가" → "왜 우리가"
- 반드시 보존해야 할 숫자:
  * 성경 구절 번호 (예: "요한복음 3장 16절", "마태 5:3")
  * 날짜/시간 (예: "2024년", "3월 15일")
  * 실제 수량/카운터 (예: "12제자", "5000명", "3번째")
  * 나이 (예: "30세")
  * 순서/번호 (예: "제1과", "2부")
- 숫자를 제거할 때 불필요한 공백도 함께 정리
- 숫자 제거 외에는 원문을 절대 수정하지 마세요 (오타, 문법, 문장구조 등)
- 교정된 전체 텍스트만 출력하세요. 설명, 주석, 마크다운 서식 절대 금지

===
${text}
===`;

async function correctWithLLM(text) {
  const promptFile = path.join(os.tmpdir(), `number-cleanup-${process.pid}-${tmpCounter++}.txt`);
  const outputFile = promptFile.replace(".txt", "-out.txt");
  try {
    const prompt = PROMPT_TEMPLATE(text);
    fs.writeFileSync(promptFile, prompt, "utf-8");
    await execFileAsync(
      "claude",
      [
        "-p", prompt,
        "--output-file", outputFile,
        "--model", "haiku",
      ],
      { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
    );
    const result = fs.readFileSync(outputFile, "utf-8").trim();
    return result || null;
  } catch (err) {
    const msg = err.stderr || err.message || "unknown error";
    console.error(`\n  ⚠ LLM error: ${String(msg).slice(0, 200)}`);
    return null;
  } finally {
    try { fs.unlinkSync(promptFile); } catch {}
    try { fs.unlinkSync(outputFile); } catch {}
  }
}

/* ── Fetch sermons via npx convex run ─────────────────────── */
async function fetchSermonsPage(cursor) {
  const args = JSON.stringify({ numItems: 100, cursor });
  const { stdout } = await execFileAsync(
    "npx",
    ["convex", "run", "--no-push", "transcriptCleanupHelpers:getAllSermonsPage", args],
    { timeout: 30000, maxBuffer: 50 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

async function fetchAllSermonsViaCli() {
  console.log("Fetching sermons from Convex...");
  const allSermons = [];
  let cursor = null;
  let isDone = false;
  let pageNum = 0;

  while (!isDone) {
    pageNum++;
    const page = await fetchSermonsPage(cursor);
    allSermons.push(...page.sermons);
    cursor = page.continueCursor;
    isDone = page.isDone;
    process.stdout.write(`\r  Page ${pageNum}: ${allSermons.length} sermons loaded`);
  }
  console.log(`\n  Total: ${allSermons.length} sermons`);
  return allSermons;
}

/* ── Process a single sermon ─────────────────────────────── */
async function processSermon(sermon) {
  const text = sermon.transcriptCorrected ?? sermon.transcriptRaw;

  if (!hasSuspiciousDigits(text)) {
    return { id: sermon._id, changed: false, skipped: true };
  }

  const contexts = extractDigitContexts(text);
  if (VERBOSE) {
    console.log(`\n  [${sermon.originalId}] ${sermon.title}`);
    console.log(`    ${contexts.length} suspicious digits found:`);
    for (const c of contexts.slice(0, 5)) {
      console.log(`    ...${c.context}...`);
    }
  }

  const corrected = await correctWithLLM(text);
  if (!corrected) {
    return { id: sermon._id, changed: false, error: true };
  }

  const changed = corrected !== text;

  if (changed && DRY_RUN) {
    // Show diff preview
    console.log(`\n  [${sermon.originalId}] ${sermon.title} — ${contexts.length} digits`);
    // Show before/after for first few changes
    const lines1 = text.split("\n");
    const lines2 = corrected.split("\n");
    let shown = 0;
    for (let i = 0; i < Math.max(lines1.length, lines2.length) && shown < 3; i++) {
      if ((lines1[i] || "") !== (lines2[i] || "")) {
        console.log(`    - ${(lines1[i] || "").slice(0, 80)}`);
        console.log(`    + ${(lines2[i] || "").slice(0, 80)}`);
        shown++;
      }
    }
  }

  if (changed && APPLY) {
    await convexMutation("sermons:updateTranscript", {
      id: sermon._id,
      transcript: corrected,
    });
    console.log(`  [${sermon.originalId}] ${sermon.title} — applied`);
  }

  return { id: sermon._id, changed };
}

/* ── Main ─────────────────────────────────────────────────── */
async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log(" Phase 2: LLM 숫자 아티팩트 제거");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  if (LIMIT) console.log(`  Limit: ${LIMIT}`);
  console.log("──────────────────────────────────────────────────\n");

  const allSermons = await fetchAllSermonsViaCli();

  // Filter to those with suspicious digits
  const candidates = allSermons.filter((s) => {
    const text = s.transcriptCorrected ?? s.transcriptRaw;
    return hasSuspiciousDigits(text);
  });

  console.log(`\nSermons with suspicious digits: ${candidates.length}\n`);

  const sermons = LIMIT ? candidates.slice(0, LIMIT) : candidates;
  if (sermons.length === 0) {
    console.log("No sermons need LLM cleanup.");
    return;
  }

  let processed = 0, changed = 0, errors = 0;
  const startTime = Date.now();

  // Process in batches of CONCURRENCY
  for (let i = 0; i < sermons.length; i += CONCURRENCY) {
    const batch = sermons.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((s) => processSermon(s)));

    for (const r of results) {
      processed++;
      const val = r.status === "fulfilled" ? r.value : { changed: false, error: true };
      if (val.changed) changed++;
      if (val.error) errors++;
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const remaining = (sermons.length - processed) / rate;
    const pct = ((processed / sermons.length) * 100).toFixed(1);

    process.stdout.write(
      `\r  [${processed}/${sermons.length}] ${pct}% | ` +
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
