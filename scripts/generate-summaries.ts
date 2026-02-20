import { mkdirSync } from "fs";
import path from "path";
import { getDb } from "../src/lib/db";
import { generateSummary, generateTags } from "../src/lib/ai";

// Ensure data directory exists
mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

const COMMIT_EVERY = 50;

async function main() {
  const forceFlag = process.argv.includes("--force");
  const db = getDb();

  // Get sermons that need summaries
  const whereClause = forceFlag
    ? ""
    : "WHERE summary IS NULL OR tags IS NULL";

  const sermons = db
    .prepare(
      `SELECT s.id, s.title, GROUP_CONCAT(c.content, '\n') as transcript
       FROM sermons s
       LEFT JOIN chunks c ON c.sermon_id = s.id
       ${whereClause}
       GROUP BY s.id
       HAVING transcript IS NOT NULL
       ORDER BY s.id`
    )
    .all() as { id: number; title: string; transcript: string }[];

  if (sermons.length === 0) {
    console.log("All sermons already have summaries and tags!");
    return;
  }

  console.log(
    `Generating summaries/tags for ${sermons.length} sermons...\n`
  );

  const updateSummary = db.prepare(
    `UPDATE sermons SET summary = ?, tags = ? WHERE id = ?`
  );

  let completed = 0;
  let failed = 0;

  for (const sermon of sermons) {
    try {
      const summary = await generateSummary(sermon.title, sermon.transcript);
      const tags = await generateTags(sermon.title, sermon.transcript);

      updateSummary.run(summary, tags, sermon.id);
      completed++;

      // Progress display
      const pct = Math.round((completed / sermons.length) * 100);
      process.stdout.write(
        `\r  ${pct}% (${completed}/${sermons.length}) - ${sermon.title.slice(0, 40)}...`
      );

      if (completed % COMMIT_EVERY === 0) {
        console.log(` [checkpoint @ ${completed}]`);
      }
    } catch (err) {
      failed++;
      console.error(`\n  Failed sermon ${sermon.id} (${sermon.title}): ${err}`);
    }
  }

  console.log(
    `\n\nDone! Generated summaries for ${completed} sermons, ${failed} failed.`
  );
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
