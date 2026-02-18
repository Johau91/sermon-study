# Changelog

## 2026-02-18 — sqlite-vec 통합 + 임베딩 생성
- sqlite-vec 확장 추가: `vec_chunks` 가상 테이블로 KNN 벡터 검색
- `vectorSearch()` 브루트포스 → sqlite-vec MATCH 쿼리 교체
- `hybridSearch()` vec_chunks 기준으로 임베딩 존재 체크
- 임베딩 모델 gemma3:4b → all-minilm (384차원, 전용 임베딩 모델)
- 173개 청크 전체 임베딩 생성 완료 (chunks.embedding BLOB + vec_chunks 듀얼 저장)
- FTS 트리거 버그 수정: `chunks_au`가 embedding UPDATE 시에도 발동 → `UPDATE OF content` 제한
- `generate-embeddings.ts`: syncVecChunks 마이그레이션 함수 추가
- 수정 파일: `package.json`, `next.config.ts`, `src/lib/db.ts`, `src/lib/search.ts`, `src/lib/embeddings.ts`, `scripts/generate-embeddings.ts`

## 2026-02-18 — 채팅 UI 수정
- 채팅 자동 스크롤: shadcn/ui ScrollArea viewport 문제 → scrollIntoView sentinel 방식
- FTS5 문법 오류 수정: buildFtsQuery() 특수문자 sanitize
- 채팅 raw JSON 표시 버그: NDJSON 파싱 로직 추가
