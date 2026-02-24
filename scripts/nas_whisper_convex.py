#!/usr/bin/env python3
"""
NAS 음원 → Whisper large-v3 → Convex 전사 파이프라인.

1. Convex에서 [nas-audio] 마커가 있는 설교 목록을 가져온다.
2. 각 설교의 오디오 파일을 whisper-cli (large-v3)로 전사한다.
3. 전사 결과를 Convex에 저장한다 (transcriptRaw + ASR 교정 + 재청킹).

Usage:
  python3 scripts/nas_whisper_convex.py --limit 2
  python3 scripts/nas_whisper_convex.py
  python3 scripts/nas_whisper_convex.py --id 3598 --audio path/to/file.mp3
"""

import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path


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
    rel = marker_text[len(prefix):].strip()
    candidate = base_dir / rel
    if candidate.exists():
        return candidate
    return None


def convert_to_wav(src: Path, out_wav: Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(src),
            "-ac", "1", "-ar", "16000",
            "-af", ",".join([
                "highpass=f=80",          # 80Hz 이하 저주파 잡음 제거
                "afftdn=nf=-20",          # FFT 기반 노이즈 제거
                "loudnorm=I=-16:TP=-1.5", # 볼륨 정규화 (EBU R128)
            ]),
            str(out_wav),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def transcribe_whisper(wav_path: Path, model_path: str, vad_model: str, no_gpu: bool) -> str:
    cmd = [
        "whisper-cli",
        "-m", model_path,
        "-l", "ko",
        "--no-timestamps",
        "-f", str(wav_path),
    ]
    if vad_model:
        cmd.extend(["--vad", "-vm", vad_model])
    if no_gpu:
        cmd.append("--no-gpu")

    result = subprocess.run(cmd, capture_output=True, text=True)
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


def is_hallucination(text: str, threshold: float = 0.4) -> bool:
    """Detect Whisper hallucination (repeated short phrases).

    Splits text into 2-3 word chunks and checks if any single chunk
    accounts for more than `threshold` of all chunks.
    """
    words = text.split()
    if len(words) < 20:
        return False
    # Check bigrams
    bigrams = [f"{words[i]} {words[i+1]}" for i in range(len(words) - 1)]
    if not bigrams:
        return False
    from collections import Counter
    counts = Counter(bigrams)
    most_common_count = counts.most_common(1)[0][1]
    return most_common_count / len(bigrams) > threshold


def convex_run_raw(fn: str, args_dict: dict | None = None) -> dict | None:
    """Run a Convex function, extract _id and title from potentially large output."""
    cmd = ["npx", "convex", "run", fn]
    if args_dict:
        cmd.append(json.dumps(args_dict))
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(f"convex run {fn} failed: {result.stderr.decode(errors='replace').strip()}")
    head = result.stdout[:4096].decode("utf-8", errors="replace")
    if head.strip() == "null":
        return None
    id_m = re.search(r'"_id":\s*"([^"]+)"', head)
    title_m = re.search(r'"title":\s*"([^"]*)"', head)
    if not id_m:
        return None
    return {"_id": id_m.group(1), "title": title_m.group(1) if title_m else ""}


def convex_run(fn: str, args_dict: dict | None = None) -> dict:
    """Run a Convex function via npx convex run and return parsed JSON."""
    cmd = ["npx", "convex", "run", fn]
    if args_dict:
        cmd.append(json.dumps(args_dict))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"convex run {fn} failed: {result.stderr.strip()}")
    return json.loads(result.stdout.strip())


