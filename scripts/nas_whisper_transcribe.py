#!/usr/bin/env python3
"""NAS 음원([nas-audio] marker) 대상 whisper.cpp 전사 스크립트."""

import argparse
import os
import re
import sqlite3
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable


def convert_to_wav(src: Path, out_wav: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-ac", "1", "-ar", "16000", str(out_wav)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def transcribe_whisper(wav_path: Path, model_path: str, no_gpu: bool) -> str:
    cmd = [
        "whisper-cli",
        "-m",
        model_path,
        "-l",
        "ko",
        "--no-timestamps",
        "-f",
        str(wav_path),
    ]
    if no_gpu:
        cmd.append("--no-gpu")

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "whisper-cli failed")

    lines: list[str] = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if re.match(r"^\[[\d:\.]+\s*-->\s*[\d:\.]+\]", line):
            continue
        if line:
            lines.append(line)
    return " ".join(lines).strip()


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> Iterable[tuple[int, str]]:
    cleaned = " ".join(text.split()).strip()
    if len(cleaned) <= chunk_size:
        return [(0, cleaned)]

    chunks: list[tuple[int, str]] = []
    start = 0
    idx = 0
    while start < len(cleaned):
        end = start + chunk_size
        if end < len(cleaned):
            seg = cleaned[start:end]
            last = max(
                seg.rfind(". "),
                seg.rfind("다. "),
                seg.rfind("요. "),
                seg.rfind("! "),
                seg.rfind("? "),
            )
            if last > chunk_size * 0.5:
                end = start + last + 2
        else:
            end = len(cleaned)
        chunks.append((idx, cleaned[start:end].strip()))
        if end >= len(cleaned):
            break
        start = end - overlap
        idx += 1
    return chunks


def drop_chunk_triggers(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TRIGGER IF EXISTS chunks_ai;
        DROP TRIGGER IF EXISTS chunks_ad;
        DROP TRIGGER IF EXISTS chunks_au;
        """
    )


def rebuild_fts_and_triggers(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS chunks_fts;
        CREATE VIRTUAL TABLE chunks_fts USING fts5(
          content, content_rowid='id', tokenize='unicode61'
        );
        INSERT INTO chunks_fts(rowid, content) SELECT id, content FROM chunks;

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
        """
    )


def update_db(conn: sqlite3.Connection, sermon_id: int, transcript: str) -> None:
    cur = conn.cursor()
    cur.execute("UPDATE sermons SET transcript_raw=? WHERE id=?", (transcript, sermon_id))
    cur.execute("DELETE FROM chunks WHERE sermon_id=?", (sermon_id,))
    for idx, content in chunk_text(transcript):
        cur.execute(
            "INSERT INTO chunks (sermon_id, chunk_index, content) VALUES (?, ?, ?)",
            (sermon_id, idx, content),
        )
    conn.commit()


def discover_default_base_dir() -> Path:
    docs = Path("/Users/johau/Documents")
    candidates = sorted(docs.glob("99_*설교"))
    if candidates:
        return candidates[0]
    return docs / "99_연희동~노량진설교"


def resolve_audio(base_dir: Path, marker_text: str) -> Path | None:
    prefix = "[nas-audio] "
    if not marker_text.startswith(prefix):
        return None
    rel = marker_text[len(prefix) :].strip()
    candidate = base_dir / rel
    if candidate.exists():
        return candidate
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="data/sermons.db")
    parser.add_argument("--model", default="models/ggml-large-v3.bin")
    parser.add_argument("--base-dir", default=str(discover_default_base_dir()))
    parser.add_argument("--limit", type=int, default=0, help="0이면 전체")
    parser.add_argument("--ids", default="", help="쉼표 구분 sermon id 목록")
    parser.add_argument("--no-gpu", action="store_true", help="GPU 비활성화")
    args = parser.parse_args()

    base_dir = Path(args.base_dir)
    if not base_dir.exists():
        raise FileNotFoundError(f"base dir not found: {base_dir}")

    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA journal_mode=WAL;")
    cur = conn.cursor()
    drop_chunk_triggers(conn)

    try:
        where = "youtube_id like 'nas99-%' and transcript_raw like '[nas-audio] %'"
        params: list[object] = []

        if args.ids.strip():
            ids = [int(x.strip()) for x in args.ids.split(",") if x.strip()]
            placeholders = ",".join(["?"] * len(ids))
            where += f" and id in ({placeholders})"
            params.extend(ids)

        sql = f"select id, title, transcript_raw from sermons where {where} order by id"
        if args.limit and args.limit > 0:
            sql += " limit ?"
            params.append(args.limit)

        rows = cur.execute(sql, params).fetchall()
        total = len(rows)
        print(f"[info] base_dir={base_dir}")
        print(f"[info] target={total}")

        done = 0
        skipped = 0
        failed = 0
        for sermon_id, title, marker in rows:
            audio_path = resolve_audio(base_dir, marker or "")
            if not audio_path:
                skipped += 1
                print(f"[skip] {sermon_id} audio not found")
                continue

            print(f"[start] {sermon_id} {title[:50]}")
            try:
                with tempfile.TemporaryDirectory() as td:
                    wav_path = Path(td) / "audio.wav"
                    convert_to_wav(audio_path, wav_path)
                    transcript = transcribe_whisper(wav_path, args.model, args.no_gpu)
                if transcript:
                    update_db(conn, sermon_id, transcript)
                    done += 1
                    print(f"[done] {sermon_id} chars={len(transcript)}")
                else:
                    failed += 1
                    print(f"[warn] {sermon_id} empty transcript")
            except Exception as exc:
                failed += 1
                print(f"[fail] {sermon_id} {exc}")

        print(f"[summary] done={done} skipped={skipped} failed={failed} total={total}")
    finally:
        rebuild_fts_and_triggers(conn)
        conn.close()


if __name__ == "__main__":
    main()
