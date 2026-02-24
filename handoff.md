# Handoff - 설교 학습 (sermon-study)

## 현재 상태
- **브랜치**: main
- **빌드**: ✅ 성공 (Next.js 16.1.6 + Convex)
- **Convex**: `dev:zealous-orca-689` (team: saranghaeyo-junim)
- **Vercel**: ✅ 배포 완료 → https://sermon-study-sigma.vercel.app

## 스택 (마이그레이션 완료)
- **이전**: SQLite + Qdrant(로컬) + Ollama(로컬) → 로컬 전용
- **현재**: **Convex**(DB+벡터+FTS) + **OpenRouter**(AI) + **Vercel**(배포) → 클라우드
- Next.js 16.1.6, React 19, Tailwind CSS 4, shadcn/ui
- 설교 3,882개, 청크 ~61,589개, 개역한글 성경 30,929절

## 최근 작업 (2026-02-25)
- **transcripts 테이블 분리 (대역폭 최적화) — 완료**
  - `transcripts` 테이블 추가 (sermonId, transcriptRaw, transcriptCorrected)
  - 모든 read/write → transcripts 테이블 사용 (sermon 필드에 fallback)
  - 마이그레이션 완료: 3882개 설교의 transcript 데이터 → transcripts 테이블 복사됨
  - `hasTranscript` 플래그 sermons 테이블에 추가
  - **효과**: list, recent, listTags 등 목록 쿼리에서 ~60KB/건 절감

## 주요 파일 구조
```
convex/
  schema.ts, sermons.ts, search.ts, searchHelpers.ts
  openrouter.ts, chat.ts, http.ts, quiz.ts
  bible.ts, settings.ts, migration.ts
  embeddings.ts, embeddingsHelpers.ts
  transcriptCleanup.ts, transcriptCleanupHelpers.ts
  llmCorrectionHelpers.ts
  lib/bibleParser.ts, lib/asrPatterns.ts
src/
  components/convex-provider.tsx, theme-provider.tsx, nav-bar.tsx
  lib/preferences.ts
  app/ (page.tsx, sermons/, chat/, study/, settings/)
scripts/
  migrate-to-convex.ts
```

## 다음 TODO
- [ ] Vercel 재배포 (프론트엔드 변경 없지만 확인용)
- [ ] Convex 대시보드 → Database Bandwidth 감소 확인
- [ ] (향후) sermons 테이블에서 transcriptRaw/transcriptCorrected 필드 데이터 정리

## 알려진 이슈
- 마이그레이션 스크립트 재실행 시 중복 데이터 생성됨 — 이미 데이터가 있는지 확인 필요
- sermons 테이블에 아직 구 transcript 데이터 남아있음 (fallback용, 대역폭 절감 효과는 transcripts 테이블 분리로 이미 달성)
