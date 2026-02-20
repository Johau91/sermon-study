import path from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

/* ── CLI args ─────────────────────────────────────────────── */
const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");
const SERMON_ID = Number(
  process.argv.find((a) => a.startsWith("--sermon="))?.split("=")[1] || "0"
);

/* ── Database ─────────────────────────────────────────────── */
const DB_PATH = path.join(process.cwd(), "data", "sermons.db");
const db = new Database(DB_PATH);
sqliteVec.load(db);

/* ── Book aliases (mirrors src/lib/bible.ts) ─────────────── */
const BOOK_ALIASES = {
  창세기: "창세기", 출애굽기: "출애굽기", 레위기: "레위기", 민수기: "민수기", 신명기: "신명기",
  여호수아: "여호수아", 사사기: "사사기", 룻기: "룻기", 사무엘상: "사무엘상", 사무엘하: "사무엘하",
  열왕기상: "열왕기상", 열왕기하: "열왕기하", 역대상: "역대상", 역대하: "역대하",
  에스라: "에스라", 느헤미야: "느헤미야", 에스더: "에스더", 욥기: "욥기",
  시편: "시편", 잠언: "잠언", 전도서: "전도서", 아가: "아가",
  이사야: "이사야", 예레미야: "예레미야", 예레미야애가: "예레미야애가", 에스겔: "에스겔",
  다니엘: "다니엘", 호세아: "호세아", 요엘: "요엘", 아모스: "아모스",
  오바댜: "오바댜", 요나: "요나", 미가: "미가", 나훔: "나훔",
  하박국: "하박국", 스바냐: "스바냐", 학개: "학개", 스가랴: "스가랴", 말라기: "말라기",
  마태복음: "마태복음", 마가복음: "마가복음", 누가복음: "누가복음", 요한복음: "요한복음",
  사도행전: "사도행전", 로마서: "로마서", 고린도전서: "고린도전서", 고린도후서: "고린도후서",
  갈라디아서: "갈라디아서", 에베소서: "에베소서", 빌립보서: "빌립보서", 골로새서: "골로새서",
  데살로니가전서: "데살로니가전서", 데살로니가후서: "데살로니가후서",
  디모데전서: "디모데전서", 디모데후서: "디모데후서", 디도서: "디도서", 빌레몬서: "빌레몬서",
  히브리서: "히브리서", 야고보서: "야고보서", 베드로전서: "베드로전서", 베드로후서: "베드로후서",
  요한일서: "요한일서", 요한이서: "요한이서", 요한삼서: "요한삼서", 유다서: "유다서",
  요한계시록: "요한계시록",
  // Abbreviations
  창: "창세기", 출: "출애굽기", 레: "레위기", 민: "민수기", 신: "신명기",
  수: "여호수아", 삿: "사사기", 룻: "룻기", 삼상: "사무엘상", 삼하: "사무엘하",
  왕상: "열왕기상", 왕하: "열왕기하", 대상: "역대상", 대하: "역대하",
  스: "에스라", 느: "느헤미야", 에: "에스더", 욥: "욥기",
  시: "시편", 잠: "잠언", 전: "전도서",
  사: "이사야", 렘: "예레미야", 겔: "에스겔", 단: "다니엘",
  호: "호세아", 암: "아모스", 욘: "요나", 미: "미가",
  합: "하박국", 습: "스바냐", 학: "학개", 슥: "스가랴", 말: "말라기",
  마: "마태복음", 막: "마가복음", 눅: "누가복음", 요: "요한복음",
  행: "사도행전", 롬: "로마서",
  고전: "고린도전서", 고후: "고린도후서", 갈: "갈라디아서",
  엡: "에베소서", 빌: "빌립보서", 골: "골로새서",
  살전: "데살로니가전서", 살후: "데살로니가후서",
  딤전: "디모데전서", 딤후: "디모데후서", 딛: "디도서", 몬: "빌레몬서",
  히: "히브리서", 약: "야고보서",
  벧전: "베드로전서", 벧후: "베드로후서",
  요일: "요한일서", 요이: "요한이서", 요삼: "요한삼서",
  유: "유다서", 계: "요한계시록",
};

