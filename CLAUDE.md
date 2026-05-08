# 독서 아이트래킹

웹캠 + MediaPipe 기반 실시간 시선 추적 및 독서 습관 분석 웹 서비스.

## 프로젝트 구조

```
2026-1-sw-8-main/
├── requirements.txt
├── frontend/
│   ├── pages/           # HTML 페이지 (index, calibration, guide, reading, result)
│   └── static/
│       ├── style.css
│       └── js/
│           ├── gaze.js              # 공통 시선 추적 로직
│           ├── ui/
│           │   ├── widget.js        # 플로팅 웹캠 위젯
│           │   └── gazeDot.js       # 시선 점 렌더링
│           ├── services/
│           │   └── gazeSocket.js    # WebSocket 클라이언트
│           └── api/
│               └── gazeApi.js       # REST API 호출
└── backend/
    └── app/
        ├── main.py                  # FastAPI 앱 진입점
        ├── core/
        │   ├── config.py            # 전역 상수
        │   └── model_loader.py      # MediaPipe 모델 다운로드·로드
        ├── db/                      # DB 인프라 (도메인과 분리)
        │   ├── models.py            # SQLAlchemy ORM 모델 + Enum 정의
        │   └── session.py           # 엔진·세션·init_db·get_db·get_or_404
        ├── api/
        │   ├── schemas/
        │   │   ├── gaze.py          # CalibrationPoint, WebcamStartRequest
        │   │   └── db.py            # DB 관련 Pydantic 스키마 전체
        │   └── routers/
        │       ├── calibration.py   # POST/DELETE /api/calibrate
        │       ├── gaze_ws.py       # WebSocket /ws
        │       ├── webcam.py        # 웹캠 제어 API
        │       └── db/              # DB CRUD (리소스별 분리)
        │           ├── users.py         # /api/db/users
        │           ├── calibrations.py  # /api/db/calibrations
        │           ├── texts.py         # /api/db/texts
        │           ├── sessions.py      # /api/db/sessions
        │           ├── events.py        # /api/db/events
        │           ├── metrics.py       # /api/db/metrics (sessions/{id}/metrics)
        │           ├── interventions.py # /api/db/interventions
        │           └── reports.py       # /api/db/reports (sessions/{id}/report)
        └── domain/
            └── gaze/
                ├── tracker.py           # 백그라운드 캡처 루프
                ├── feature_extractor.py # 홍채 좌표 추출
                ├── calibration.py       # 9점 보정 모델
                └── visualizer.py        # 얼굴 랜드마크 시각화
```

## 실행 방법

```bash
# 패키지 설치
pip install -r requirements.txt

# 서버 실행 (루트 디렉토리에서)
uvicorn backend.app.main:app --reload

# 또는 backend/app/ 위치에서
uvicorn main:app --reload
```

접속: `http://localhost:8000`  
첫 실행 시 `face_landmarker.task` 모델 자동 다운로드 (~30MB, 1회)

## 주요 상수 (backend/app/core/config.py)

| 상수 | 기본값 | 설명 |
|------|--------|------|
| `SMOOTH_ALPHA` | 0.15 | EMA 시선 스무딩 계수 |
| `DEADZONE_PX` | 6 | 시선 이동 감지 최소 픽셀 |
| `Y_GAIN` | 1.8 | Y축 감도 배율 |
| `SAMPLE_COUNT` | 25 | 보정 점당 샘플 수 |
| `SAMPLE_INTERVAL` | 0.02 | 샘플 간격(초) |

## API 엔드포인트

