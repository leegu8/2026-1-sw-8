# 독서 아이트래킹

웹캠 + MediaPipe 기반 실시간 시선 추적 및 독서 습관 분석 웹 서비스.

## 프로젝트 구조

```
2026-1-sw-8/
├── requirements.txt
├── frontend/
│   ├── pages/        # index, calibration, guide, reading, result
│   └── static/
│       ├── style.css
│       └── js/
│           ├── gaze.js               # 공통 진입점 — WS 연결 + 이벤트 분기
│           ├── ui/gazeDot.js         # 시선 점 렌더링
│           ├── ui/widget.js          # 플로팅 웹캠 위젯
│           ├── services/gazeSocket.js # WS → CustomEvent 변환
│           └── api/gazeApi.js        # REST API 호출
└── backend/app/
    ├── main.py               # FastAPI 앱 진입점, 라우터 등록
    ├── core/config.py        # 전역 상수
    ├── core/model_loader.py  # MediaPipe 모델 다운로드·로드
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
index → calibration → guide → reading → result
```

- **calibration**: 화면 14개 지점을 응시하며 Ridge Regression 모델 학습
- **guide**: 사용 안내. Q키 — 마우스 보정 모드(클릭·정지로 추가 보정)
- **reading**: 실시간 하이라이트·역행 블러. D키 — 개발자 모드(마우스 = 시선)
- **result**: 집중도·역행 횟수 분석 결과 표시

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
| `reading_sessions` | 독서 세션 (user, book 연결, x_min, x_max, wpm, concentration_score 등) |
| `correction_events` | 교정 이벤트 (BLUR/HIGHLIGHT, triggered_at) |
| `gaze_summary` | 10초 구간별 시선 집계 (focus_rate, regression_count, non_concentrated_ms, visited_line_indices 등) |

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
| `GET` | `/api/calibrate/status` | 보정 상태 |
| `POST` | `/api/webcam/start` | 웹캠 시작 `{camera_index}` |
| `POST` | `/api/webcam/stop` | 웹캠 중지 |
| `GET` | `/api/webcam/scan` | 카메라 목록 |
| `GET` | `/api/webcam/preview` | MJPEG 스트림 (10fps) |
| `WebSocket` | `/ws` | 30fps 시선 좌표 스트리밍 |

### DB CRUD

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST/GET` | `/api/db/users` | 사용자 생성·목록 |
| `GET/DELETE` | `/api/db/users/{id}` | 사용자 조회·삭제 |
| `GET` | `/api/db/users/{id}/sessions` | 사용자 세션 목록 |
| `GET` | `/api/db/users/{id}/level-history` | 사용자 레벨 이력 조회 |
| `POST` | `/api/db/level-history` | 레벨 이력 저장 |
| `GET` | `/api/db/users/{id}/attendance` | 사용자 출석 목록 |
| `POST` | `/api/db/attendance` | 출석 기록 — 오늘 첫 출석이면 저장 후 `{checked: true}`, 중복이면 `{checked: false}` |
| `POST/GET` | `/api/db/books` | 도서 생성·목록 (목록은 content 제외) |
| `GET/DELETE` | `/api/db/books/{id}` | 도서 상세 조회·삭제 |
| `GET` | `/api/db/users/{id}/completed-books` | 완독한 도서 ID 목록 |
| `POST/GET` | `/api/db/sessions` | 세션 생성 `{user_id, book_id, total_lines, x_min, x_max}`·목록 |
| `GET/PATCH` | `/api/db/sessions/{id}` | 세션 조회·업데이트 |
| `POST` | `/api/db/sessions/{id}/end` | 세션 종료 (duration 자동 계산) |
| `POST` | `/api/db/correction-events` | 교정 이벤트 저장 |
| `GET` | `/api/db/sessions/{id}/correction-events` | 세션별 교정 이벤트 조회 |
| `POST` | `/api/db/gaze-summary` | 구간 시선 집계 저장 |
| `POST` | `/api/db/gaze-summary/bulk` | 구간 시선 집계 대량 저장 |
| `GET` | `/api/db/sessions/{id}/gaze-summary` | 세션별 구간 집계 조회 |
| `GET` | `/api/db/sessions/{id}/result` | 세션 결과 (wpm, 집중도, 역행비율, 완독률 등) |
| `GET` | `/api/db/users/{id}/growth` | 성장일지 — 최근 5세션 요약 (오름차순) |
| `GET` | `/api/db/users/{id}/attendance/streak` | 출석 연속 일수·누적 일수·최근 7일 날짜 |

### 독서 분석

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/reading/log` | 10초마다 로그 전송 — gaze_summary 계산·저장, correction_events 저장 |
| `POST` | `/api/reading/end` | 독서 종료 `{session_id, ended_at?, reading_logs, correction_events}` — 남은 로그 처리 + 세션 지표(wpm, 집중도 등) 계산 후 저장 |

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