function normalizeBookName(input) {
  return BOOK_ALIASES[input.replace(/\s+/g, "").trim()] || null;
}

/* ── ASR correction patterns ─────────────────────────────── */
const ASR_CORRECTIONS = [
  // Sacred terms frequently split by ASR
  [/하나\s*님/g, "하나님"],
  [/예수\s*님/g, "예수님"],
  [/주\s*님/g, "주님"],
  [/그리스\s*도/g, "그리스도"],
  [/성\s*령/g, "성령"],

  // Common worship/theology terms
  [/예배요/g, "옛 뱀이요"],
  [/예베소서/g, "에베소서"],
  [/윤석전목사/g, "윤석전 목사"],

  // Scripture notation normalization
  [/(\d+)\s*장\s*(\d+)\s*절/g, "$1장 $2절"],
  [/(\d+)\s*:\s*(\d+)/g, "$1:$2"],

  // Book name expansions (abbreviated → full)
  [/\b고전\s*(\d+)/g, "고린도전서 $1"],
  [/\b고후\s*(\d+)/g, "고린도후서 $1"],
  [/\b살전\s*(\d+)/g, "데살로니가전서 $1"],
  [/\b살후\s*(\d+)/g, "데살로니가후서 $1"],
  [/\b딤전\s*(\d+)/g, "디모데전서 $1"],
  [/\b딤후\s*(\d+)/g, "디모데후서 $1"],
  [/\b벧전\s*(\d+)/g, "베드로전서 $1"],
  [/\b벧후\s*(\d+)/g, "베드로후서 $1"],
  [/\b요일\s*(\d+)/g, "요한일서 $1"],
  [/\b요이\s*(\d+)/g, "요한이서 $1"],
  [/\b요삼\s*(\d+)/g, "요한삼서 $1"],

  // Whitespace cleanup (must be last)
  [/\s+/g, " "],
];

function applyAsrCorrections(text) {
  let out = String(text || "");
  for (const [pattern, repl] of ASR_CORRECTIONS) {
    out = out.replace(pattern, repl);
  }
  return out.trim();
}

/* ── Bible reference extraction (with text positions) ────── */
// Matches patterns like: 요한복음 3:16, 로마서 8장 28절, 롬 3:1-5, 에베소서 4:17-24
const REF_PATTERN = /([가-힣]{1,10})\s*(\d{1,3})\s*(?::|장\s*)\s*(\d{1,3})(?:\s*[-~]\s*(\d{1,3}))?\s*(?:절)?/g;

function extractRefsWithPositions(text) {
  const refs = [];
  let m;
  REF_PATTERN.lastIndex = 0;
  while ((m = REF_PATTERN.exec(text)) !== null) {
    const bookRaw = m[1];
    const book = normalizeBookName(bookRaw);
    if (!book) continue;
    refs.push({
      book,
      chapter: Number(m[2]),
      verseStart: Number(m[3]),
      verseEnd: Number(m[4] || m[3]),
      matchStart: m.index,
      matchEnd: m.index + m[0].length,
      rawMatch: m[0],
    });
  }
  return refs;
}

/* ── Fetch Bible text from DB ────────────────────────────── */
const stmtBibleVerses = db.prepare(`
  SELECT verse, text FROM bible_verses
  WHERE translation = '개역한글' AND book = ? AND chapter = ? AND verse BETWEEN ? AND ?
  ORDER BY verse ASC
`);

function getBibleText(ref) {
  const rows = stmtBibleVerses.all(ref.book, ref.chapter, ref.verseStart, ref.verseEnd);
  if (rows.length === 0) return null;
  return rows.map((r) => r.text).join(" ");
}

/* ── Similarity check ────────────────────────────────────── */
function jamoSimilarity(a, b) {
  // Simple character-level similarity (Jaccard on bigrams)
  if (!a || !b) return 0;
  const bigramsOf = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s[i] + s[i + 1]);
    return set;
  };
  const setA = bigramsOf(a);
  const setB = bigramsOf(b);
  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

