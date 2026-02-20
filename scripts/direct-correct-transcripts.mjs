import path from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const DB_PATH = path.join(process.cwd(), "data", "sermons.db");
const db = new Database(DB_PATH);
sqliteVec.load(db);

const REPLACEMENTS = [
  [/또 내가 보사가/g, "또 내가 보매"],
  [/큰 세상들을/g, "큰 쇠사슬을"],
  [/곧 예배요/g, "곧 옛 뱀이요"],
  [/마귀로 사라 자가/g, "마귀요 사탄이라"],
  [/1천년 동안 결락하여/g, "천 년 동안 결박하여"],
  [/부적에/g, "무저갱에"],
  [/먼저 꾸고/g, "던져 넣고"],
  [/그 위에 포하여/g, "그 위에 인봉하여"],
  [/다시는만을/g, "다시는 만국을"],
  [/잠깐리라/g, "잠깐 놓이리라"],
  [/또 내가 자들을 보니/g, "또 내가 보좌들을 보니"],
  [/거기 이 앉은 자들이/g, "거기에 앉은 자들이"],

  [/예베소서/g, "에베소서"],
  [/윤석전목사/g, "윤석전 목사"],
  [/요한\s*계시록/g, "요한계시록"],
  [/이방이과 것을 행같이/g, "이방인이 그 마음의 허망한 것으로 행함 같이"],
  [/저희 병이 어두워지고/g, "저희 총명이 어두워지고"],
  [/지함과/g, "무지함과"],
  [/굳어지로/g, "굳어짐으로"],

  [/\s+/g, " "],
];

function applyDirectCorrections(text) {
  let out = String(text || "");
  for (const [pattern, repl] of REPLACEMENTS) {
    out = out.replace(pattern, repl);
  }
  return out.trim();
}

function applyPerSermonCorrections(sermonId, text) {
  let out = text;

  if (sermonId === 1) {
    out = out.replace(
      /시작\.[\s\S]*?심판하는 권세를 받았다\./,
      "시작. 또 내가 보매 천사가 무저갱의 열쇠와 큰 쇠사슬을 그 손에 가지고 하늘로부터 내려와서 용을 잡으니 곧 옛 뱀이요 마귀요 사탄이라 잡아 천 년 동안 결박하여 무저갱에 던져 넣어 잠그고 그 위에 인봉하여 천 년이 차도록 다시는 만국을 미혹하지 못하게 하였는데 그 후에는 반드시 잠깐 놓이리라. 또 내가 보좌들을 보니 거기에 앉은 자들이 있어 심판하는 권세를 받았더라."
    );
  }

  if (sermonId === 2) {
    out = out.replace(
      /17절에서 24절 시작\.[\s\S]*?새 사람이라\.?/,
      "17절에서 24절 시작. 그러므로 내가 이것을 말하며 주 안에서 증언하노니 이제부터 너희는 이방인이 그 마음의 허망한 것으로 행함 같이 행하지 말라. 저희 총명이 어두워지고 저희 가운데 있는 무지함과 저희 마음이 굳어짐으로 말미암아 하나님의 생명에서 떠나 있도다. 저희가 감각 없는 자 되어 자신을 방탕에 방임하여 모든 더러운 것을 욕심으로 행하되 오직 너희는 그리스도를 이같이 배우지 아니하였느니라. 진리가 예수 안에 있는 것 같이 너희가 과연 그에게서 듣고 또한 그 안에서 가르침을 받았을진대 너희는 유혹의 욕심을 따라 썩어져 가는 구습을 좇는 옛사람을 벗어 버리고 오직 심령으로 새롭게 되어 하나님을 따라 의와 진리의 거룩함으로 지으심을 받은 새 사람을 입으라."
    );
  }

  if (sermonId === 3) {
    out = out.replace(
      /시작\.[\s\S]*?아멘\./,
      "시작. 이 일 후에 다른 천사가 하늘에서 내려오는 것을 보니 큰 권세를 가졌는데 그의 영광으로 땅이 환하여지더라. 힘센 음성으로 외쳐 이르되 무너졌도다 무너졌도다 큰 성 바벨론이여 귀신의 처소와 각종 더러운 영이 모이는 곳과 각종 더럽고 가증한 새가 모이는 곳이 되었도다. 그 음행의 진노의 포도주로 말미암아 만국이 무너졌으며 또 땅의 왕들이 그와 더불어 음행하였으며 땅의 상인들도 그 사치의 세력으로 치부하였도다 하더라. 또 내가 하늘에서 다른 음성을 들으니 이르되 내 백성아 거기서 나와 그의 죄에 참예하지 말고 그가 받을 재앙들을 받지 말라. 그 죄는 하늘에 사무쳤으며 하나님은 그의 불의한 일을 기억하신지라. 그가 준 그대로 그에게 주고 그의 행위대로 갑절을 갚아 주며 그의 섞은 잔에도 갑절이나 섞어 그에게 주라."
    );
  }

  if (sermonId === 4) {
    out = out.replace(
      /예레미야 29장 11절로 14절[\s\S]*?하셨느니라\./,
      "예레미야 29장 11절로 14절을 봉독합니다. 나 여호와가 말하노라 너희를 향한 나의 생각은 내가 아나니 재앙이 아니라 곧 평안이요 너희 장래에 소망을 주려 하는 생각이라. 너희는 내게 부르짖으며 와서 내게 기도하면 내가 너희를 들을 것이요. 너희가 전심으로 나를 찾고 찾으면 나를 만나리라. 나 여호와가 말하노라 내가 너희에게 만나지겠고 너희를 포로된 중에서 다시 돌아오게 하되 내가 쫓아보내었던 열방과 모든 곳에서 모아 사로잡혀 떠나게 하였던 본 곳으로 돌아오게 하리라."
    );
  }

  if (sermonId === 5) {
    out = out.replace(
      /시작\.[\s\S]*?기차 송하라/,
      "시작. 그런즉 너희가 어떻게 행할 것을 자세히 주의하여 지혜 없는 자 같이 하지 말고 오직 지혜 있는 자 같이 하여 세월을 아끼라 때가 악하니라. 그러므로 어리석은 자가 되지 말고 오직 주의 뜻이 무엇인가 이해하라. 술 취하지 말라 이는 방탕한 것이니 오직 성령의 충만을 받으라. 시와 찬미와 신령한 노래들로 서로 화답하며 너희의 마음으로 주께 노래하며 찬송하며 범사에 우리 주 예수 그리스도의 이름으로 항상 아버지 하나님께 감사하며 그리스도를 경외함으로 피차 복종하라"
    );
  }

  return out;
}

