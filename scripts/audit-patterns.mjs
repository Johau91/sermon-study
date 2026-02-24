/**
 * Audit: check every pattern hit in a broad sample for false positives.
 * Shows each match with surrounding context so we can spot bad corrections.
 * Usage: node scripts/audit-patterns.mjs
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const src = readFileSync("convex/lib/asrPatterns.ts", "utf8");
const patternRegex = /\[\/(.+?)\/([gimusy]*),\s*"((?:[^"\\]|\\.)*)"\]/g;
const ASR_CORRECTIONS = [];
let m;
while ((m = patternRegex.exec(src)) !== null) {
  try {
    ASR_CORRECTIONS.push([new RegExp(m[1], m[2]), m[3], m[1]]);
  } catch {}
}

// Risky patterns to audit — short words, common words, ambiguous
const RISKY_SOURCES = [
  "일법",        // 일법 is uncommon but could appear in other contexts?
  "가늠하지",    // 가늠하지 = "gauge" — could be valid
  "신생활",      // 신생활 = "new life" — valid word
  "신학생활",    // 신학생활 = "seminary life" — valid word!
  "염령",        // rare
  "총만",        // 총만 could be a name?
  "낭막",        // rare
  "죽님",        // rare
  "강간하게",    // 강간 = "rape" — could be valid in certain sermons
  "강간함",      // same
  "예배요",      // 예배요 = "it's worship" — very common phrase!
  "주 주님",     // "주 주님" could be intentional emphasis
  "(?<![가-힣])송도",  // 송도 = place name (Songdo)
  "주여 주야",   // 주야 = "day and night" — "주여 주야" could be valid
  "윤석 전",     // could be valid in other contexts
  "수역에서",    // 수역 = "waters/area" — valid word!
  "치력을",      // 치력 could be valid?
  "주의 선자",   // 선자 = "prophet" — "주의 선자" could be correct!
  "신민지",      // could be a person's name
  "열약하여",    // 열약 could appear in other contexts?
];

function getSermon(originalId) {
  const tmpFile = join(tmpdir(), `audit-${originalId}.json`);
  try {
    execSync(
      `npx convex run sermons:getByOriginalId '{"originalId": ${originalId}}' 2>/dev/null > "${tmpFile}"`,
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    );
    return JSON.parse(readFileSync(tmpFile, "utf8"));
  } catch { return null; }
  finally { try { unlinkSync(tmpFile); } catch {} }
}

// Sample every 25th sermon
const ids = [];
for (let i = 25; i <= 3875; i += 25) ids.push(i);

console.log(`Auditing ${RISKY_SOURCES.length} risky patterns across ${ids.length} sermons...\n`);

// Collect all hits: pattern → [{id, context, before, after}]
const hits = new Map();

for (const id of ids) {
  const sermon = getSermon(id);
  if (!sermon?.transcriptRaw) continue;

  // Use RAW text so we see what the pattern would match on original input
  const raw = sermon.transcriptRaw;

  for (const [regex, replacement, source] of ASR_CORRECTIONS) {
    if (!RISKY_SOURCES.includes(source)) continue;

    const re = new RegExp(regex.source, regex.flags);
    const globalRe = new RegExp(`(.{0,20})(${regex.source})(.{0,20})`, "g");
    let match;
    while ((match = globalRe.exec(raw)) !== null) {
      const key = source;
      if (!hits.has(key)) hits.set(key, { replacement, matches: [] });
      const entry = hits.get(key);
      if (entry.matches.length < 8) {
        const before = match[0];
        const after = before.replace(new RegExp(regex.source), replacement);
        entry.matches.push({ id, before, after });
      }
    }
  }
}

console.log(`${"=".repeat(75)}`);
console.log(`  위험 패턴 감사 결과`);
console.log(`${"=".repeat(75)}\n`);

const sortedKeys = [...hits.keys()].sort((a, b) => hits.get(b).matches.length - hits.get(a).matches.length);

for (const key of sortedKeys) {
  const { replacement, matches } = hits.get(key);
  console.log(`  /${key}/ → "${replacement}"  (${matches.length}건+ 발견)`);
  for (const m of matches) {
    const flagged = m.before !== m.after ? "" : " [NO CHANGE]";
    console.log(`    [${m.id}] "${m.before}"`);
    console.log(`         → "${m.after}"${flagged}`);
  }
  console.log();
}

if (hits.size === 0) {
  console.log("  (위험 패턴 히트 없음)\n");
}

// Also check patterns NOT in risky list that have high hit counts
console.log(`${"─".repeat(75)}`);
console.log(`  히트 없는 위험 패턴 (샘플에서 미발견):`);
for (const src of RISKY_SOURCES) {
  if (!hits.has(src)) console.log(`    /${src}/`);
}
console.log();
