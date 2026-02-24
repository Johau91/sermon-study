#!/usr/bin/env node
/**
 * 설교 본문에 문단 구분(\n\n)을 삽입하는 배치 스크립트.
 * Claude CLI(`claude -p`)로 문단 구분만 삽입하고, 텍스트 자체는 변경하지 않음.
 * 청크/임베딩 보존을 위해 patchTranscriptText 뮤테이션 사용.
 *
 * Usage:
 *   node scripts/paragraph-split.mjs --dry-run          # preview changes
 *   node scripts/paragraph-split.mjs --apply             # apply to Convex
 *   node scripts/paragraph-split.mjs --dry-run --limit=3 # test on 3 sermons
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
  console.error("Usage: node scripts/paragraph-split.mjs [--dry-run | --apply]");
  console.error("  --dry-run        Preview paragraph splits (no writes)");
  console.error("  --apply          Apply changes to Convex");
  console.error("  --limit=N        Only process N sermons");
  console.error("  --concurrency=N  Parallel LLM calls (default 3)");
  console.error("  --verbose        Show detailed output");
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

/* ── LLM call via Claude CLI ──────────────────────────────── */
const PROMPT_TEMPLATE = (text) => `이 설교 텍스트에 문단 구분(\\n\\n)만 삽입하세요.

규칙:
- 원문 텍스트를 절대 수정하지 마세요 (오타, 문법, 단어 변경 금지)
- 의미/주제가 전환되는 지점에서 문단을 나누세요
- 성경 구절 인용이 시작될 때 문단을 나누세요
- 청중에게 새로 말을 걸 때(여러분, 성도 여러분) 문단을 나누세요
- 한 문단은 3~8문장 정도가 적당합니다
- 문단 구분(\\n\\n) 삽입만 하고, 그 외 어떤 변경도 하지 마세요
- 마크다운, 설명, 주석 없이 결과 텍스트만 출력하세요

===
${text}
===`;

let tmpCounter = 0;

async function splitWithLLM(text) {
  const prompt = PROMPT_TEMPLATE(text);
  const tmpFile = path.join(os.tmpdir(), `para-split-${process.pid}-${tmpCounter++}.txt`);

  try {
    // Write prompt to temp file to avoid ARG_MAX limits
    fs.writeFileSync(tmpFile, prompt, "utf-8");

    const env = { ...process.env };
    delete env.CLAUDECODE;

    return await new Promise((resolve) => {
      const child = spawn("sh", ["-c", `cat "${tmpFile}" | claude -p --model haiku`], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => { stdout += d; });
      child.stderr.on("data", (d) => { stderr += d; });

      const timer = setTimeout(() => {
        child.kill();
        console.error(`\n  ⚠ LLM timeout`);
        resolve(null);
      }, 120000);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          console.error(`\n  ⚠ LLM error (code ${code}): ${stderr.slice(0, 200)}`);
          resolve(null);
          return;
        }
        resolve(stdout.trim() || null);
      });
    });
  } catch (err) {
    console.error(`\n  ⚠ LLM error: ${String(err.message).slice(0, 200)}`);
    return null;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

/* ── Fetch sermons via Convex HTTP API ────────────────────── */
async function fetchSermonsPage(cursor) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "transcriptCleanupHelpers:getAllSermonsPagePublic",
      args: { numItems: 100, cursor },
    }),
  });
  if (!res.ok) throw new Error(`Convex query failed: ${res.status}`);
  const data = await res.json();
  if (data.status === "error") throw new Error(`Convex error: ${JSON.stringify(data)}`);
  return data.value;
}

async function fetchAllSermons() {
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

/* ── Validation: ensure LLM didn't alter text ────────────── */
function stripParagraphBreaks(text) {
  return text.replace(/\n\n/g, " ").replace(/\s+/g, " ").trim();
}

function validateResult(original, result) {
  const origNorm = stripParagraphBreaks(original);
  const resultNorm = stripParagraphBreaks(result);
  return origNorm === resultNorm;
}

/* ── Process a single sermon ─────────────────────────────── */
async function processSermon(sermon) {
  const text = sermon.transcriptCorrected ?? sermon.transcriptRaw;
  if (!text) return { id: sermon._id, changed: false, skipped: true, reason: "no text" };

  // Skip if already has paragraph breaks
  if (text.includes("\n\n")) {
    return { id: sermon._id, changed: false, skipped: true, reason: "already split" };
  }

  const result = await splitWithLLM(text);
  if (!result) {
    return { id: sermon._id, changed: false, error: true };
  }

  // Validate: LLM should only have inserted \n\n, nothing else
  if (!validateResult(text, result)) {
    console.error(`\n  ⚠ [${sermon.originalId}] ${sermon.title} — LLM altered text, skipping`);
    if (VERBOSE) {
      const origNorm = stripParagraphBreaks(text);
      const resultNorm = stripParagraphBreaks(result);
      // Show first difference
      for (let i = 0; i < Math.min(origNorm.length, resultNorm.length); i++) {
        if (origNorm[i] !== resultNorm[i]) {
          console.error(`    First diff at char ${i}:`);
          console.error(`    orig:   ...${origNorm.slice(Math.max(0, i - 20), i + 20)}...`);
          console.error(`    result: ...${resultNorm.slice(Math.max(0, i - 20), i + 20)}...`);
          break;
        }
      }
    }
    return { id: sermon._id, changed: false, error: true, reason: "text altered" };
  }

  const changed = result !== text;

  if (changed && DRY_RUN) {
    const paragraphs = result.split("\n\n").length;
    console.log(`\n  [${sermon.originalId}] ${sermon.title} — ${paragraphs} paragraphs`);
    if (VERBOSE) {
      // Show first 3 paragraphs
      const paras = result.split("\n\n");
      for (const p of paras.slice(0, 3)) {
        console.log(`    ¶ ${p.slice(0, 80)}...`);
      }
    }
  }

  if (changed && APPLY) {
    await convexMutation("sermons:patchTranscriptText", {
      id: sermon._id,
      text: result,
    });
    const paragraphs = result.split("\n\n").length;
    console.log(`\n  [${sermon.originalId}] ${sermon.title} — ${paragraphs} paragraphs, applied`);
  }

  return { id: sermon._id, changed };
}

/* ── Main ─────────────────────────────────────────────────── */
async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log(" 설교 본문 문단 구분 삽입");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  if (LIMIT) console.log(`  Limit: ${LIMIT}`);
  console.log("──────────────────────────────────────────────────\n");

  const allSermons = await fetchAllSermons();

  // Filter: skip those already with paragraph breaks
  const candidates = allSermons.filter((s) => {
    const text = s.transcriptCorrected ?? s.transcriptRaw;
    return text && !text.includes("\n\n");
  });

  console.log(`\nSermons needing paragraph splits: ${candidates.length} / ${allSermons.length}\n`);

  const sermons = LIMIT ? candidates.slice(0, LIMIT) : candidates;
  if (sermons.length === 0) {
    console.log("No sermons need paragraph splitting.");
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
