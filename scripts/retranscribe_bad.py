#!/usr/bin/env python3
"""
불량 전사 설교 자동 탐지 → 오디오 다운로드 → whisper.cpp 재전사 파이프라인
실행: python3 scripts/retranscribe_bad.py --workers 2
"""

import argparse
import os
import re
import sqlite3
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

_lock = threading.Lock()
_print_lock = threading.Lock()


def tprint(*args, **kwargs):
    with _print_lock:
        print(*args, **kwargs, flush=True)


# ─── 노이즈 점수 계산 ──────────────────────────────────────────────
def noise_score(text: str) -> float:
    if not text:
        return 999.0
    count = sum(
        len(text) - len(text.replace(f" {n} ", ""))
        for n in ("0", "1", "2", "3")
    )
    return count / len(text) * 1000


def get_bad_sermon_ids(db: str, threshold: float, already_done: set) -> list:
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT id, youtube_id, title, transcript_raw FROM sermons WHERE transcript_raw IS NOT NULL"
    ).fetchall()
    conn.close()

    bad = []
    for sid, yt_id, title, transcript in rows:
        if sid in already_done:
            continue
        score = noise_score(transcript)
        if score > threshold or len(transcript) < 1000:
            bad.append((sid, yt_id, title, score))

    bad.sort(key=lambda x: x[3], reverse=True)
    return bad