const SIMILARITY_THRESHOLD = 0.7; // Already close enough → skip replacement

/* ── Transition phrases and end markers ──────────────────── */
// After a Bible reference, the pastor typically says one of these before reading
const TRANSITION_PHRASES = [
  "봉독합니다", "봉독하겠습니다", "말씀을 봉독합니다",
  "시작", "시작합니다", "보겠습니다", "읽겠습니다",
  "말씀입니다", "라고 했습니다", "기록하기를",
];

// End markers for where the Bible reading section likely ends
const END_MARKERS = [
  "아멘", "할렐루야",
  "오늘 말씀", "오늘의 말씀", "이 말씀은", "이 말씀을", "이 본문은",
  "여기서", "자 이제", "사랑하는 성도",
  "말씀을 나누", "말씀 나누", "함께 은혜를",
  "설교 말씀", "설교의 제목",
];

/* ── Core: replace ASR-garbled Bible reading sections ────── */
function replaceBibleReadings(text) {
  const refs = extractRefsWithPositions(text);
  if (refs.length === 0) return { text, replacements: [] };

  const replacements = [];
  let result = text;
  let offset = 0; // Track index shifts from replacements

  for (const ref of refs) {
    const bibleText = getBibleText(ref);
    if (!bibleText) continue;

    const refEnd = ref.matchEnd + offset;

    // Find transition phrase after the reference
    const afterRef = result.slice(refEnd, refEnd + 200);
    let readingStart = -1;

    for (const phrase of TRANSITION_PHRASES) {
      const idx = afterRef.indexOf(phrase);
      if (idx !== -1) {
        readingStart = refEnd + idx + phrase.length;
        break;
      }
    }

    // If no transition phrase found, look for period/comma right after
    if (readingStart === -1) {
      const dotMatch = afterRef.match(/^[.\s,]{0,5}/);
      if (dotMatch) readingStart = refEnd + dotMatch[0].length;
      else continue;
    }

    // Skip whitespace/punctuation after transition
    while (readingStart < result.length && /[\s.,]/.test(result[readingStart])) {
      readingStart++;
    }

    // Find end of Bible reading section
    const searchArea = result.slice(readingStart, readingStart + bibleText.length * 3);
    let readingEnd = readingStart + Math.min(searchArea.length, bibleText.length * 2);

    for (const marker of END_MARKERS) {
      const idx = searchArea.indexOf(marker);
      if (idx !== -1 && idx > bibleText.length * 0.3) {
        readingEnd = readingStart + idx;
        break;
      }
    }

    // Also check for next Bible reference as end boundary
    for (let i = refs.indexOf(ref) + 1; i < refs.length; i++) {
      const nextRefStart = refs[i].matchStart + offset;
      if (nextRefStart > readingStart && nextRefStart < readingEnd) {
        // Look back from next ref for a natural break
        const beforeNext = result.slice(readingStart, nextRefStart);
        const lastPeriod = Math.max(
          beforeNext.lastIndexOf(". "),
          beforeNext.lastIndexOf("다. "),
          beforeNext.lastIndexOf("라. ")
        );
        if (lastPeriod > 0) {
          readingEnd = readingStart + lastPeriod + 2;
        } else {
          readingEnd = nextRefStart;
        }
        break;
      }
    }

    // Extract the ASR text in this region
    const asrText = result.slice(readingStart, readingEnd).trim();

    // Check similarity — if already accurate, skip
    const similarity = jamoSimilarity(asrText, bibleText);
    if (similarity >= SIMILARITY_THRESHOLD) {
      if (VERBOSE) {
        console.log(`  SKIP (similarity=${similarity.toFixed(2)}): ${ref.rawMatch}`);
      }
      continue;
    }

    // Do the replacement
    const before = result.slice(0, readingStart);
    const after = result.slice(readingEnd);
    const newText = before + bibleText + after;
    const lengthDiff = bibleText.length - (readingEnd - readingStart);
    offset += lengthDiff;
    result = newText;

    replacements.push({
      ref: `${ref.book} ${ref.chapter}:${ref.verseStart}${ref.verseEnd !== ref.verseStart ? `-${ref.verseEnd}` : ""}`,
      similarity: similarity.toFixed(2),
      asrLength: asrText.length,
      bibleLength: bibleText.length,
    });
  }

  return { text: result, replacements };
}

