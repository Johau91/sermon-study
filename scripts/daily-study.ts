import { mkdirSync } from "fs";
import path from "path";
import { getDb } from "../src/lib/db";
import { generateQuiz } from "../src/lib/ai";
import { sendNotification } from "../src/lib/notify";

// Ensure data directory exists
mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

async function main() {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];

  // Check if today's study already exists
  const existingStudy = db
    .prepare(`SELECT id FROM daily_study WHERE date = ?`)
    .get(today) as { id: number } | undefined;

  if (existingStudy) {
    console.log(`Today's study (${today}) already exists. Skipping.`);
    return;
  }

  // Select next sermon to study:
  // 1. One that has never been in daily_study
  // 2. Or the least recently studied one
  const sermon = db
    .prepare(
      `SELECT s.id, s.title, s.transcript_raw
       FROM sermons s
       LEFT JOIN daily_study ds ON ds.sermon_id = s.id
       WHERE s.transcript_raw IS NOT NULL
       ORDER BY ds.date IS NULL DESC, ds.date ASC
       LIMIT 1`
    )
    .get() as
    | { id: number; title: string; transcript_raw: string }
    | undefined;

  if (!sermon) {
    console.log("No sermons available for study. Run ingest first.");
    return;
  }

  console.log(`Selected sermon: ${sermon.title}`);
  console.log("Generating quiz questions...\n");

  // Generate quiz questions
  const questions = await generateQuiz(
    sermon.title,
    sermon.transcript_raw,
    3
  );

  // Save to daily_study table
  db.prepare(
    `INSERT INTO daily_study (date, sermon_id, topic, questions)
     VALUES (?, ?, ?, ?)`
  ).run(today, sermon.id, sermon.title, JSON.stringify(questions));

  console.log(`Daily study saved for ${today}:`);
  console.log(`  Sermon: ${sermon.title}`);
  console.log(`  Questions: ${questions.length}`);
  questions.forEach((q, i) => {
    console.log(`    ${i + 1}. ${q.question}`);
  });

  // Send macOS notification
  const studyUrl = `http://localhost:3000/study?sermonId=${sermon.id}`;
  sendNotification(
    "설교 학습 시간입니다",
    `오늘의 설교: ${sermon.title}`,
    studyUrl
  );

  console.log(`\nNotification sent! Open: ${studyUrl}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