### 시선 추적

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/status` | 시스템 상태 조회 |
| `GET` | `/api/calibrate/status` | 보정 상태 조회 |
| `POST` | `/api/calibrate` | 보정 포인트 추가 (`{x, y}`) |
| `DELETE` | `/api/calibrate` | 보정 초기화 |
| `POST` | `/api/webcam/start` | 웹캠 시작 (`{camera_index}`) |
| `POST` | `/api/webcam/stop` | 웹캠 중지 |
| `GET` | `/api/webcam/scan` | 사용 가능한 카메라 목록 조회 |
| `GET` | `/api/webcam/preview` | MJPEG 스트림 (10fps) |
| `WebSocket` | `/ws` | 30fps 시선 좌표 스트리밍 |

### WebSocket 메시지 형식

```json
{"type": "gaze", "x": 450, "y": 310, "calibrated": true}
{"type": "gaze", "calibrated": false}
{"type": "no_face"}
```

### DB CRUD (`/api/db/...`)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST/GET` | `/api/db/users` | 사용자 생성·목록 |
| `GET/DELETE` | `/api/db/users/{id}` | 사용자 조회·삭제 |
| `GET` | `/api/db/users/{id}/sessions` | 사용자 세션 목록 |
| `GET` | `/api/db/users/{id}/calibrations` | 사용자 보정 목록 |
| `POST/GET` | `/api/db/calibrations` | 보정 데이터 생성·조회 |
| `POST/GET` | `/api/db/texts` | 텍스트 콘텐츠 생성·목록 |
| `POST/GET` | `/api/db/sessions` | 독서 세션 생성·목록 |
| `PATCH` | `/api/db/sessions/{id}` | 세션 업데이트 |
| `POST` | `/api/db/sessions/{id}/end` | 세션 종료 (duration 자동 계산) |
| `POST` | `/api/db/events` | 시선 이벤트 단건 저장 |
| `POST` | `/api/db/events/bulk` | 시선 이벤트 대량 저장 |
| `GET` | `/api/db/sessions/{id}/events` | 세션별 이벤트 조회 |
| `POST` | `/api/db/metrics` | 독서 지표 저장 (세션당 1건) |
| `GET` | `/api/db/sessions/{id}/metrics` | 세션별 지표 조회 |
| `POST` | `/api/db/interventions` | 개입 기록 저장 |
| `PATCH` | `/api/db/interventions/{id}/accept` | 개입 수락 처리 |
| `GET` | `/api/db/sessions/{id}/interventions` | 세션별 개입 목록 |
| `POST` | `/api/db/reports` | 세션 리포트 저장 (세션당 1건) |
| `GET` | `/api/db/sessions/{id}/report` | 세션별 리포트 조회 |

## 코딩 규칙

- **아키텍처**: SRP(단일 책임) 준수 — `GazeTracker`는 캡처 루프만, 특징 추출/보정/시각화는 전담 클래스에 위임
- **의존성 주입**: `GazeTracker`는 생성자 주입 방식 사용 (DIP 준수)
- **상태 공유**: `app.state.tracker`로 FastAPI 앱 전역 공유 (싱글턴)
- **비동기**: 보정 샘플링은 `asyncio.sleep`으로 처리, 캡처 루프는 별도 데몬 스레드
- **언어**: 주석·로그 한국어, 코드·변수명 영어
- **DB 계층 분리**: DB 모델·세션은 `app/db/`에 위치 (도메인 로직과 분리)
- **라우터 분리**: DB CRUD는 `api/routers/db/` 하위에 리소스별 1파일로 관리
- **스키마 분리**: 시선 추적용(`schemas/gaze.py`)과 DB용(`schemas/db.py`) 분리
- **DB 유틸**: `get_or_404(db, Model, pk, msg)` 헬퍼로 404 처리 통일 (`db/session.py`)
- **datetime**: `datetime.now(timezone.utc).replace(tzinfo=None)` 사용 (SQLite 호환 naive UTC)

## 주의사항

- 웹캠 없이는 동작하지 않음
- 보정은 9개 점 완료 후 활성화 (`calibration.is_ready`)
- `CLAUDE.local.md`에 로컬 환경 설정(카메라 인덱스 등) 별도 관리 권장
- `face_landmarker.task`는 `.gitignore`에 포함 (자동 다운로드)
