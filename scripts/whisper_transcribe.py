#!/usr/bin/env python3
"""whisper.cpp (Metal-accelerated) 기반 설교 재전사 스크립트"""

import argparse
import os
import re
import sqlite3
import subprocess
import tempfile
from pathlib import Path


def convert_to_wav(src: str, out_wav: str) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-ac", "1", "-ar", "16000", out_wav],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def transcribe_whisper(wav_path: str, model_path: str) -> str:
    vad_model = os.path.join(os.path.dirname(model_path), "ggml-silero-v6.2.0.bin")
    cmd = [
        "whisper-cli",
        "-m", model_path,
        "-l", "ko",
        "--no-timestamps",
        "-f", wav_path,
    ]
    if os.path.exists(vad_model):
        cmd.extend(["--vad", "-vm", vad_model])
    result = subprocess.run(cmd, capture_output=True)
    stdout = result.stdout.decode("utf-8", errors="replace")
    lines = []
    for line in stdout.splitlines():
        line = line.strip()
        # 타임스탬프 줄 제거 ([00:00:00.000 --> 00:00:00.000] 형식)
        if re.match(r"^\[[\d:\.]+\s*-->\s*[\d:\.]+\]", line):
            continue
        if line:
            lines.append(line)
    return " ".join(lines).strip()


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150):
    cleaned = " ".join(text.split()).strip()
    if len(cleaned) <= chunk_size:
        return [(0, cleaned)]
    chunks = []
    start = 0
    idx = 0
    while start < len(cleaned):
        end = start + chunk_size
        if end < len(cleaned):
            seg = cleaned[start:end]
            last = max(
                seg.rfind(". "), seg.rfind("다. "),
                seg.rfind("요. "), seg.rfind("! "), seg.rfind("? "),
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
    conn.executescript("""
        DROP TRIGGER IF EXISTS chunks_ai;
        DROP TRIGGER IF EXISTS chunks_ad;
        DROP TRIGGER IF EXISTS chunks_au;
    """)


def rebuild_fts_and_triggers(conn: sqlite3.Connection) -> None:
    conn.executescript("""
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
    """)


def update_db(conn: sqlite3.Connection, sermon_id: int, transcript: str, max_retries: int = 5) -> None:
    for attempt in range(max_retries):
        try:
            cur = conn.cursor()
            cur.execute("UPDATE sermons SET transcript_raw=? WHERE id=?", (transcript, sermon_id))
            cur.execute("DELETE FROM chunks WHERE sermon_id=?", (sermon_id,))
            for idx, content in chunk_text(transcript):
                cur.execute(
                    "INSERT INTO chunks (sermon_id, chunk_index, content) VALUES (?, ?, ?)",
                    (sermon_id, idx, content),
                )
            conn.commit()
            return
        except sqlite3.OperationalError as e:
            if attempt < max_retries - 1:
                import time
                time.sleep(1 + attempt)
                continue
            raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="models/ggml-large-v3.bin")
    parser.add_argument("--ids", required=True, help="쉼표로 구분된 sermon ID (예: 1128,1129)")
    parser.add_argument("--audio-dir", default="data/audio")
    parser.add_argument("--db", default="data/sermons.db")
    parser.add_argument("--no-fts", action="store_true", help="FTS 트리거 관리 스킵 (병렬 실행용)")
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    cur = conn.cursor()
    # Always drop triggers to prevent FTS sync errors
    drop_chunk_triggers(conn)

    try:
        ids = [int(x.strip()) for x in args.ids.split(",") if x.strip()]
        for sermon_id in ids:
            row = cur.execute("SELECT youtube_id, title FROM sermons WHERE id=?", (sermon_id,)).fetchone()
            if not row:
                print(f"[skip] sermon {sermon_id}: DB에 없음")
                continue
            youtube_id, title = row

            # webm 또는 다른 포맷 탐색
            audio_dir = Path(args.audio_dir)
            audio_path = next(
                (p for ext in ("webm", "mp4", "m4a", "mp3", "wav")
                 if (p := audio_dir / f"{youtube_id}.{ext}").exists()),
                None
            )
            if not audio_path:
                print(f"[skip] sermon {sermon_id}: 오디오 파일 없음 ({audio_dir}/{youtube_id}.*)")
                continue

            print(f"[start] sermon {sermon_id} | {title[:40]}")

            with tempfile.TemporaryDirectory() as td:
                wav_path = os.path.join(td, "audio.wav")
                print(f"  → WAV 변환 중...")
                convert_to_wav(str(audio_path), wav_path)
                print(f"  → whisper-cli 전사 중 (Metal 가속)...")
                transcript = transcribe_whisper(wav_path, args.model)

            if transcript:
                update_db(conn, sermon_id, transcript)
                print(f"[done] sermon {sermon_id} chars={len(transcript)}")
            else:
                print(f"[warn] sermon {sermon_id} 전사 결과 없음")
    finally:
        if not args.no_fts:
            rebuild_fts_and_triggers(conn)
        conn.close()


if __name__ == "__main__":
    main()
