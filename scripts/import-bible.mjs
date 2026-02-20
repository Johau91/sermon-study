import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function parseArgs() {
  const args = process.argv.slice(2);
  let filePath = "";
  let url = "";
  let translation = "개역한글";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--file" && args[i + 1]) {
      filePath = args[++i];
    } else if (arg === "--url" && args[i + 1]) {
      url = args[++i];
    } else if (arg === "--translation" && args[i + 1]) {
      translation = args[++i];
    }
  }

  if (!filePath && !url) {
    throw new Error("--file 또는 --url 중 하나는 필수입니다.");
  }

  return { filePath, url, translation };
}

function normalizeBook(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function pushRow(rows, translation, book, chapter, verse, text) {
  const normalizedBook = normalizeBook(book);
  const c = Number(chapter);
  const v = Number(verse);
  const t = String(text || "").trim();

  if (!normalizedBook || !Number.isFinite(c) || !Number.isFinite(v) || !t) return;
  rows.push({ translation, book: normalizedBook, chapter: c, verse: v, text: t });
}

function parseTsv(content, translation) {
  const rows = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length < 4) continue;
    pushRow(rows, translation, parts[0], parts[1], parts[2], parts.slice(3).join("\t"));
  }
  return rows;
}

function parseJson(content, translation) {
  const data = JSON.parse(content);
  const rows = [];

  function visit(node, bookHint = "", chapterHint = NaN) {
    if (!node) return;

    if (Array.isArray(node)) {
      for (const item of node) visit(item, bookHint, chapterHint);
      return;
    }

    if (typeof node !== "object") return;

    if (
      ("book" in node || "book_name" in node) &&
      ("chapter" in node || "chapter_no" in node) &&
      ("verse" in node || "verse_no" in node) &&
      ("text" in node || "content" in node || "v" in node)
    ) {
      pushRow(
        rows,
        translation,
        node.book ?? node.book_name,
        node.chapter ?? node.chapter_no,
        node.verse ?? node.verse_no,
        node.text ?? node.content ?? node.v
      );
      return;
    }

    const book = node.book ?? node.name ?? node.book_name ?? bookHint;
    const chapter = Number(node.chapter ?? node.chapter_no ?? chapterHint);

    if (Array.isArray(node.verses)) {
      for (const verseNode of node.verses) {
        if (typeof verseNode === "object") {
          pushRow(
            rows,
            translation,
            book,
            chapter,
            verseNode.verse ?? verseNode.no ?? verseNode.id,
            verseNode.text ?? verseNode.content ?? verseNode.v
          );
        }
      }
    }

    for (const key of Object.keys(node)) {
      visit(node[key], book, chapter);
    }
  }

  visit(data);
  return rows;
}

async function resolveInput(filePath, url) {
  if (filePath) {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    return fs.readFileSync(resolved, "utf-8");
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`다운로드 실패: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function main() {
  const { filePath, url, translation } = parseArgs();
  const input = await resolveInput(filePath, url);

  const rows = input.trim().startsWith("{") || input.trim().startsWith("[")
    ? parseJson(input, translation)
    : parseTsv(input, translation);

  if (rows.length === 0) {
    throw new Error("파싱된 구절이 없습니다. 파일 형식을 확인하세요.");
  }

  const db = new Database(path.join(process.cwd(), "data", "sermons.db"));
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS bible_verses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      translation TEXT NOT NULL DEFAULT '개역한글',
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      UNIQUE(translation, book, chapter, verse)
    );
    CREATE INDEX IF NOT EXISTS idx_bible_lookup
      ON bible_verses(translation, book, chapter, verse);
  `);

  const insert = db.prepare(`
    INSERT INTO bible_verses (translation, book, chapter, verse, text)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(translation, book, chapter, verse)
    DO UPDATE SET text = excluded.text
  `);

  const tx = db.transaction(() => {
    for (const row of rows) {
      insert.run(row.translation, row.book, row.chapter, row.verse, row.text);
    }
  });

  tx();

  const count = db
    .prepare("SELECT COUNT(*) as c FROM bible_verses WHERE translation = ?")
    .get(translation).c;

  console.log(`Imported ${rows.length} verses (translation=${translation}).`);
  console.log(`Total stored verses for ${translation}: ${count}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
