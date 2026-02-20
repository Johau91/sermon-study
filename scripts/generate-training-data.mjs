#!/usr/bin/env node
/**
 * 설교 DB에서 LoRA 학습용 Q&A 데이터를 생성한다.
 *
 * Usage: node scripts/generate-training-data.mjs [--target 800]
 * Output: data/training/train.jsonl, data/training/valid.jsonl
 */

import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'data', 'sermons.db');
const OUT_DIR = join(process.cwd(), 'data', 'training');

const TARGET = parseInt(process.argv.find(a => a.startsWith('--target'))?.split('=')[1] || '3000');
const VALID_RATIO = 0.1;

const SYSTEM_PROMPT = `당신은 연세중앙교회 윤석전 목사의 설교를 학습한 AI 도우미입니다.
항상 한국어로만 답변합니다. 영어로 질문받아도 반드시 한국어로 답변합니다.
설교 내용을 근거로 따뜻하고 친근하게 설명하세요.`;

// ── 타이틀에서 설교 제목 추출 ──
function extractSermonTitle(rawTitle) {
  // "[주일2부 예배] 예수 안에 있는 생명으로 [연세중앙교회 ...]" → "예수 안에 있는 생명으로"
  const m = rawTitle.match(/\]\s*(.+?)\s*(?:\d{4}[-.]?\d{2}[-.]?\d{2}|\[|$)/);
  return m ? m[1].trim() : rawTitle.replace(/\[.*?\]/g, '').trim();
}

// ── 성경 구절 참조 추출 ──
function extractBibleRef(text) {
  const m = text.match(/(창세기|출애굽기|레위기|민수기|신명기|여호수아|사사기|룻기|사무엘상|사무엘하|열왕기상|열왕기하|역대상|역대하|에스라|느헤미야|에스더|욥기|시편|잠언|전도서|아가|이사야|예레미야|예레미야애가|에스겔|다니엘|호세아|요엘|아모스|오바댜|요나|미가|나훔|하박국|스바냐|학개|스가랴|말라기|마태복음|마가복음|누가복음|요한복음|사도행전|로마서|고린도전서|고린도후서|갈라디아서|에베소서|빌립보서|골로새서|데살로니가전서|데살로니가후서|디모데전서|디모데후서|디도서|빌레몬서|히브리서|야고보서|베드로전서|베드로후서|요한일서|요한이서|요한삼서|유다서|요한계시록)\s*(\d+)\s*장\s*(\d+)\s*절/);
  if (m) return { book: m[1], chapter: m[2], verse: m[3] };
  return null;
}

// ── 청크에서 핵심 문장 추출 (설교체 문장) ──
function extractKeySentences(content, maxLen = 500) {
  const sentences = content.split(/(?<=[.!?다요])\s+/).filter(s => s.length > 20 && s.length < 200);
  const key = sentences.filter(s =>
    /아멘|하나님|예수|성령|믿음|사랑|소망|은혜|축복|기도|말씀|구원|생명|천국|부활|십자가|복음|감사/.test(s)
  );
  const selected = key.length > 0 ? key : sentences;
  let result = '';
  for (const s of selected) {
    if ((result + ' ' + s).length > maxLen) break;
    result += (result ? ' ' : '') + s;
  }
  return result || content.substring(0, maxLen);
}

// ── 주제 키워드 목록 ──
const TOPICS = [
  { keywords: ['사랑', '하나님의 사랑', '서로 사랑'], topic: '사랑' },
  { keywords: ['믿음', '신앙'], topic: '믿음' },
  { keywords: ['기도', '간구', '통성기도'], topic: '기도' },
  { keywords: ['소망', '희망', '기대'], topic: '소망' },
  { keywords: ['은혜', '하나님의 은혜'], topic: '은혜' },
  { keywords: ['구원', '구속', '십자가'], topic: '구원' },
  { keywords: ['부활', '영생', '생명'], topic: '부활' },
  { keywords: ['성령', '성령님', '보혜사'], topic: '성령' },
  { keywords: ['천국', '하나님 나라', '영원'], topic: '천국' },
  { keywords: ['회개', '돌이키', '죄'], topic: '회개' },
  { keywords: ['감사', '찬양', '영광'], topic: '감사' },
  { keywords: ['축복', '복', '형통'], topic: '축복' },
  { keywords: ['용서', '화해'], topic: '용서' },
  { keywords: ['겸손', '낮아짐', '섬김'], topic: '겸손' },
  { keywords: ['인내', '참음', '고난'], topic: '인내' },
  { keywords: ['순종', '복종', '말씀대로'], topic: '순종' },
  { keywords: ['전도', '선교', '복음'], topic: '전도' },
  { keywords: ['가정', '부모', '자녀', '부부'], topic: '가정' },
  { keywords: ['교회', '예배', '공동체'], topic: '교회' },
  { keywords: ['치유', '고침', '병'], topic: '치유' },
];

