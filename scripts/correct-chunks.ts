import { getDb } from "../src/lib/db";
import { readFileSync } from "fs";

// Read corrections from stdin or file argument
const input = process.argv[2]
  ? readFileSync(process.argv[2], "utf-8")
  : readFileSync(0, "utf-8");

const corrections: { id: number; content: string }[] = JSON.parse(input);

const db = getDb();

// FTS trigger causes SQL logic error on content update — rebuild FTS manually
const tx = db.transaction(() => {
  db.exec("DROP TRIGGER IF EXISTS chunks_au");
  const update = db.prepare("UPDATE chunks SET content = ? WHERE id = ?");
  const ftsDel = db.prepare(
    "DELETE FROM chunks_fts WHERE rowid = ?"
  );
  const ftsIns = db.prepare(
    "INSERT INTO chunks_fts(rowid, content) VALUES (?, ?)"
  );
  for (const c of corrections) {
    ftsDel.run(c.id);
    update.run(c.content, c.id);
    ftsIns.run(c.id, c.content);
  }
  // Restore trigger
  db.exec(`
    CREATE TRIGGER chunks_au AFTER UPDATE OF content ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END
  `);
});
tx();

console.log(`Updated ${corrections.length} chunks`);