/* ── Chunking (same logic as direct-correct-transcripts.mjs) */
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

/* ── FTS triggers ────────────────────────────────────────── */
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

/* ── Main ────────────────────────────────────────────────── */
function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  if (SERMON_ID > 0) {
    console.log(`Target sermon: ${SERMON_ID}`);
  }
  console.log("");

  const sermons = SERMON_ID > 0
    ? db.prepare("SELECT id, title, transcript_raw FROM sermons WHERE id = ?").all(SERMON_ID)
    : db.prepare("SELECT id, title, transcript_raw FROM sermons ORDER BY id ASC").all();
  const selectChunkIds = db.prepare("SELECT id FROM chunks WHERE sermon_id = ? ORDER BY id");
  const deleteChunks = db.prepare("DELETE FROM chunks WHERE sermon_id = ?");
  const updateTranscript = db.prepare("UPDATE sermons SET transcript_raw = ? WHERE id = ?");
  const insertChunk = db.prepare("INSERT INTO chunks (sermon_id, chunk_index, content) VALUES (?, ?, ?)");

  let totalUpdated = 0;
  let totalReplacements = 0;

  if (!DRY_RUN) dropChunkTriggers();

  try {
    const process = () => {
      for (const sermon of sermons) {
        const raw = String(sermon.transcript_raw || "");
        if (!raw.trim() || raw.startsWith("[youtube]")) continue;

        // Step 1: ASR corrections
        const asrCorrected = applyAsrCorrections(raw);

        // Step 2: Bible reading replacements
        const { text: corrected, replacements } = replaceBibleReadings(asrCorrected);

        if (corrected === raw.trim() && replacements.length === 0) continue;

        const hasChanges = corrected !== raw.trim();

        if (replacements.length > 0 || hasChanges) {
          console.log(`[Sermon ${sermon.id}] ${sermon.title}`);
          if (replacements.length > 0) {
            for (const r of replacements) {
              console.log(`  REPLACE: ${r.ref} (similarity=${r.similarity}, asr=${r.asrLength}→bible=${r.bibleLength} chars)`);
            }
          }
          if (hasChanges && replacements.length === 0) {
            console.log("  ASR corrections applied (no Bible replacements)");
          }
          console.log("");
        }

        if (!DRY_RUN && hasChanges) {
          const oldChunkIds = selectChunkIds.all(sermon.id).map((r) => Number(r.id));
          if (oldChunkIds.length > 0) {
            const placeholders = oldChunkIds.map(() => "?").join(",");
            db.prepare(`DELETE FROM vec_chunks WHERE chunk_id IN (${placeholders})`).run(...oldChunkIds);
          }
          deleteChunks.run(sermon.id);
          updateTranscript.run(corrected, sermon.id);
          const chunks = chunkText(corrected);
          for (const c of chunks) insertChunk.run(sermon.id, c.index, c.content);
        }

        totalUpdated += hasChanges ? 1 : 0;
        totalReplacements += replacements.length;
      }
    };

    if (DRY_RUN) {
      process();
    } else {
      db.transaction(process)();
    }
  } finally {
    if (!DRY_RUN) rebuildFtsAndTriggers();
  }

  console.log("─".repeat(50));
  console.log(`Sermons scanned: ${sermons.length}`);
  console.log(`Sermons updated: ${totalUpdated}`);
  console.log(`Bible replacements: ${totalReplacements}`);
  if (DRY_RUN) console.log("(dry run — no changes written)");
}

main();
