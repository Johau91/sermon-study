import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "sermons.db");
const REPORT_MD = path.join(process.cwd(), "reports", "context-audit-full.md");
const REPORT_CSV = path.join(process.cwd(), "reports", "context-audit-full.csv");
const REPORT_SUMMARY_CSV = path.join(
  process.cwd(),
  "reports",
  "context-audit-sermon-summary.csv"
);

const db = new Database(DB_PATH, { readonly: true });

const TARGET_TERMS = [
  "중구 등부",
  "주여 삼하",
  "삼하 기도하시겠습니다",
  "주여 주야",
  "예수안 믿는",
  "아멘 기왕",
  "속지 주세요",
  "주님 문혜",
  "주님 은로",
  "최삼식",
  "귀신 승비",
  "우상 앞에 전하였",
  "애저렇게",
  "대절한 마음",
  "보람에게 도와",
  "수가 성도들은",
  "귀 하나님만이",
  "천대 이로 복",
];

const SENTENCE_SPLIT = /(?<=[.!?]|다\.|요\.|니다\.)\s+|\n+/g;
const SINGLE_FILLER = /^(아|어|오|우|으|에|예|야|요)$/;
const SINGLE_KO = /^[가-힣]$/;
const MIN_SCORE = 8;

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function splitSentences(text) {
  return String(text || "")
    .split(SENTENCE_SPLIT)
    .map((s) => s.replace(/\\s+/g, " ").trim())
    .filter(Boolean);
}

function scoreSentence(sentence) {
  let score = 0;
  const reasons = [];

  const words = sentence.split(/\s+/).filter(Boolean);
  const latinToken = /[A-Za-z]{2,}/.test(sentence);
  if (latinToken) {
    score += 2;
    reasons.push("latin_token");
  }

  if (/(.)\1{4,}/.test(sentence)) {
    score += 2;
    reasons.push("char_run");
  }

  if (/\b([가-힣])(?:\s+\1){3,}\b/.test(sentence)) {
    score += 2;
    reasons.push("repeated_single_syllable");
  }

  if (/\b([A-Za-z])(?:\s+\1){3,}\b/i.test(sentence)) {
    score += 2;
    reasons.push("repeated_single_latin");
  }

  if (/\b(\S{1,8})(?:\s+\1){2,}\b/.test(sentence)) {
    score += 2;
    reasons.push("duplicate_token");
  }

  const fillerCount = words.filter((w) => SINGLE_FILLER.test(w)).length;
  if (fillerCount >= 8) {
    score += 2;
    reasons.push("filler_burst");
  }

  const singleKoCount = words.filter((w) => SINGLE_KO.test(w)).length;
  if (singleKoCount >= 12) {
    score += 2;
    reasons.push("single_syllable_burst");
  }

  const nonKo = (sentence.match(/[^가-힣\s\d.,!?'"()\-]/g) || []).length;
  const ratio = sentence.length ? nonKo / sentence.length : 0;
  if (ratio > 0.22) {
    score += 2;
    reasons.push("non_hangul_ratio");
  }

  for (const t of TARGET_TERMS) {
    if (sentence.includes(t)) {
      score += 2;
      reasons.push(`term:${t}`);
    }
  }

  return { score, reasons };
}

function main() {
  const sermons = db
    .prepare("SELECT id, title, transcript_raw FROM sermons ORDER BY id ASC")
    .all();

  const findings = [];

  for (const sermon of sermons) {
    const text = String(sermon.transcript_raw || "");
    if (!text.trim()) continue;

    const sentences = splitSentences(text);
    for (let i = 0; i < sentences.length; i += 1) {
      const sentence = sentences[i];
      const { score, reasons } = scoreSentence(sentence);
      if (score < MIN_SCORE) continue;
      findings.push({
        sermon_id: sermon.id,
        title: sermon.title,
        sentence_index: i + 1,
        score,
        reasons: reasons.join("|"),
        sentence,
      });
    }
  }

  findings.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.sermon_id !== b.sermon_id) return a.sermon_id - b.sermon_id;
    return a.sentence_index - b.sentence_index;
  });

  const bySermon = new Map();
  for (const f of findings) {
    bySermon.set(f.sermon_id, (bySermon.get(f.sermon_id) || 0) + 1);
  }

  const topSermons = [...bySermon.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 100);

  const sermonTitleById = new Map(
    sermons.map((s) => [Number(s.id), String(s.title || "")])
  );

  const md = [];
  md.push("# Full Context Audit (All Sermons)");
  md.push("");
  md.push(`- Generated: ${new Date().toISOString()}`);
  md.push(`- Sermons scanned: ${sermons.length}`);
  md.push(`- Findings (score>=${MIN_SCORE}): ${findings.length}`);
  md.push(`- Sermons with findings: ${bySermon.size}`);
  md.push("");
  md.push("## Top Sermons By Finding Count");
  md.push("");
  for (const [sermonId, count] of topSermons) {
    md.push(`- [${sermonId}] ${sermonTitleById.get(sermonId)} (${count})`);
  }
  md.push("");
  md.push("## Top Findings (max 500)");
  md.push("");
  for (const f of findings.slice(0, 500)) {
    md.push(`- [${f.sermon_id}] score=${f.score} reasons=${f.reasons}`);
    md.push(`  - ${f.title}`);
    md.push(`  - ${f.sentence}`);
  }
  md.push("");

  fs.writeFileSync(REPORT_MD, `${md.join("\n")}\n`, "utf8");

  const csvLines = [
    ["sermon_id", "title", "sentence_index", "score", "reasons", "sentence"]
      .map(csvEscape)
      .join(","),
  ];
  for (const f of findings) {
    csvLines.push(
      [
        f.sermon_id,
        f.title,
        f.sentence_index,
        f.score,
        f.reasons,
        f.sentence,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  fs.writeFileSync(REPORT_CSV, `${csvLines.join("\n")}\n`, "utf8");

  const summaryLines = [["sermon_id", "title", "finding_count"].join(",")];
  for (const [sermonId, count] of [...bySermon.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0]
  )) {
    summaryLines.push(
      [sermonId, sermonTitleById.get(sermonId), count].map(csvEscape).join(",")
    );
  }
  fs.writeFileSync(REPORT_SUMMARY_CSV, `${summaryLines.join("\n")}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        sermonsScanned: sermons.length,
        findings: findings.length,
        sermonsWithFindings: bySermon.size,
      },
      null,
      2
    )
  );
}

main();
