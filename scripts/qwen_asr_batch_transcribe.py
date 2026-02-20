import argparse
import os
import sqlite3
import subprocess
import tempfile
from pathlib import Path

import torch
from qwen_asr import Qwen3ASRModel


def audio_duration_seconds(audio_path: str) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        audio_path,
    ]
    out = subprocess.check_output(cmd, text=True).strip()
    return float(out)


def extract_chunk(src: str, start: int, duration: int, out_wav: str) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        str(start),
        "-i",
        src,
        "-t",
        str(duration),
        "-ac",
        "1",
        "-ar",
        "16000",
        out_wav,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", default="models/Qwen3-ASR-0.6B")
    parser.add_argument("--ids", default="1128,1129")
    parser.add_argument("--audio-dir", default="data/audio")
    parser.add_argument("--db", default="data/sermons.db")
    parser.add_argument("--segment-sec", type=int, default=120)
    args = parser.parse_args()

    model = Qwen3ASRModel.from_pretrained(
        args.model_path,
        dtype=torch.float32,
        device_map="cpu",
        max_inference_batch_size=1,
        max_new_tokens=384,
    )

    conn = sqlite3.connect(args.db)
    cur = conn.cursor()
    drop_chunk_triggers(conn)

    try:
        ids = [int(x.strip()) for x in args.ids.split(",") if x.strip()]
        for sermon_id in ids:
            youtube_id = cur.execute("SELECT youtube_id FROM sermons WHERE id=?", (sermon_id,)).fetchone()
            if not youtube_id:
                print(f"[skip] sermon {sermon_id}: not found")
                continue
            youtube_id = youtube_id[0]
            audio_path = Path(args.audio_dir) / f"{youtube_id}.webm"
            if not audio_path.exists():
                print(f"[skip] sermon {sermon_id}: audio missing ({audio_path})")
                continue

            total = int(audio_duration_seconds(str(audio_path)))
            texts = []
            print(f"[start] sermon {sermon_id} ({youtube_id}) duration={total}s")

            with tempfile.TemporaryDirectory() as td:
                i = 0
                for start in range(0, total, args.segment_sec):
                    wav = os.path.join(td, f"seg-{i:04d}.wav")
                    extract_chunk(str(audio_path), start, args.segment_sec, wav)
                    try:
                        res = model.transcribe(audio=wav, language="Korean")
                        texts.append(res[0].text.strip())
                        print(f"[{sermon_id}] {start:5d}s ok")
                    except Exception as e:
                        print(f"[{sermon_id}] {start:5d}s fail: {e}")
                    i += 1

            transcript = " ".join(t for t in texts if t).strip()
            transcript = transcript.replace("  ", " ").strip()
            if transcript:
                update_db(conn, sermon_id, transcript)
                print(f"[done] sermon {sermon_id} chars={len(transcript)}")
            else:
                print(f"[done] sermon {sermon_id} empty transcript")
    finally:
        rebuild_fts_and_triggers(conn)
        conn.close()


if __name__ == "__main__":
    main()
