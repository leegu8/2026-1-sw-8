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
        ├── api/
        │   ├── schemas.py
        │   └── routers/
        │       ├── calibration.py   # POST/DELETE /api/calibrate
        │       ├── gaze_ws.py       # WebSocket /ws
        │       └── webcam.py        # 웹캠 제어 API
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

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/status` | 시스템 상태 조회 |
| `GET` | `/api/calibrate/status` | 보정 상태 조회 |
| `POST` | `/api/calibrate` | 보정 포인트 추가 (`{x, y}`) |
| `DELETE` | `/api/calibrate` | 보정 초기화 |
| `WebSocket` | `/ws` | 30fps 시선 좌표 스트리밍 |

### WebSocket 메시지 형식

```json
{"type": "gaze", "x": 450, "y": 310, "calibrated": true}
{"type": "gaze", "calibrated": false}
{"type": "no_face"}
```

## 코딩 규칙

- **아키텍처**: SRP(단일 책임) 준수 — `GazeTracker`는 캡처 루프만, 특징 추출/보정/시각화는 전담 클래스에 위임
- **의존성 주입**: `GazeTracker`는 생성자 주입 방식 사용 (DIP 준수)
- **상태 공유**: `app.state.tracker`로 FastAPI 앱 전역 공유 (싱글턴)
- **비동기**: 보정 샘플링은 `asyncio.sleep`으로 처리, 캡처 루프는 별도 데몬 스레드
- **언어**: 주석·로그 한국어, 코드·변수명 영어

## 주의사항

- 웹캠 없이는 동작하지 않음
- 보정은 9개 점 완료 후 활성화 (`calibration.is_ready`)
- `CLAUDE.local.md`에 로컬 환경 설정(카메라 인덱스 등) 별도 관리 권장
- `face_landmarker.task`는 `.gitignore`에 포함 (자동 다운로드)
