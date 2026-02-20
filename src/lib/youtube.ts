import { execSync } from "child_process";

export interface VideoInfo {
  id: string;
  title: string;
  published_at: string;
}

export async function getChannelVideos(
  channelOrPlaylist: string,
  maxResults: number = 50
): Promise<VideoInfo[]> {
  // Support both channel handles and full URLs (playlist URLs)
  const url = channelOrPlaylist.startsWith("http")
    ? channelOrPlaylist
    : `https://www.youtube.com/${channelOrPlaylist}/videos`;

  const cmd = `yt-dlp --flat-playlist --print "%(id)s\t%(title)s\t%(upload_date)s" --playlist-end ${maxResults} "${url}"`;

  const output = execSync(cmd, {
    encoding: "utf-8",
    timeout: 120000,
  });

  return output
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [id, title, dateStr] = line.split("\t");
      // Try to extract date from title if upload_date is NA
      let published_at: string;
      if (dateStr && dateStr !== "NA" && dateStr.length >= 8) {
        published_at = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
      } else {
        // Try to parse date from title like "2026-02-08" or "2026.02.08"
        const dateMatch = (title || "").match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
        published_at = dateMatch
          ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
          : new Date().toISOString().split("T")[0];
      }
      return { id, title: title || "제목 없음", published_at };
    });
}

export async function getTranscript(videoId: string): Promise<string | null> {
  // Use yt-dlp to get auto-generated subtitles and suppress log noise.
  try {
    const tmpBase = `/tmp/yt-sub-${videoId}`;
    const raw = execSync(
      `yt-dlp --write-auto-sub --sub-lang ko --sub-format vtt --skip-download --quiet --no-warnings -o "${tmpBase}" "https://www.youtube.com/watch?v=${videoId}" && cat "${tmpBase}.ko.vtt" && rm -f "${tmpBase}"*`,
      { encoding: "utf-8", timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
    );
    if (!raw || raw.trim().length < 100) return null;
    return cleanSubtitles(raw);
  } catch {
    return null;
  }
}

function applyBibleAwareCorrections(text: string): string {
  let corrected = text;

  // Common worship terms frequently split by ASR.
  corrected = corrected
    .replace(/하나\s*님/g, "하나님")
    .replace(/예수\s*님/g, "예수님")
    .replace(/주\s*님/g, "주님")
    .replace(/그리스\s*도/g, "그리스도")
    .replace(/성\s*령/g, "성령");

  // Normalize scripture notation spacing.
  corrected = corrected
    .replace(/(\d+)\s*장\s*(\d+)\s*절/g, "$1장 $2절")
    .replace(/(\d+)\s*:\s*(\d+)/g, "$1:$2")
    .replace(/([가-힣]+)\s*(\d+)\s*장/g, "$1 $2장");

  // Normalize common abbreviated Korean book names when followed by chapter/verse.
  corrected = corrected
    .replace(/\b고전\s*(\d+)/g, "고린도전서 $1")
    .replace(/\b고후\s*(\d+)/g, "고린도후서 $1")
    .replace(/\b살전\s*(\d+)/g, "데살로니가전서 $1")
    .replace(/\b살후\s*(\d+)/g, "데살로니가후서 $1")
    .replace(/\b딤전\s*(\d+)/g, "디모데전서 $1")
    .replace(/\b딤후\s*(\d+)/g, "디모데후서 $1")
    .replace(/\b벧전\s*(\d+)/g, "베드로전서 $1")
    .replace(/\b벧후\s*(\d+)/g, "베드로후서 $1")
    .replace(/\b요일\s*(\d+)/g, "요한일서 $1")
    .replace(/\b요이\s*(\d+)/g, "요한이서 $1")
    .replace(/\b요삼\s*(\d+)/g, "요한삼서 $1");

  return corrected.replace(/\s+/g, " ").trim();
}

function cleanSubtitles(raw: string): string {
  // Split into cue blocks
  const lines = raw.split("\n");
  const textLines: string[] = [];
  let prevLine = "";

  for (const line of lines) {
    // Skip VTT header, timestamps, position markers, empty lines
    if (
      line.startsWith("WEBVTT") ||
      line.startsWith("Kind:") ||
      line.startsWith("Language:") ||
      line.startsWith("NOTE") ||
      /^\d{2}:\d{2}/.test(line) ||
      /^align:/.test(line) ||
      /position:\d+%/.test(line) ||
      line.trim() === ""
    ) {
      continue;
    }

    // Clean the text line
    let cleaned = line
      .replace(/align:start\s*/g, "")
      .replace(/position:\d+%\s*/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&gt;/g, "")
      .replace(/&lt;/g, "")
      .replace(/&amp;/g, "&")
      .replace(/\[음악\]/g, "")
      .replace(/\[박수\]/g, "")
      .replace(/\[웃음\]/g, "")
      .trim();

    // Skip empty lines and collapse progressive duplicate subtitles.
    if (!cleaned) continue;
    if (cleaned === prevLine) continue;

    const lastIndex = textLines.length - 1;
    const lastLine = lastIndex >= 0 ? textLines[lastIndex] : "";
    if (lastLine && cleaned.startsWith(lastLine)) {
      textLines[lastIndex] = cleaned;
      prevLine = cleaned;
      continue;
    }
    if (lastLine && lastLine.startsWith(cleaned)) {
      continue;
    }

    textLines.push(cleaned);
    prevLine = cleaned;
  }

  const merged = textLines.join(" ").replace(/\s+/g, " ").trim();
  return applyBibleAwareCorrections(merged);
}

export function getVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
