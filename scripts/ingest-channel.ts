import { mkdirSync } from "fs";
import path from "path";
import { getChannelVideos, getTranscript } from "../src/lib/youtube";
import { chunkText } from "../src/lib/chunker";
import { getDb } from "../src/lib/db";

// Ensure data directory exists
mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  let source = "@yonsei1986";
  let max = 50;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--channel" && args[i + 1]) {
      source = args[i + 1];
      i++;
    } else if (args[i] === "--playlist" && args[i + 1]) {
      source = args[i + 1];
      i++;
    } else if (args[i] === "--max" && args[i + 1]) {
      max = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { source, max };
}

async function main() {
  const { source, max } = parseArgs();
  console.log(`Fetching videos from ${source} (max: ${max})...\n`);

  const videos = await getChannelVideos(source, max);
  console.log(`Found ${videos.length} videos.\n`);

  const db = getDb();
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

  let added = 0;
  let skipped = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    console.log(`Processing [${i + 1}/${videos.length}] ${video.title}...`);

    // Check if already exists
    const existing = checkExists.get(video.id) as { id: number } | undefined;
    if (existing) {
      console.log(`  -> Skipped (already exists)\n`);
      skipped++;
      continue;
    }

    // Download transcript
    const transcript = await getTranscript(video.id);
    if (!transcript) {
      console.log(`  -> Skipped (no transcript available)\n`);
      skipped++;
      continue;
    }

    // Insert sermon
    const result = insertSermon.run(
      video.id,
      video.title,
      video.published_at,
      transcript
    );
    const sermonId = result.lastInsertRowid as number;

    if (sermonId) {
      // Chunk transcript and save
      const chunks = chunkText(transcript);
      for (const chunk of chunks) {
        insertChunk.run(sermonId, chunk.index, chunk.content);
      }
      console.log(`  -> Added (${chunks.length} chunks)\n`);
      added++;
    } else {
      console.log(`  -> Skipped (insert failed)\n`);
      skipped++;
    }
  }

  console.log(`\nDone! Added ${added} new sermons, skipped ${skipped} existing.`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
