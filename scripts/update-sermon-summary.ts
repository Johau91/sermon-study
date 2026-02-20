import { getDb } from "../src/lib/db";

const sermonId = Number(process.argv[2]);
const summary = process.argv[3];
const tags = process.argv[4];

if (!sermonId || !summary) {
  console.error(
    "Usage: tsx scripts/update-sermon-summary.ts <sermon_id> <summary> [tags]"
  );
  process.exit(1);
}

const db = getDb();

if (tags) {
  db.prepare("UPDATE sermons SET summary = ?, tags = ? WHERE id = ?").run(
    summary,
    tags,
    sermonId
  );
} else {
  db.prepare("UPDATE sermons SET summary = ? WHERE id = ?").run(
    summary,
    sermonId
  );
}

console.log(`Updated sermon ${sermonId}`);
