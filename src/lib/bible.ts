import { getDb, type BibleVerse } from "./db";

const BOOK_ALIASES: Record<string, string> = {
  창세기: "창세기",
  출애굽기: "출애굽기",
  레위기: "레위기",
  민수기: "민수기",
  신명기: "신명기",
  여호수아: "여호수아",
  사사기: "사사기",
  룻기: "룻기",
  사무엘상: "사무엘상",
  사무엘하: "사무엘하",
  열왕기상: "열왕기상",
  열왕기하: "열왕기하",
  역대상: "역대상",
  역대하: "역대하",
  에스라: "에스라",
  느헤미야: "느헤미야",
  에스더: "에스더",
  욥기: "욥기",
  시편: "시편",
  잠언: "잠언",
  전도서: "전도서",
  아가: "아가",
  이사야: "이사야",
  예레미야: "예레미야",
  예레미야애가: "예레미야애가",
  에스겔: "에스겔",
  다니엘: "다니엘",
  호세아: "호세아",
  요엘: "요엘",
  아모스: "아모스",
  오바댜: "오바댜",
  요나: "요나",
  미가: "미가",
  나훔: "나훔",
  하박국: "하박국",
  스바냐: "스바냐",
  학개: "학개",
  스가랴: "스가랴",
  말라기: "말라기",
  마태복음: "마태복음",
  마가복음: "마가복음",
  누가복음: "누가복음",
  요한복음: "요한복음",
  사도행전: "사도행전",
  로마서: "로마서",
  고린도전서: "고린도전서",
  고린도후서: "고린도후서",
  갈라디아서: "갈라디아서",
  에베소서: "에베소서",
  빌립보서: "빌립보서",
  골로새서: "골로새서",
  데살로니가전서: "데살로니가전서",
  데살로니가후서: "데살로니가후서",
  디모데전서: "디모데전서",
  디모데후서: "디모데후서",
  디도서: "디도서",
  빌레몬서: "빌레몬서",
  히브리서: "히브리서",
  야고보서: "야고보서",
  베드로전서: "베드로전서",
  베드로후서: "베드로후서",
  요한일서: "요한일서",
  요한이서: "요한이서",
  요한삼서: "요한삼서",
  유다서: "유다서",
  요한계시록: "요한계시록",
  창: "창세기",
  출: "출애굽기",
  레: "레위기",
  민: "민수기",
  신: "신명기",
  수: "여호수아",
  삿: "사사기",
  룻: "룻기",
  삼상: "사무엘상",
  삼하: "사무엘하",
  왕상: "열왕기상",
  왕하: "열왕기하",
  대상: "역대상",
  대하: "역대하",
  스: "에스라",
  느: "느헤미야",
  에: "에스더",
  욥: "욥기",
  시: "시편",
  잠: "잠언",
  전: "전도서",
  사: "이사야",
  렘: "예레미야",
  겔: "에스겔",
  단: "다니엘",
  호: "호세아",
  암: "아모스",
  욘: "요나",
  미: "미가",
  합: "하박국",
  습: "스바냐",
  학: "학개",
  슥: "스가랴",
  말: "말라기",
  마: "마태복음",
  막: "마가복음",
  눅: "누가복음",
  요: "요한복음",
  행: "사도행전",
  롬: "로마서",
  고전: "고린도전서",
  고후: "고린도후서",
  갈: "갈라디아서",
  엡: "에베소서",
  빌: "빌립보서",
  골: "골로새서",
  살전: "데살로니가전서",
  살후: "데살로니가후서",
  딤전: "디모데전서",
  딤후: "디모데후서",
  딛: "디도서",
  몬: "빌레몬서",
  히: "히브리서",
  약: "야고보서",
  벧전: "베드로전서",
  벧후: "베드로후서",
  요일: "요한일서",
  요이: "요한이서",
  요삼: "요한삼서",
  유: "유다서",
  계: "요한계시록",
};

export interface BibleRef {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

export function normalizeBookName(input: string): string | null {
  const normalized = input.replace(/\s+/g, "").trim();
  return BOOK_ALIASES[normalized] || null;
}

export function parseBibleReference(input: string): BibleRef | null {
  const normalized = input.replace(/\s+/g, " ").trim();

  const colonMatch = normalized.match(/^([가-힣0-9]+)\s*(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[-~]\s*(\d{1,3}))?$/);
  if (colonMatch) {
    const book = normalizeBookName(colonMatch[1]);
    if (!book) return null;
    const chapter = Number(colonMatch[2]);
    const verseStart = Number(colonMatch[3]);
    const verseEnd = Number(colonMatch[4] || colonMatch[3]);
    return { book, chapter, verseStart, verseEnd };
  }

  const chapterVerseMatch = normalized.match(/^([가-힣0-9]+)\s*(\d{1,3})\s*장\s*(\d{1,3})\s*절(?:\s*[-~]\s*(\d{1,3})\s*절)?$/);
  if (!chapterVerseMatch) return null;

  const book = normalizeBookName(chapterVerseMatch[1]);
  if (!book) return null;

  const chapter = Number(chapterVerseMatch[2]);
  const verseStart = Number(chapterVerseMatch[3]);
  const verseEnd = Number(chapterVerseMatch[4] || chapterVerseMatch[3]);
  return { book, chapter, verseStart, verseEnd };
}

export function extractBibleReferences(text: string, maxRefs: number = 3): BibleRef[] {
  const matches = text.match(/([가-힣0-9]{1,10}\s*\d{1,3}\s*(?::|장\s*)\s*\d{1,3}(?:\s*[-~]\s*\d{1,3}(?:\s*절)?)?\s*(?:절)?)/g) || [];
  const refs: BibleRef[] = [];
  const seen = new Set<string>();

  for (const candidate of matches) {
    const parsed = parseBibleReference(candidate);
    if (!parsed) continue;

    const key = `${parsed.book}-${parsed.chapter}-${parsed.verseStart}-${parsed.verseEnd}`;
    if (seen.has(key)) continue;

    refs.push(parsed);
    seen.add(key);

    if (refs.length >= maxRefs) break;
  }

  return refs;
}

export function getBibleVerses(ref: BibleRef, translation: string = "개역한글"): BibleVerse[] {
  const db = getDb();
  const start = Math.min(ref.verseStart, ref.verseEnd);
  const end = Math.max(ref.verseStart, ref.verseEnd);

  return db
    .prepare(
      `
        SELECT id, translation, book, chapter, verse, text
        FROM bible_verses
        WHERE translation = ?
          AND book = ?
          AND chapter = ?
          AND verse BETWEEN ? AND ?
        ORDER BY verse ASC
      `
    )
    .all(translation, ref.book, ref.chapter, start, end) as BibleVerse[];
}

export function getBibleContextForQuery(query: string, translation: string = "개역한글"): string {
  const refs = extractBibleReferences(query, 3);
  if (refs.length === 0) return "";

  const sections: string[] = [];

  for (const ref of refs) {
    const verses = getBibleVerses(ref, translation);
    if (verses.length === 0) continue;

    const refLabel = `${ref.book} ${ref.chapter}:${ref.verseStart}${
      ref.verseEnd !== ref.verseStart ? `-${ref.verseEnd}` : ""
    }`;
    const body = verses.map((v) => `${v.verse}절 ${v.text}`).join("\n");
    sections.push(`[${translation}] ${refLabel}\n${body}`);
  }

  return sections.join("\n\n");
}