function detectTopics(text) {
  return TOPICS.filter(t => t.keywords.some(k => text.includes(k))).map(t => t.topic);
}

// ── Q&A 생성 함수들 ──

function makeMessage(user, assistant) {
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
      { role: 'assistant', content: assistant },
    ]
  };
}

// 1) 설교 요약형
function generateSummaryQA(sermon, chunks) {
  const results = [];
  const title = extractSermonTitle(sermon.title);
  if (!title || title.length < 3) return results;

  const combined = chunks.slice(0, 5).map(c => c.content).join(' ');
  const key = extractKeySentences(combined, 600);
  if (key.length < 50) return results;

  const questions = [
    `"${title}" 설교의 핵심 메시지가 뭐야?`,
    `"${title}" 설교에서 가장 중요한 내용이 뭐야?`,
    `"${title}" 설교를 요약해줘.`,
  ];
  const q = questions[Math.floor(Math.random() * questions.length)];
  results.push(makeMessage(q, `"${title}" 설교에서 윤석전 목사님은 다음과 같이 말씀하셨습니다.\n\n${key}`));
  return results;
}

// 2) 성경 구절 설명형
function generateBibleQA(chunk) {
  const results = [];
  const ref = extractBibleRef(chunk.content);
  if (!ref) return results;

  const explanation = extractKeySentences(chunk.content, 400);
  if (explanation.length < 50) return results;

  const questions = [
    `${ref.book} ${ref.chapter}장 ${ref.verse}절에 대해 설명해줘.`,
    `${ref.book} ${ref.chapter}장 ${ref.verse}절이 무슨 뜻이야?`,
    `${ref.book} ${ref.chapter}장에 대해 알려줘.`,
  ];
  const q = questions[Math.floor(Math.random() * questions.length)];
  results.push(makeMessage(q, `${ref.book} ${ref.chapter}장 ${ref.verse}절에 대해 윤석전 목사님은 이렇게 설명하셨습니다.\n\n${explanation}`));
  return results;
}

// 3) 주제 질문형
function generateTopicQA(chunk) {
  const results = [];
  const topics = detectTopics(chunk.content);
  if (topics.length === 0) return results;

  const topic = topics[Math.floor(Math.random() * topics.length)];
  const key = extractKeySentences(chunk.content, 500);
  if (key.length < 50) return results;

  const questions = [
    `${topic}에 대해 알려줘.`,
    `${topic}이 뭐야?`,
    `성경에서 ${topic}은 어떤 의미야?`,
    `${topic}에 대한 설교 내용 알려줘.`,
  ];
  const q = questions[Math.floor(Math.random() * questions.length)];
  results.push(makeMessage(q, `${topic}에 대해 윤석전 목사님의 설교에서는 이렇게 말씀하고 있습니다.\n\n${key}`));
  return results;
}

// 4) 적용 질문형
function generateApplicationQA(chunk) {
  const results = [];
  // 적용/실천 관련 키워드가 있는 청크만
  if (!/실천|적용|생활|일상|행동|해야|합시다|삽시다|노력/.test(chunk.content)) return results;

  const topics = detectTopics(chunk.content);
  const topicStr = topics.length > 0 ? topics[0] : '신앙';
  const key = extractKeySentences(chunk.content, 400);
  if (key.length < 50) return results;

  const questions = [
    `${topicStr}을 일상에서 어떻게 실천할 수 있어?`,
    `${topicStr}을 생활에서 어떻게 적용해야 해?`,
    `크리스천으로서 ${topicStr}을 어떻게 실천해야 해?`,
  ];
  const q = questions[Math.floor(Math.random() * questions.length)];
  results.push(makeMessage(q, `${topicStr}의 실천에 대해 윤석전 목사님은 이렇게 말씀하셨습니다.\n\n${key}`));
  return results;
}

