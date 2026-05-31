# 독서 아이트래킹

웹캠 + MediaPipe 기반 실시간 시선 추적 및 독서 습관 분석 웹 서비스.

## 프로젝트 구조

```
2026-1-sw-8/
├── requirements.txt
├── frontend/
│   ├── pages/        # index, login, signup, camera, calibration, guide, reading, reading-admin, result, growth, reading-list, reading-list-admin, book-write-admin
│   └── static/
│       ├── style.css
│       ├── base.css              # 홈·도서목록·보정·가이드 공통 다크 디자인 시스템
│       ├── aurora-theme.css      # 가이드·독서 페이지 다크 오버라이드
│       ├── reading-list.css      # 도서 목록 전용 스타일
│       ├── growth.css            # 성장일지 전용 스타일
│       └── js/
│           ├── gaze.js               # 공통 진입점 — WS 연결 + 이벤트 분기
│           ├── reading.js            # 독서 페이지 (사용자용) — 역행 블러
│           ├── reading-admin.js      # 독서 페이지 (관리자용) — 시선 분석·교정·DEV_MODE
│           ├── reading-list.js       # 도서 목록 (사용자용)
│           ├── reading-list-admin.js # 도서 목록 (관리자용) — 삭제·개발자모드 버튼
│           ├── growth.js             # 성장일지
│           ├── login.js              # 로그인
│           ├── signup.js             # 회원가입
│           ├── book-write.js         # 도서 등록 (관리자용)
│           ├── auth-guard.js         # 로그인 여부 체크
│           ├── ui/gazeDot.js         # 시선 점 렌더링
│           ├── ui/widget.js          # 플로팅 웹캠 위젯
│           ├── services/gazeSocket.js # WS → CustomEvent 변환
│           └── api/gazeApi.js        # REST API 호출
└── backend/app/
    ├── main.py               # FastAPI 앱 진입점, 라우터 등록, seed 데이터
    ├── core/config.py        # 전역 상수
    ├── core/model_loader.py  # MediaPipe 모델 다운로드·로드
    ├── data/books.json       # 도서 seed 데이터
    ├── data/sessions_seed.json # 개발자 계정 독서 세션 seed 데이터
    ├── db/models.py          # SQLAlchemy ORM 모델
    ├── db/session.py         # 엔진·세션·init_db·get_db·get_or_404
    ├── api/schemas/gaze.py   # CalibrationPoint, WebcamStartRequest
    ├── api/schemas/db.py     # DB Pydantic 스키마
    └── api/routers/
        ├── auth.py           # /api/auth
        ├── calibration.py    # /api/calibrate
        ├── gaze_ws.py        # WebSocket /ws
        ├── webcam.py         # /api/webcam
        └── db/               # /api/db — 리소스별 1파일
            ├── books.py
            ├── sessions.py
            ├── correction_events.py
            ├── result.py
            ├── growth.py
            ├── attendance.py
            └── level_history.py
```

## 실행

```bash
pip install -r requirements.txt
uvicorn backend.app.main:app --reload
```

접속: `http://localhost:8000`  
첫 실행 시 MediaPipe 모델 자동 다운로드 (~30MB) → `~/.eye_tracking/face_landmarker.task`  
(한국어 경로에서 MediaPipe C 라이브러리 오류 방지를 위해 홈 디렉토리 사용)

## 페이지 흐름

```
login/signup → camera → calibration → guide → reading-list → reading → result → growth
```

- 관리자(userId=100): reading-list-admin → reading-admin (개발자 모드: ?dev=true)
- 일반 사용자: reading-list → reading

- **login**: 이메일·비밀번호 로그인. 로그인 성공 시 출석체크 자동 호출
- **signup**: 회원가입. 이메일·비밀번호·닉네임·레벨 입력
- **camera**: 카메라 선택. 버튼 클릭 시 스캔, 미리보기 후 다음(보정)으로 이동
- **calibration**: 화면 9개 지점(3×3 그리드, 좌우 25%~75%)을 응시·클릭하며 Ridge Regression 모델 학습. 점당 25샘플
- **guide**: 사용 안내. Q키 — 시선이 잘 안 따라올 때 추가 보정 모드(클릭으로 보정 누적)
- **reading** (사용자): 역행 블러만 적용. 페이지네이션·완독률 계산·역행비율 노이즈 필터. 마지막 페이지에서만 완료 버튼 활성
- **reading-admin** (관리자): 실시간 하이라이트·역행 블러 개입. DEV_MODE(마우스=시선). 분석 지표 프론트에서 계산 후 DB 저장. BLUR/HIGHLIGHT 교정 이벤트는 종료 버튼 클릭 시 한 번에 DB 저장. 긴 글은 자동 페이지 분할(pageBoundaries 동적 계산). 완독률: 방문 세그먼트 Set 합산 / 전체(줄×5). 역행비율: right-left-right·down-up-down 떨림 노이즈 제거
- **result**: DB에서 세션 결과 조회. 집중도·역행비율·WPM·완독률·독서시간 기반 종합 점수 계산 후 DB 저장
- **growth**: 최근 5세션 지표·점수 차트, 출석 달력
- **reading-list** (사용자) / **reading-list-admin** (관리자): 도서 목록. 읽은 도서는 커리큘럼/전체 목록에서 제외