function chunkText(text, chunkSize = 800, overlap = 150) {
  if (!text || text.trim().length === 0) return [];
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= chunkSize) return [{ index: 0, content: cleaned }];

  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < cleaned.length) {
    let end = start + chunkSize;
    if (end < cleaned.length) {
      const segment = cleaned.slice(start, end);
      const lastPeriod = Math.max(
        segment.lastIndexOf(". "),
        segment.lastIndexOf("다. "),
        segment.lastIndexOf("요. "),
        segment.lastIndexOf("! "),
        segment.lastIndexOf("? ")
      );
      if (lastPeriod > chunkSize * 0.5) end = start + lastPeriod + 2;
    } else {
      end = cleaned.length;
    }
    chunks.push({ index, content: cleaned.slice(start, end).trim() });
    if (end >= cleaned.length) break;
    start = end - overlap;
    index += 1;
  }

  return chunks;
}

function dropChunkTriggers() {
  db.exec(`
    DROP TRIGGER IF EXISTS chunks_ai;
    DROP TRIGGER IF EXISTS chunks_ad;
    DROP TRIGGER IF EXISTS chunks_au;
  `);
}

function rebuildFtsAndTriggers() {
  db.exec(`
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
  `);
}

function main() {
  const sermons = db.prepare("SELECT id, title, transcript_raw FROM sermons ORDER BY id ASC").all();
  const selectChunkIds = db.prepare("SELECT id FROM chunks WHERE sermon_id = ? ORDER BY id");
  const deleteChunks = db.prepare("DELETE FROM chunks WHERE sermon_id = ?");
  const updateTranscript = db.prepare("UPDATE sermons SET transcript_raw = ? WHERE id = ?");
  const insertChunk = db.prepare("INSERT INTO chunks (sermon_id, chunk_index, content) VALUES (?, ?, ?)");

  let updated = 0;

  dropChunkTriggers();
  try {
    const tx = db.transaction(() => {
      for (const sermon of sermons) {
        const raw = String(sermon.transcript_raw || "");
        if (!raw.trim() || raw.startsWith("[youtube]")) continue;

        const corrected = applyPerSermonCorrections(
          sermon.id,
          applyDirectCorrections(raw)
        );
        if (corrected === raw.trim()) continue;

        const oldChunkIds = selectChunkIds.all(sermon.id).map((r) => Number(r.id));
        if (oldChunkIds.length > 0) {
          const placeholders = oldChunkIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM vec_chunks WHERE chunk_id IN (${placeholders})`).run(...oldChunkIds);
        }

        deleteChunks.run(sermon.id);
        updateTranscript.run(corrected, sermon.id);
        const chunks = chunkText(corrected);
        for (const c of chunks) insertChunk.run(sermon.id, c.index, c.content);

        updated += 1;
      }
    });
    tx();
  } finally {
    rebuildFtsAndTriggers();
  }

  console.log(`Updated sermons: ${updated}`);
}

main();