def retranscribe_single(args: argparse.Namespace) -> None:
    """Re-transcribe a specific sermon by originalId."""
    if not args.audio:
        raise SystemExit("--audio is required when using --id")

    audio_path = Path(args.audio)
    if not audio_path.exists():
        raise SystemExit(f"audio file not found: {audio_path}")

    print(f"[info] Fetching sermon #{args.id} from Convex...")
    sermon = convex_run_raw("sermons:getByOriginalId", {"originalId": args.id})
    if not sermon:
        raise SystemExit(f"sermon #{args.id} not found in Convex")

    sid = sermon["_id"]
    title = sermon["title"]
    print(f"[info] #{args.id} {title}")
    print(f"[info] audio={audio_path}")
    print(f"[info] model={args.model}")

    with tempfile.TemporaryDirectory() as td:
        wav_path = Path(td) / "audio.wav"
        print(f"  [ffmpeg] converting to wav...")
        convert_to_wav(audio_path, wav_path)
        print(f"  [whisper] transcribing...")
        transcript = transcribe_whisper(wav_path, args.model, args.vad_model, args.no_gpu)

    if not transcript:
        raise SystemExit(f"empty transcript for #{args.id}")

    if is_hallucination(transcript):
        print(f"[hallucination] #{args.id} chars={len(transcript)} — skipped")
        print(f"  preview: {transcript[:100]}")
        return

    print(f"[transcribed] #{args.id} chars={len(transcript)}")

    if args.dry_run:
        print(f"[dry-run] #{args.id} skipping Convex save")
        print("---")
        print(transcript[:500])
        return

    convex_run(
        "transcriptCleanup:saveNasTranscript",
        {
            "sermonId": sid,
            "originalSermonId": args.id,
            "rawTranscript": transcript,
        },
    )
    print(f"[done] #{args.id} saved to Convex")


def main() -> None:
    parser = argparse.ArgumentParser(description="NAS audio → Whisper → Convex pipeline")
    parser.add_argument("--model", default="models/ggml-large-v3.bin")
    parser.add_argument("--vad-model", default="models/ggml-silero-v6.2.0.bin")
    parser.add_argument("--base-dir", default=str(discover_default_base_dir()))
    parser.add_argument("--limit", type=int, default=0, help="0이면 전체")
    parser.add_argument("--no-gpu", action="store_true", help="GPU 비활성화")
    parser.add_argument("--dry-run", action="store_true", help="전사만 하고 Convex 저장 안 함")
    parser.add_argument("--id", type=int, help="특정 설교 originalId 재전사")
    parser.add_argument("--audio", help="--id와 함께 사용: 오디오 파일 경로")
    args = parser.parse_args()

    # Single sermon re-transcription mode
    if args.id:
        retranscribe_single(args)
        return

    base_dir = Path(args.base_dir)
    if not base_dir.exists():
        raise FileNotFoundError(f"base dir not found: {base_dir}")

    # 1. Get NAS sermon list from Convex
    print("[info] Fetching NAS sermons from Convex...")
    data = convex_run("transcriptCleanup:getNasSermons")
    sermons = data["sermons"]
    print(f"[info] Found {len(sermons)} NAS audio sermons")

    if args.limit > 0:
        sermons = sermons[: args.limit]
        print(f"[info] Limited to {len(sermons)}")

    print(f"[info] base_dir={base_dir}")
    print(f"[info] model={args.model}")
    print(f"[info] vad_model={args.vad_model}")

    done = 0
    skipped = 0
    failed = 0

    for i, sermon in enumerate(sermons, 1):
        sid = sermon["_id"]
        original_id = sermon["originalId"]
        title = sermon["title"]
        marker = sermon["transcriptRaw"]

        audio_path = resolve_audio(base_dir, marker)
        if not audio_path:
            skipped += 1
            print(f"[skip] ({i}/{len(sermons)}) #{original_id} audio not found: {marker}")
            continue

        print(f"[start] ({i}/{len(sermons)}) #{original_id} {title[:50]}")
        try:
            with tempfile.TemporaryDirectory() as td:
                wav_path = Path(td) / "audio.wav"
                convert_to_wav(audio_path, wav_path)
                transcript = transcribe_whisper(wav_path, args.model, args.vad_model, args.no_gpu)

            if not transcript:
                failed += 1
                print(f"[warn] #{original_id} empty transcript")
                continue

            if is_hallucination(transcript):
                skipped += 1
                print(f"[hallucination] #{original_id} chars={len(transcript)} — skipped")
                print(f"  preview: {transcript[:80]}")
                continue

            print(f"[transcribed] #{original_id} chars={len(transcript)}")

            if args.dry_run:
                print(f"[dry-run] #{original_id} skipping Convex save")
                done += 1
                continue

            convex_run(
                "transcriptCleanup:saveNasTranscript",
                {
                    "sermonId": sid,
                    "originalSermonId": original_id,
                    "rawTranscript": transcript,
                },
            )
            done += 1
            print(f"[done] #{original_id}")

        except Exception as exc:
            failed += 1
            print(f"[fail] #{original_id} {exc}")

    print(f"\n[summary] done={done} skipped={skipped} failed={failed} total={len(sermons)}")


if __name__ == "__main__":
    main()