# ─── 오디오 다운로드 ───────────────────────────────────────────────
def download_audio(youtube_id: str, audio_dir: Path) -> Path | None:
    for ext in ("webm", "mp4", "m4a", "mp3", "wav"):
        p = audio_dir / f"{youtube_id}.{ext}"
        if p.exists():
            return p

    out_tmpl = str(audio_dir / f"{youtube_id}.%(ext)s")
    result = subprocess.run(
        [
            "yt-dlp",
            "--cookies-from-browser", "chrome",
            "--js-runtimes", "deno",
            "-f", "bestaudio",
            "-o", out_tmpl,
            f"https://www.youtube.com/watch?v={youtube_id}",
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        tprint(f"    [오류] 다운로드 실패: {result.stderr[-200:]}")
        return None

    for ext in ("webm", "mp4", "m4a", "mp3", "wav"):
        p = audio_dir / f"{youtube_id}.{ext}"
        if p.exists():
            return p
    return None


# ─── WAV 변환 + 전사 ──────────────────────────────────────────────
def convert_to_wav(src: str, out_wav: str) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-ac", "1", "-ar", "16000", out_wav],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def transcribe_whisper(wav_path: str, model_path: str) -> str:
    result = subprocess.run(
        ["whisper-cli", "-m", model_path, "-l", "ko", "--no-timestamps", "-f", wav_path],
        capture_output=True, text=True,
    )
    lines = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if re.match(r"^\[[\d:\.]+\s*-->\s*[\d:\.]+\]", line):
            continue
        if line:
            lines.append(line)
    return " ".join(lines).strip()


# ─── DB 업데이트 ──────────────────────────────────────────────────
def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150):
    cleaned = " ".join(text.split()).strip()
    if len(cleaned) <= chunk_size:
        return [(0, cleaned)]
    chunks, start, idx = [], 0, 0
    while start < len(cleaned):
        end = start + chunk_size
        if end < len(cleaned):
            seg = cleaned[start:end]
            last = max(seg.rfind(". "), seg.rfind("다. "), seg.rfind("요. "),
                       seg.rfind("! "), seg.rfind("? "))
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


def disable_fts_triggers(db: str) -> None:
    conn = sqlite3.connect(db)
    conn.executescript("""
        DROP TRIGGER IF EXISTS chunks_ai;
        DROP TRIGGER IF EXISTS chunks_ad;
        DROP TRIGGER IF EXISTS chunks_au;
    """)
    conn.close()


def rebuild_fts(db: str) -> None:
    print("FTS 재빌드 중...", flush=True)
    conn = sqlite3.connect(db)
    conn.executescript("""
        DROP TABLE IF EXISTS chunks_fts;
        CREATE VIRTUAL TABLE chunks_fts USING fts5(content, content_rowid='id', tokenize='unicode61');
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
    conn.close()
    print("FTS 재빌드 완료!", flush=True)


def update_db(db: str, sermon_id: int, transcript: str) -> None:
    with _lock:
        conn = sqlite3.connect(db, timeout=30)
        conn.execute("PRAGMA journal_mode=WAL")
        cur = conn.cursor()
        cur.execute("UPDATE sermons SET transcript_raw=? WHERE id=?", (transcript, sermon_id))
        cur.execute("DELETE FROM chunks WHERE sermon_id=?", (sermon_id,))
        for idx, content in chunk_text(transcript):
            cur.execute(
                "INSERT INTO chunks (sermon_id, chunk_index, content) VALUES (?, ?, ?)",
                (sermon_id, idx, content),
            )
        conn.commit()
        conn.close()


# ─── 진행 상황 파일 ───────────────────────────────────────────────
DONE_FILE = Path("data/retranscribe_done.txt")

def load_done() -> set:
    if DONE_FILE.exists():
        return set(int(x) for x in DONE_FILE.read_text().split() if x.strip())
    return set()

def mark_done(sermon_id: int) -> None:
    with _lock:
        with open(DONE_FILE, "a") as f:
            f.write(f"{sermon_id}\n")


# ─── 메인 ─────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="models/ggml-large-v3.bin")
    parser.add_argument("--db", default="data/sermons.db")
    parser.add_argument("--audio-dir", default="data/audio")
    parser.add_argument("--threshold", type=float, default=8.0, help="노이즈 점수 임계값")
    parser.add_argument("--keep-audio", action="store_true", help="전사 후 오디오 파일 보존")
    parser.add_argument("--dry-run", action="store_true", help="목록만 출력, 실행 안 함")
    parser.add_argument("--workers", type=int, default=1, help="병렬 작업자 수 (기본: 1)")
    args = parser.parse_args()

    audio_dir = Path(args.audio_dir)
    audio_dir.mkdir(parents=True, exist_ok=True)

    already_done = load_done()
    bad_sermons = get_bad_sermon_ids(args.db, args.threshold, already_done)

    tprint(f"재전사 대상: {len(bad_sermons)}개 (임계값: {args.threshold}, workers: {args.workers})")
    if args.dry_run:
        for sid, yt_id, title, score in bad_sermons:
            tprint(f"  [{sid}] score={score:.1f} {title[:50]}")
        return

    total = len(bad_sermons)
    completed = [0]

    def process_sermon(item):
        sermon_id, youtube_id, title, score = item
        t0 = time.time()
        tprint(f"\n[{sermon_id}] score={score:.1f} | {title[:45]}")

        audio_path = download_audio(youtube_id, audio_dir)
        if not audio_path:
            tprint(f"  [{sermon_id}] skip: 다운로드 실패")
            return

        try:
            with tempfile.TemporaryDirectory() as td:
                wav_path = os.path.join(td, "audio.wav")
                convert_to_wav(str(audio_path), wav_path)
                transcript = transcribe_whisper(wav_path, args.model)

            if transcript:
                update_db(args.db, sermon_id, transcript)
                mark_done(sermon_id)
                with _lock:
                    completed[0] += 1
                elapsed = int(time.time() - t0)
                tprint(f"  [{sermon_id}] 완료 {completed[0]}/{total} | chars={len(transcript)} | {elapsed}s")
            else:
                tprint(f"  [{sermon_id}] 경고: 전사 결과 없음")
        except Exception as e:
            tprint(f"  [{sermon_id}] 오류: {e}")
        finally:
            if not args.keep_audio and audio_path and audio_path.exists():
                audio_path.unlink()

    disable_fts_triggers(args.db)

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(process_sermon, item) for item in bad_sermons]
        for f in as_completed(futures):
            f.result()

    rebuild_fts(args.db)
    tprint(f"\n전체 완료! ({completed[0]}/{total}개 성공)")


if __name__ == "__main__":
    main()
