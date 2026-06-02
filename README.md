# 독서 아이트래킹

웹캠과 MediaPipe를 이용해 실시간으로 시선을 추적하고 독서 습관을 분석·교정하는 웹 서비스입니다.

## 주요 기능

- 9점 시선 보정 (클릭당 25샘플 Ridge Regression)
- 실시간 독서 피드백: 역행 시 블러 처리, 현재 읽는 줄 하이라이트
- 독서 분석 결과: 집중도, 역행비율, WPM, 완독률
- 플로팅 웹캠 위젯 (얼굴 랜드마크 실시간 표시)

## 실행 환경

| 항목 | 요구사항 |
|------|----------|
| Python | 3.10 ~ 3.12 |
| 웹캠 | 필수 (로컬 실행 시) |
| 인터넷 | 첫 실행 시 모델 다운로드 (약 30MB) |

## 구조

```
2026-1-sw-8/
├── backend/      ← FastAPI (DB, 인증)
├── frontend/     ← HTML/CSS/JS
├── gaze_client/  ← 시선추적 전용 서버 (포트 8765)
├── deploy/       ← Render 배포용 (backend + frontend)
└── requirements.txt
```

## 설치 및 실행

### 1. 백엔드 서버

```bash
pip install -r requirements.txt
uvicorn backend.app.main:app --reload
```

접속: `http://localhost:8000`

### 2. 시선추적 서버 (로컬)

```bash
pip install -r gaze_client/requirements.txt
python -m gaze_client
```

포트: `http://localhost:8765`

> 첫 실행 시 `face_landmarker.task` 모델 파일이 자동 다운로드됩니다 (약 30MB, 한 번만).

## 사용 방법

```
1. 웹캠 선택    → 카메라 스캔 후 실제 웹캠 선택
2. 시선 보정    → 9개 점을 바라보며 클릭
3. 사용 안내    → 기능 설명 확인
4. 독서         → 실시간 시선 추적 + 역행 블러/하이라이트
5. 결과 확인    → 집중도·역행비율·WPM·완독률 분석
```

## 기술 스택

- **Backend**: Python, FastAPI, SQLAlchemy, SQLite
- **Gaze Client**: MediaPipe, OpenCV, NumPy, FastAPI
- **Frontend**: HTML / CSS / JavaScript (Vanilla)
- **통신**: WebSocket (시선 스트리밍), REST API
