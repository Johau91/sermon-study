#!/usr/bin/env node
/**
 * 무보수전도자학교 설교 텍스트 임포트 스크립트
 * articles/ 폴더의 개별 텍스트 파일을 sermons DB에 삽입
 */

import { readdirSync, readFileSync } from "fs";
import path from "path";
import Database from "better-sqlite3";

const ARTICLES_DIR = "/Users/johau/sermon_texts/articles";
const DB_PATH = path.join(process.cwd(), "data", "sermons.db");

// chunker (src/lib/chunker.ts 와 동일 로직)
function chunkText(text, { chunkSize = 800, overlap = 150 } = {}) {
  if (!text || text.trim().length === 0) return [];
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= chunkSize) {
    return [{ index: 0, content: cleaned }];
  }
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
      if (lastPeriod > chunkSize * 0.5) {
        end = start + lastPeriod + 2;
      }
    } else {
      end = cleaned.length;
    }
    chunks.push({ index, content: cleaned.slice(start, end).trim() });
    if (end >= cleaned.length) break;
    start = end - overlap;
    index++;
  }
  return chunks;
}

function parseArticle(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split("\n");

  let title = "";
  let subtitle = "";
  let date = "";
  const contentLines = [];
  let headerDone = false;
  let headerCount = 0;

  for (const line of lines) {
    if (line.startsWith("====")) {
      headerCount++;
      if (headerCount >= 2) {
        headerDone = true;
      }
      continue;
    }
    if (!headerDone) {
      if (line.startsWith("[무보수") || line.startsWith("[무보수")) {
        title = line.trim();
      } else if (line.startsWith("날짜:")) {
        date = line.replace("날짜:", "").trim();
      } else if (line.trim() && !title) {
        // skip
      } else if (line.trim() && title && !subtitle && !line.startsWith("날짜:")) {
        subtitle = line.trim();
      }
    } else {
      contentLines.push(line);
    }
  }

  const content = contentLines.join("\n").trim();
  return { title, subtitle, date, content };
}

function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  const insertSermon = db.prepare(
    `INSERT OR IGNORE INTO sermons (youtube_id, title, published_at, transcript_raw)
     VALUES (?, ?, ?, ?)`
  );
  const insertChunk = db.prepare(
    `INSERT OR IGNORE INTO chunks (sermon_id, chunk_index, content)
     VALUES (?, ?, ?)`
  );
  const checkExists = db.prepare(
    `SELECT id FROM sermons WHERE youtube_id = ?`
  );

  const files = readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort();

  console.log(`무보수전도자학교 ${files.length}편 임포트 시작\n`);

  let added = 0;
  let skipped = 0;
  let totalChunks = 0;

  const insertAll = db.transaction(() => {
    for (const file of files) {
      const numMatch = file.match(/^(\d+)_/);
      const num = numMatch ? parseInt(numMatch[1], 10) : 0;
      const articleId = `mbjds-${String(num).padStart(3, "0")}`;

      const existing = checkExists.get(articleId);
      if (existing) {
        console.log(`  [${num}/122] ${file} -> 이미 존재, 건너뜀`);
        skipped++;
        continue;
      }

      const article = parseArticle(path.join(ARTICLES_DIR, file));
      const fullTitle = article.subtitle
        ? `${article.title} - ${article.subtitle}`
        : article.title;

      // Insert sermon
      const result = insertSermon.run(
        articleId,
        fullTitle,
        article.date || null,
        article.content
      );

      if (result.changes > 0) {
        const sermonId = result.lastInsertRowid;

        // Create chunks
        const chunks = chunkText(article.content);
        for (const chunk of chunks) {
          insertChunk.run(sermonId, chunk.index, chunk.content);
        }

        totalChunks += chunks.length;
        added++;
        console.log(
          `  [${num}/122] ${fullTitle.substring(0, 50)}... -> ${chunks.length}청크`
        );
      }
    }
  });

  insertAll();

  console.log(`\n완료!`);
  console.log(`  추가: ${added}편`);
  console.log(`  건너뜀: ${skipped}편`);
  console.log(`  생성된 청크: ${totalChunks}개`);

  // Show total count
  const total = db.prepare("SELECT count(*) as cnt FROM sermons").get();
  const chunkTotal = db.prepare("SELECT count(*) as cnt FROM chunks").get();
  console.log(`\nDB 전체: 설교 ${total.cnt}편, 청크 ${chunkTotal.cnt}개`);

  db.close();
}

main();