// 5) 한국어 전용 강화 — 영어 질문에 한국어로 답변
function generateKoreanOnlyQA(chunk) {
  const results = [];
  const topics = detectTopics(chunk.content);
  if (topics.length === 0) return results;

  const topic = topics[0];
  const key = extractKeySentences(chunk.content, 400);
  if (key.length < 80) return results;

  const englishQuestions = [
    `What does the Bible say about ${topic === '사랑' ? 'love' : topic === '믿음' ? 'faith' : topic === '기도' ? 'prayer' : topic === '소망' ? 'hope' : topic === '은혜' ? 'grace' : topic === '구원' ? 'salvation' : topic === '부활' ? 'resurrection' : topic === '성령' ? 'Holy Spirit' : topic === '천국' ? 'heaven' : topic === '회개' ? 'repentance' : topic}?`,
    `Tell me about ${topic === '사랑' ? 'love' : topic === '믿음' ? 'faith' : topic === '기도' ? 'prayer' : 'faith'} in Christianity.`,
    `What is ${topic === '구원' ? 'salvation' : topic === '부활' ? 'resurrection' : topic === '성령' ? 'the Holy Spirit' : 'grace'}?`,
  ];
  const q = englishQuestions[Math.floor(Math.random() * englishQuestions.length)];
  results.push(makeMessage(q, `${topic}에 대해 윤석전 목사님의 설교를 바탕으로 설명드리겠습니다.\n\n${key}`));
  return results;
}

// 6) 설교 제목 기반 질문
function generateTitleQA(sermon, chunks) {
  const results = [];
  const title = extractSermonTitle(sermon.title);
  if (!title || title.length < 4 || title.length > 30) return results;

  // 제목 자체를 질문으로
  const combined = chunks.slice(1, 4).map(c => c.content).join(' ');
  const key = extractKeySentences(combined, 500);
  if (key.length < 80) return results;

  const questions = [
    `${title}`,
    `${title}에 대해 알려줘.`,
    `${title}이 무슨 뜻이야?`,
  ];
  const q = questions[Math.floor(Math.random() * questions.length)];
  results.push(makeMessage(q, `"${title}"에 대해 윤석전 목사님은 설교에서 다음과 같이 말씀하셨습니다.\n\n${key}`));
  return results;
}

// 7) 청크 직접 Q&A — 설교 내용 자체를 바탕으로 질문/답변
function generateDirectChunkQA(chunk, sermonTitle) {
  const results = [];
  const content = chunk.content;
  if (content.length < 150) return results;

  const key = extractKeySentences(content, 500);
  if (key.length < 80) return results;

  const title = extractSermonTitle(sermonTitle);
  const topics = detectTopics(content);
  const topicStr = topics.length > 0 ? topics[0] : '';

  const questionPool = [
    topicStr ? `윤석전 목사님이 ${topicStr}에 대해 뭐라고 하셨어?` : null,
    topicStr ? `${topicStr}에 대한 윤석전 목사님의 가르침이 뭐야?` : null,
    title ? `"${title}" 설교에서 어떤 말씀을 하셨어?` : null,
    `윤석전 목사님의 설교 내용을 알려줘.`,
    topicStr ? `${topicStr}에 대해 설교에서 어떻게 말씀하셨어?` : null,
  ].filter(Boolean);

  if (questionPool.length === 0) return results;
  const q = questionPool[Math.floor(Math.random() * questionPool.length)];
  results.push(makeMessage(q, `윤석전 목사님은 설교에서 다음과 같이 말씀하셨습니다.\n\n${key}`));
  return results;
}