## 시선 이벤트 흐름

```
Python(웹캠 → MediaPipe → Ridge Regression)
  → WebSocket /ws (30fps JSON)
  → gazeSocket.js → window CustomEvent
      gaze:tracking  {x, y}   보정 완료 상태
      gaze:detected           얼굴 감지, 보정 미완료
      gaze:lost               얼굴 없음
  → 각 페이지에서 window.addEventListener('gaze:tracking', ...)
```

## 주요 상수 (backend/app/core/config.py)

| 상수 | 값 | 설명 |
|------|----|------|
| `SMOOTH_ALPHA` | 0.10 | EMA 시선 스무딩 계수 |
| `DEADZONE_PX` | 6 | 시선 이동 감지 최소 픽셀 |
| `Y_GAIN` | 1.5 | Y축 감도 배율 |
| `SAMPLE_COUNT` | 25 | 보정 점당 샘플 수 |
| `SAMPLE_INTERVAL` | 0.02 | 샘플 간격(초) |

## DB 테이블 요약 (backend/app/db/models.py)

| 테이블 | 설명 |
|--------|------|
| `users` | 사용자 (email, password_hash, nickname) |
| `level_history` | 사용자 레벨 이력 (초/중/고, tested_at) |
| `attendance` | 출석체크 (user별, attended_at: date) |
| `books` | 도서 (title, content, difficulty, genre) |
| `reading_sessions` | 독서 세션 (wpm, concentration_score, regression_ratio, visited_lines, total_lines, word_count, score) |
| `correction_events` | 교정 이벤트 (BLUR/HIGHLIGHT, line_index, triggered_at) |

## API 엔드포인트

### 인증

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/auth/register` | 회원가입 `{email, password, nickname, level}` → `{id, email, nickname, level}` |
| `POST` | `/api/auth/login` | 로그인 `{email, password}` → `{id, email, nickname, level}` |

### 시선 추적

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/status` | 시스템 상태 |
| `POST/DELETE` | `/api/calibrate` | 보정 포인트 추가 `{x, y, count}` / 초기화 |
| `POST` | `/api/calibrate/y-correction?active=true\|false` | Y좌표 보정 활성화 토글 (Q모드 ON → false, OFF → true) |
| `GET` | `/api/calibrate/status` | 보정 상태 |
| `POST` | `/api/webcam/start` | 웹캠 시작 `{camera_index}` |
| `POST` | `/api/webcam/stop` | 웹캠 중지 |
| `GET` | `/api/webcam/scan` | 카메라 목록 |
| `GET` | `/api/webcam/preview` | MJPEG 스트림 (10fps) |
| `WebSocket` | `/ws` | 30fps 시선 좌표 스트리밍 |

### DB

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/db/users/{id}/level-history` | 사용자 레벨 이력 조회 |
| `POST` | `/api/db/attendance` | 출석 기록 — 오늘 첫 출석이면 `{checked: true}`, 중복이면 `{checked: false}` |
| `GET` | `/api/db/users/{id}/attendance/streak` | 출석 연속 일수·누적 일수·최근 7일 날짜 |
| `POST/GET` | `/api/db/books` | 도서 생성·목록 (목록은 content 제외) |
| `GET/DELETE` | `/api/db/books/{id}` | 도서 상세 조회·삭제 |
| `GET` | `/api/db/users/{id}/completed-books` | 완독한 도서 ID 목록 |
| `POST` | `/api/db/sessions` | 세션 생성 `{user_id, book_id, total_lines}` |
| `PATCH` | `/api/db/sessions/{id}` | 세션 업데이트 (분석 지표·점수 저장) |
| `GET` | `/api/db/sessions/{id}/result` | 세션 결과 (wpm, 집중도, 역행비율, 완독률, 교정이벤트 목록 등) |
| `POST` | `/api/db/correction-events` | 교정 이벤트 저장 `{session_id, event_type, line_index}` — 종료 시 일괄 전송 |
| `GET` | `/api/db/users/{id}/growth` | 성장일지 — 최근 5세션 요약·점수 (오름차순) |

## 코딩 규칙

- **아키텍처**: SRP — `GazeTracker`는 캡처 루프만, 특징 추출·보정·시각화는 전담 클래스에 위임
- **상태 공유**: `app.state.tracker` FastAPI 앱 전역 싱글턴
- **비동기**: 보정 샘플링 `asyncio.sleep`, 캡처 루프 별도 데몬 스레드
- **언어**: 주석·로그 한국어, 코드·변수명 영어, 커밋 메시지 한국어
- **DB 계층 분리**: `app/db/`에 ORM 모델·세션만, 도메인 로직과 분리
- **DB 유틸**: `get_or_404(db, Model, pk, msg)` 헬퍼로 404 처리 통일
- **datetime**: `datetime.now(timezone.utc).replace(tzinfo=None)` (SQLite 호환 naive UTC)

## 주의사항

- 웹캠 없이는 동작하지 않음
- 보정은 **4개 포인트** 이상 수집 시 활성화 (`calibration.py: _MIN_POINTS=4`)
- `face_landmarker.task`는 `.gitignore`에 포함 (자동 다운로드)
- `CLAUDE.local.md`에 로컬 환경 설정(카메라 인덱스 등) 별도 관리 권장
