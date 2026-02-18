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
  // Use yt-dlp to get auto-generated subtitles via stdout
  try {
    const raw = execSync(
      `yt-dlp --write-auto-sub --sub-lang ko --sub-format vtt --skip-download --print-to-file "after_move:filepath" /dev/stderr -o "/tmp/yt-sub-%(id)s" "https://www.youtube.com/watch?v=${videoId}" 2>/dev/null && cat "/tmp/yt-sub-${videoId}.ko.vtt" && rm -f "/tmp/yt-sub-${videoId}"*`,
      { encoding: "utf-8", timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
    );
    if (!raw || raw.trim().length < 100) return null;
    return cleanSubtitles(raw);
  } catch {
    return null;
  }
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

    // Skip empty or duplicate lines
    if (cleaned && cleaned !== prevLine) {
      textLines.push(cleaned);
      prevLine = cleaned;
    }
  }

  return textLines.join(" ").replace(/\s+/g, " ").trim();
}

export function getVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