// 8) 교훈/가르침형
function generateTeachingQA(chunk) {
  const results = [];
  if (!/가르|배우|교훈|깨달|알게|중요|핵심|본질/.test(chunk.content)) return results;

  const key = extractKeySentences(chunk.content, 400);
  if (key.length < 80) return results;

  const topics = detectTopics(chunk.content);
  const topicStr = topics.length > 0 ? topics[0] : '신앙생활';

  const questions = [
    `${topicStr}에서 배울 수 있는 교훈이 뭐야?`,
    `${topicStr}의 핵심 가르침이 뭐야?`,
    `성경에서 ${topicStr}에 대해 가르치는 것이 뭐야?`,
  ];
  const q = questions[Math.floor(Math.random() * questions.length)];
  results.push(makeMessage(q, `${topicStr}에 대한 가르침으로 윤석전 목사님은 이렇게 말씀하셨습니다.\n\n${key}`));
  return results;
}

// 9) 인물/사건형 — 성경 인물이나 사건에 대한 질문
const BIBLE_FIGURES = [
  { names: ['아브라함', '아브람'], figure: '아브라함' },
  { names: ['모세'], figure: '모세' },
  { names: ['다윗', '다비드'], figure: '다윗' },
  { names: ['바울', '사울'], figure: '바울' },
  { names: ['베드로', '시몬'], figure: '베드로' },
  { names: ['엘리야'], figure: '엘리야' },
  { names: ['요셉'], figure: '요셉' },
  { names: ['솔로몬'], figure: '솔로몬' },
  { names: ['이삭'], figure: '이삭' },
  { names: ['야곱'], figure: '야곱' },
  { names: ['여호수아'], figure: '여호수아' },
  { names: ['삼손'], figure: '삼손' },
  { names: ['마리아'], figure: '마리아' },
  { names: ['노아'], figure: '노아' },
  { names: ['요나'], figure: '요나' },
  { names: ['다니엘'], figure: '다니엘' },
];

function generateFigureQA(chunk) {
  const results = [];
  const found = BIBLE_FIGURES.find(f => f.names.some(n => chunk.content.includes(n)));
  if (!found) return results;

  const key = extractKeySentences(chunk.content, 400);
  if (key.length < 80) return results;

  const questions = [
    `${found.figure}에 대해 알려줘.`,
    `성경에서 ${found.figure}은 어떤 사람이야?`,
    `${found.figure}의 이야기를 설명해줘.`,
  ];
  const q = questions[Math.floor(Math.random() * questions.length)];
  results.push(makeMessage(q, `${found.figure}에 대해 윤석전 목사님은 설교에서 이렇게 말씀하셨습니다.\n\n${key}`));
  return results;
}

// 10) 대화 연속형 — 자연스러운 후속 질문
function generateFollowUpQA(chunk) {
  const results = [];
  const topics = detectTopics(chunk.content);
  if (topics.length < 1) return results;

  const key = extractKeySentences(chunk.content, 300);
  if (key.length < 80) return results;

  const topic = topics[0];
  const followUps = [
    { q: `좀 더 자세히 알려줘.`, prefix: `더 자세히 설명드리겠습니다.` },
    { q: `그래서 어떻게 해야 돼?`, prefix: `이에 대해 윤석전 목사님은 이렇게 말씀하셨습니다.` },
    { q: `다른 설교에서도 이런 내용이 있어?`, prefix: `네, 윤석전 목사님은 여러 설교에서 이 주제를 다루셨습니다.` },
  ];
  const f = followUps[Math.floor(Math.random() * followUps.length)];
  results.push(makeMessage(f.q, `${f.prefix}\n\n${key}`));
  return results;
}

