import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "sermons.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    sqliteVec.load(_db);
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sermons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      youtube_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      published_at TEXT,
      transcript_raw TEXT,
      summary TEXT,
      tags TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sermon_id INTEGER NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      UNIQUE(sermon_id, chunk_index)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      content_rowid='id',
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE OF content ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      sermon_refs TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quiz_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sermon_id INTEGER REFERENCES sermons(id),
      question TEXT NOT NULL,
      expected_answer TEXT NOT NULL,
      user_answer TEXT,
      is_correct INTEGER,
      feedback TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_study (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      sermon_id INTEGER REFERENCES sermons(id),
      topic TEXT,
      questions TEXT,
      completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sermon_id INTEGER REFERENCES sermons(id),
      session_type TEXT NOT NULL CHECK(session_type IN ('chat', 'quiz', 'reading')),
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

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

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Fix: restrict FTS update trigger to content-only changes (avoid firing on embedding updates)
  db.exec(`DROP TRIGGER IF EXISTS chunks_au`);
  db.exec(`
    CREATE TRIGGER chunks_au AFTER UPDATE OF content ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `);

  // Migrate vec_chunks: drop old 384-dim table if dimensions don't match
  try {
    // If table exists but has wrong dimensions, recreate it
    const sample = db.prepare(`SELECT embedding FROM vec_chunks LIMIT 1`).get() as { embedding: Buffer } | undefined;
    if (sample && sample.embedding && sample.embedding.byteLength !== 1024 * 4) {
      console.log("Migrating vec_chunks from 384-dim to 1024-dim...");
      db.exec(`DROP TABLE vec_chunks`);
    }
  } catch {
    // Table doesn't exist yet, will be created below
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
      chunk_id INTEGER PRIMARY KEY,
      embedding float[1024] distance_metric=cosine
    );
  `);
}

export type Sermon = {
  id: number;
  youtube_id: string;
  title: string;
  published_at: string | null;
  transcript_raw: string | null;
  summary: string | null;
  tags: string | null;
  created_at: string;
};

export type Chunk = {
  id: number;
  sermon_id: number;
  chunk_index: number;
  content: string;
  embedding: Buffer | null;
};

export type ChatMessage = {
  id: number;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  sermon_refs: string | null;
  created_at: string;
};

export type QuizRecord = {
  id: number;
  sermon_id: number | null;
  question: string;
  expected_answer: string;
  user_answer: string | null;
  is_correct: number | null;
  feedback: string | null;
  created_at: string;
};

export type DailyStudy = {
  id: number;
  date: string;
  sermon_id: number | null;
  topic: string | null;
  questions: string | null;
  completed: number;
  created_at: string;
};

export type BibleVerse = {
  id: number;
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
};
