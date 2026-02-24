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

## 완료된 작업 (2026-02-24)
- **Convex + OpenRouter 마이그레이션 전체 완료**
  - Phase 0-5: 스키마, 백엔드, 프론트엔드, 마이그레이션, 정리 모두 완료
- **데이터 마이그레이션 완료**: 설교 3,882, 청크 ~61,589, 성경 30,929, 채팅 196, 퀴즈 4, 설정 2
- **임베딩 생성 완료**: 전체 청크 임베딩 생성됨 (text-embedding-3-small, 1536차원)
- **Vercel 배포 완료**: https://sermon-study-sigma.vercel.app

## 최근 작업 (2026-02-25)
- **ASR 정규식 패턴 대량 추가**: 39 → 98개 패턴 확장, 전체 3,882개 설교 reprocess 완료
  - 사탄/마귀(3), 강건(3), 교회/직함(7), 주의 사자(4), 기도문(8), 일반 단어(21), 노이즈 태그(3) 등
  - `송도`→`성도` false positive 수정: `(?<![가-힣])송도` lookbehind 적용
  - `연체`→`연세` 제거 (일반 단어 충돌), 대신 `연체중앙`/`연체 교회` 특정 패턴으로 교체
- **NAS 음원 → Whisper → Convex 파이프라인 구현**
  - `convex/transcriptCleanupHelpers.ts`: `getNasAudioPage`, `saveNasTranscript` 추가
  - `convex/transcriptCleanup.ts`: `getNasSermons`, `saveNasTranscript` action 추가
  - `scripts/nas_whisper_convex.py`: Whisper 전사 → Convex 저장 스크립트

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
- [ ] `python3 scripts/nas_whisper_convex.py --limit 2` 테스트 전사 실행
- [ ] 전체 115개 NAS 음원 전사 실행
- [ ] 전체 기능 E2E 테스트

## 알려진 이슈
- 마이그레이션 스크립트 재실행 시 중복 데이터 생성됨 — 이미 데이터가 있는지 확인 필요
