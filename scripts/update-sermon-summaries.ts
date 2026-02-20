import { getDb } from "../src/lib/db";
import { readFileSync } from "fs";

// Read summaries from file or stdin
// Format: [{ "id": 123, "summary": "...", "tags": "..." }, ...]
const input = process.argv[2]
  ? readFileSync(process.argv[2], "utf-8")
  : readFileSync(0, "utf-8");

const summaries: { id: number; summary: string; tags?: string }[] =
  JSON.parse(input);

const db = getDb();
const updateBoth = db.prepare(
  "UPDATE sermons SET summary = ?, tags = ? WHERE id = ?"
);
const updateSummary = db.prepare(
  "UPDATE sermons SET summary = ? WHERE id = ?"
);

const tx = db.transaction(() => {
  for (const s of summaries) {
    if (s.tags) {
      updateBoth.run(s.summary, s.tags, s.id);
    } else {
      updateSummary.run(s.summary, s.id);
    }
  }
});
tx();

console.log(`Updated ${summaries.length} sermon summaries`);