// ── 메인 ──
function main() {
  const db = new Database(DB_PATH, { readonly: true });

  console.log('설교 DB에서 학습 데이터 생성 시작...');

  // 2018년 이후 설교 사용 (더 넓은 범위)
  const sermons = db.prepare(`
    SELECT s.id, s.title, s.published_at
    FROM sermons s
    WHERE s.published_at >= '2018-01-01'
      AND s.title NOT LIKE '%English%'
      AND s.title NOT LIKE '%english%'
    ORDER BY RANDOM()
  `).all();

  console.log(`대상 설교: ${sermons.length}개 (2018년 이후)`);

  const getChunks = db.prepare(`
    SELECT id, sermon_id, chunk_index, content
    FROM chunks
    WHERE sermon_id = ?
    ORDER BY chunk_index
  `);

  const allExamples = [];
  const stats = { summary: 0, bible: 0, topic: 0, application: 0, korean: 0, title: 0, direct: 0, teaching: 0, figure: 0, followup: 0 };

  for (const sermon of sermons) {
    const chunks = getChunks.all(sermon.id);
    if (chunks.length < 3) continue;

    // 1) 설교 요약형
    const summaryQAs = generateSummaryQA(sermon, chunks);
    summaryQAs.forEach(qa => { allExamples.push(qa); stats.summary++; });

    // 2) 설교 제목 기반
    const titleQAs = generateTitleQA(sermon, chunks);
    titleQAs.forEach(qa => { allExamples.push(qa); stats.title++; });

    // 3) 청크 기반 (더 많은 청크 샘플링: 6개)
    const sampledChunks = chunks
      .filter(c => c.content.length > 200)
      .sort(() => Math.random() - 0.5)
      .slice(0, 6);

    for (const chunk of sampledChunks) {
      const bibleQAs = generateBibleQA(chunk);
      bibleQAs.forEach(qa => { allExamples.push(qa); stats.bible++; });

      const topicQAs = generateTopicQA(chunk);
      topicQAs.forEach(qa => { allExamples.push(qa); stats.topic++; });

      const appQAs = generateApplicationQA(chunk);
      appQAs.forEach(qa => { allExamples.push(qa); stats.application++; });

      const koQAs = generateKoreanOnlyQA(chunk);
      koQAs.forEach(qa => { allExamples.push(qa); stats.korean++; });

      // 새 유형들
      const directQAs = generateDirectChunkQA(chunk, sermon.title);
      directQAs.forEach(qa => { allExamples.push(qa); stats.direct++; });

      const teachingQAs = generateTeachingQA(chunk);
      teachingQAs.forEach(qa => { allExamples.push(qa); stats.teaching++; });

      const figureQAs = generateFigureQA(chunk);
      figureQAs.forEach(qa => { allExamples.push(qa); stats.figure++; });

      const followUpQAs = generateFollowUpQA(chunk);
      followUpQAs.forEach(qa => { allExamples.push(qa); stats.followup++; });
    }

    if (allExamples.length >= TARGET * 2) break; // 충분히 모이면 중단
  }

  // 셔플 후 타겟 수만큼 자르기
  const shuffled = allExamples.sort(() => Math.random() - 0.5).slice(0, TARGET);

  // 검증 분할
  const validCount = Math.max(1, Math.floor(shuffled.length * VALID_RATIO));
  const valid = shuffled.slice(0, validCount);
  const train = shuffled.slice(validCount);

  // 저장
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'train.jsonl'), train.map(e => JSON.stringify(e)).join('\n') + '\n');
  writeFileSync(join(OUT_DIR, 'valid.jsonl'), valid.map(e => JSON.stringify(e)).join('\n') + '\n');

  db.close();

  console.log('\n=== 학습 데이터 생성 완료 ===');
  console.log(`총 생성: ${shuffled.length}개`);
  console.log(`  학습(train): ${train.length}개`);
  console.log(`  검증(valid): ${valid.length}개`);
  console.log(`\n카테고리별 (전체 ${allExamples.length}개 중):`);
  console.log(`  설교 요약형: ${stats.summary}`);
  console.log(`  설교 제목형: ${stats.title}`);
  console.log(`  성경 구절형: ${stats.bible}`);
  console.log(`  주제 질문형: ${stats.topic}`);
  console.log(`  적용 질문형: ${stats.application}`);
  console.log(`  한국어 강화: ${stats.korean}`);
  console.log(`  청크 직접형: ${stats.direct}`);
  console.log(`  교훈 가르침: ${stats.teaching}`);
  console.log(`  성경 인물형: ${stats.figure}`);
  console.log(`  대화 연속형: ${stats.followup}`);
  console.log(`\n출력: ${OUT_DIR}/train.jsonl, valid.jsonl`);
}

main();
