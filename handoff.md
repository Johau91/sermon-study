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
- **비슷한 설교 추천 + 본문 검색 하이라이트**
  - `convex/similar.ts`: summary 임베딩 → 벡터 유사도 기반 3개 추천 액션
  - `src/components/similar-sermons.tsx`: 추천 카드 UI (제목+요약+태그, 클릭→이동)
  - `src/components/transcript-search.tsx`: 본문 텍스트 검색, 하이라이트, ↑/↓ 매치 네비게이션
  - 설교 상세 페이지에 두 컴포넌트 통합

## 주요 파일 구조
```
convex/
  schema.ts, sermons.ts, search.ts, searchHelpers.ts
  openrouter.ts, chat.ts, http.ts, quiz.ts
  bible.ts, settings.ts, migration.ts
  embeddings.ts, embeddingsHelpers.ts
  lib/bibleParser.ts
src/
  components/convex-provider.tsx, theme-provider.tsx, nav-bar.tsx
  lib/preferences.ts
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
