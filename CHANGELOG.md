# Changelog

## 2026-02-19 — RAG 품질 개선 3단계 구현
- **Phase 1: 임베딩 모델 업그레이드**
  - all-minilm (384차원) → bge-m3 (1024차원, 한국어 포함 100+ 언어)
  - MAX_EMBED_CHARS: 500 → 2000 (bge-m3 8192 토큰 컨텍스트 활용)
  - vec_chunks 자동 마이그레이션: 384차원 테이블 감지 시 DROP→1024차원 재생성
  - generate-embeddings.ts: `--force` 플래그, 10개 배치 처리, 500개 체크포인트
  - `.env.local`: OLLAMA_EMBED_MODEL=bge-m3
- **Phase 2: 시스템 프롬프트 + 컨텍스트 개선**
  - 시스템 프롬프트 마크다운 헤더로 구조화 (역할/스타일/형식/규칙/참고 섹션)
  - 설교 다양성 필터: hybridSearch 10개 → 설교당 max 2청크 → 상위 5개
  - num_ctx: 2048 → 4096 (phi4-mini 3.8B 기준 ~0.5GB 추가)
- **Phase 3: 설교 요약/태그 생성**
  - `generateTags()` 함수 추가 (ai.ts): 5-8개 키워드 추출
  - `generate-summaries.ts` 신규: 요약(3-5문장) + 태그 생성, 50개마다 커밋
  - SearchResult에 sermon_summary, sermon_tags 필드 추가 (FTS/벡터 SQL JOIN)
  - RAG 컨텍스트에 요약/태그 포함: `요약: ... 태그: ...`
- 수정: `embeddings.ts`, `db.ts`, `rag.ts`, `search.ts`, `ai.ts`, `generate-embeddings.ts`, `.env.local`, `package.json`
- 신규: `scripts/generate-summaries.ts`

## 2026-02-19 — 설정 페이지에 AI 모델 선택 드롭다운 추가
- **`/api/models` API 신규**: Ollama `GET /api/tags` 호출 → 모델 목록 반환 `[{ name, size, modified_at }]`
- **`ai.ts` 수정**: `MODEL` 상수 → `getModel()` 함수 (DB `app_settings.ai_model` 키 조회, 기본값 `sermon-ai`)
- **설정 페이지 수정**: 모델 선택 카드 그리드 (기존 스타일 프리셋과 동일 UI 패턴)
  - Ollama 연결 실패 시 에러 메시지 표시
  - 저장 시 `ai_model` 키를 `app_settings` 테이블에 저장
- 수정 파일: `api/models/route.ts`(신규), `lib/ai.ts`, `settings/page.tsx`

## 2026-02-19 — LoRA 파인튜닝 2차 시도 (3,000 데이터, grad-checkpoint)
- **학습 데이터 확장**: 800 → 3,000개 (10가지 QA 유형)
  - 신규 4종: 직접청크/가르침/성경인물/후속질문
  - 날짜 범위: 2020+ → 2018+ (1,803개 설교 활용)
- **LoRA 학습 (2차)**:
  - 1,000 이터레이션, batch=1, LoRA 8레이어, `--grad-checkpoint`
  - Val loss: 4.677 → 4.032 (13.8% 감소), Peak mem 3.7 GB
  - 이전 3회 Metal OOM → grad-checkpoint로 해결
- **GGUF 변환 수정**: tokenizer_config.json `TokenizersBackend` → `GPT2Tokenizer` (원본 HF 파일 필요)
- **결론**: 3,000개 데이터 + LoRA 8레이어로도 catastrophic forgetting 지속
  - 영어 혼입, 무관한 내용 생성 → 베이스 phi4-mini 대비 품질 열세
  - Modelfile 다시 `FROM phi4-mini`로 복원
  - **Phi-4-mini 4bit 위 LoRA 파인튜닝은 현실적으로 한계** (M1 Pro 32GB 환경)

## 2026-02-19 — LoRA 파인튜닝 1차 시도 (800 데이터)
- **학습 데이터 생성**: `scripts/generate-training-data.mjs` 신규
  - DB에서 설교 Q&A 쌍 800개 자동 생성 (6가지 유형: 요약/제목/성경/주제/적용/한국어전용)
  - 출력: `data/training/train.jsonl` (720), `data/training/valid.jsonl` (80)
- **MLX-LM LoRA 학습** (Apple M1 Pro, 32GB):
  - 베이스: `mlx-community/Phi-4-mini-instruct-4bit`
  - 600 이터레이션, batch=4, LoRA 16개 레이어
  - Val loss: 5.516 → 4.001 (27% 감소)
  - Metal GPU 크래시 발생 → 체크포인트 400에서 재개하여 완료
