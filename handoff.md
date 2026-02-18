# Handoff - 설교 학습 (sermon-study)

## 현재 상태
- Next.js 16.1.6 App Router 프로젝트 (pnpm dev 실행 중)
- Tech: React 19, Tailwind CSS 4, shadcn/ui, SQLite (better-sqlite3 + sqlite-vec), Ollama
- 설교 5개 수집 완료, 173개 청크 생성 완료, 173개 임베딩 생성 완료
- AI 채팅 (RAG + FTS + 벡터 하이브리드 검색), 퀴즈, 대시보드 동작 확인
- 임베딩 모델: all-minilm (384차원), sqlite-vec KNN 검색 활성

## 최근 작업
- sqlite-vec 통합: 브루트포스 벡터 검색 → sqlite-vec MATCH KNN 검색으로 교체
  - `sqlite-vec` 패키지 설치, `next.config.ts`/`package.json` 설정
  - `db.ts`: sqlite-vec 확장 로드 + `vec_chunks` 가상 테이블 생성
  - `search.ts`: `vectorSearch()` → vec_chunks MATCH 쿼리, `hybridSearch()` vec_chunks 기준 체크
  - `generate-embeddings.ts`: 듀얼 인서트 (chunks.embedding BLOB + vec_chunks) + syncVecChunks 마이그레이션
  - `embeddings.ts`: 모델 gemma3:4b → all-minilm 변경, 500자 truncation 추가
  - FTS 트리거 버그 수정: `chunks_au`가 embedding UPDATE 시에도 발동 → `UPDATE OF content` 제한
  - vec_chunks PK는 BigInt으로 전달 필요 (better-sqlite3 + sqlite-vec 호환)

## 알려진 이슈
- Node.js 25.2.1에서 tsx + ESM 조합 시 OOM 발생 (CJS `node -e`는 정상)
- all-minilm 컨텍스트 길이 제한: 256 토큰, 한글 ~500자 truncation 적용 중

## TODO
- [ ] `pnpm install-scheduler` 로 스케줄러 설치
- [ ] 다크 모드 토글 버튼 추가
- [ ] 설교 상세 페이지 (sermons/[id]) UI 확인
