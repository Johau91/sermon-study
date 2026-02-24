# Handoff - 설교 학습 (sermon-study)

## 현재 상태
- **브랜치**: main
- **빌드**: ✅ 성공 (Next.js 16.1.6 + Convex)
- **Convex**: `dev:zealous-orca-689` (team: saranghaeyo-junim)

## 스택 (마이그레이션 완료)
- **이전**: SQLite + Qdrant(로컬) + Ollama(로컬) → 로컬 전용
- **현재**: **Convex**(DB+벡터+FTS) + **OpenRouter**(AI) + **Vercel**(배포) → 클라우드
- Next.js 16.1.6, React 19, Tailwind CSS 4, shadcn/ui
- 설교 3,882개, 청크 62,277개, 개역한글 성경 30,929절

## 최근 작업 (2026-02-24)
- **Convex + OpenRouter 마이그레이션 완료**
  - Phase 0: Convex 초기화, ConvexClientProvider, layout.tsx 연결
  - Phase 1: 8테이블 스키마 (sermons, chunks, chatMessages, quizRecords, dailyStudy, studySessions, bibleVerses, appSettings)
  - Phase 2: Convex 백엔드 함수 13개 파일 (sermons, search, openrouter, chat, http, quiz, bible, settings, migration, embeddings + helpers)
  - Phase 3: 전 프론트엔드 페이지 Convex 훅으로 전환 (useQuery/useMutation/useAction)
  - Phase 4: 마이그레이션 스크립트 (`scripts/migrate-to-convex.ts`)
  - Phase 5: 레거시 삭제 (API routes 10개, lib 6개, 의존성 3개)

## 주요 파일 구조
```
convex/
  schema.ts, sermons.ts, search.ts, searchHelpers.ts
  openrouter.ts, chat.ts, http.ts, quiz.ts
  bible.ts, settings.ts, migration.ts
  embeddings.ts, embeddingsHelpers.ts
  lib/bibleParser.ts
src/
  components/convex-provider.tsx
  app/ (page.tsx, sermons/, chat/, study/, settings/)
scripts/
  migrate-to-convex.ts
```

## 다음 TODO
- [ ] **Convex 대시보드에 환경변수 설정**: `OPENROUTER_API_KEY`, `OPENROUTER_EMBED_MODEL`, `OPENROUTER_CHAT_MODEL`
- [ ] **데이터 마이그레이션**: `pnpm migrate` (SQLite → Convex)
- [ ] **임베딩 생성**: `npx convex run embeddings:processEmbeddingBatch` (64K 청크, ~$0.13)
- [ ] **Vercel 배포**: 환경변수 `NEXT_PUBLIC_CONVEX_URL` 설정 후 배포
- [ ] 마이그레이션 후 데이터 건수 확인 (설교 3,882, 청크 62,277, 성경 30,929)
- [ ] 전체 기능 E2E 테스트 (검색, 채팅 스트리밍, 퀴즈, 설정)

## 알려진 이슈
- 데이터 아직 마이그레이션 안됨 — Convex DB 비어있음
- OpenRouter API 키 미설정 — AI 기능 미동작
- 벡터 인덱스 빌드 필요 — 임베딩 생성 후 하이브리드 검색 가능