- **GGUF 변환 해결**:
  - 핵심 이슈: MLX fuse가 bfloat16으로 저장 → llama.cpp 변환기가 제대로 처리 못함
  - 해결: PyTorch로 bfloat16→float16 변환 후 GGUF 변환 성공
  - Phi3 채팅 TEMPLATE 명시적 설정 필요 (Ollama 자동 감지 실패)
- **결론**: 800개 데이터 LoRA → 한국어 안정성 저하 (catastrophic forgetting)
  - 베이스 phi4-mini + 시스템 프롬프트가 현 단계에서 더 우수
  - Modelfile을 `FROM phi4-mini`로 복원
- 파일: `scripts/generate-training-data.mjs`(신규), `data/training/`(신규), `Modelfile`(수정), `package.json`(수정)
- 학습 아티팩트: `adapters/`, `fused_model_fp16/`, `fused_model_f16/`, `sermon-ai-f16.gguf`

## 2026-02-19 — 토스 스타일 UI 리디자인 + 설정 페이지 + Qwen3
- **전체 UI 토스(Toss) 스타일로 리디자인**:
  - globals.css: 토스 블루(#3182F6) primary, 연한 회색 배경(#F7F8FA)
  - 채팅 페이지: 버블 UI(유저=블루, AI=흰+그림자), 추천 질문 pill, 플로팅 입력, 타이핑 인디케이터
  - 홈/설교/학습/설교상세: 카드→둥근 white card + shadow, 테두리 제거
  - NavBar: active 상태 토스 블루, 채팅 페이지에서 footer 숨김
  - PageWrapper: 채팅은 전체폭, 나머지는 max-w-5xl
- **설정 페이지 신규** (`/settings`):
  - AI 답변 스타일 프리셋 4종: 목사님/선생님/교수님/친구
  - 프롬프트 직접 수정(커스텀 모드)
  - DB `app_settings` 테이블 + `/api/settings` API
  - RAG 시스템 프롬프트에 설정 연동
- **모델 변경**: exaone3.5:7.8b → **qwen3:8b**
  - `<think>` 태그 필터링 (스트리밍/비스트리밍 모두)
- 수정: `globals.css`, `layout.tsx`, `chat/page.tsx`, `page.tsx`, `sermons/page.tsx`, `sermons/[id]/page.tsx`, `study/page.tsx`, `settings/page.tsx`(신규), `nav-bar.tsx`(신규), `api/settings/route.ts`(신규), `lib/ai.ts`, `lib/rag.ts`, `lib/db.ts`

## 2026-02-18 — 전체 플레이리스트 수집 + ASR 대규모 교정
- 전체 유튜브 플레이리스트 수집: **3,542개 설교**, **64,717개 청크**
- ASR 패턴 기반 SQL 일괄 교정 (9 배치, 20+ 패턴):
  - 반속→반석, 합덕합→합독합, 가늠→간음, 못었다→못했다, 경장히→굉장히
  - 창수→홍수, 구제주→구세주, 수축하라→건축하라, 단속 위에→반석 위에
  - 회계→회개 (를/의/가/로 등), 할레루야→할렐루야, 방연→방언
  - 여호수와→여호수아, 가나한 땅→가나안 땅, 예레미아→예레미야, 겟세마니→겟세마네
  - 바리세인→바리새인, 됬→됐, 감사함니다→감사합니다
- 자동 성경 구절 교정: 3,542개 설교, 2,915개 업데이트, 15,607건 교체
- FTS 인덱스 재구축 완료 (트리거 임시 제거 → 교정 → 재구축)
- `scripts/llm-correct-sermons.mjs` 신규: Claude CLI 기반 LLM 교정 (세션 충돌로 미사용)
- `package.json`: `llm-correct` 스크립트 추가

## 2026-02-18 — 대량 수집 + 자동 성경 교정
- 개역한글 성경 30,929절 임포트 (MaatheusGois/bible GitHub → TSV 변환)
- `scripts/auto-correct-bible.mjs` 신규: 자동 성경 구절 교정 스크립트
  - ASR 오인식 패턴 교정 + 성경 참조 위치 감지 → DB 원문으로 자동 교체
  - 유사도 기반 안전장치 (0.7 이상이면 스킵), --dry-run/--verbose 모드
- 설교 50개 추가 수집 (5 → 55개): 2024-05-05 ~ 2026-02-08 범위
- 자동 교정 실행: 53개 설교, 197개 성경 구절 교체
- `package.json`: `auto-correct` 스크립트 추가
- 수정 파일: `scripts/auto-correct-bible.mjs` (신규), `package.json`

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
