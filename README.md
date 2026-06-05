# 독서 아이트래킹

웹캠과 MediaPipe를 이용해 실시간으로 시선을 추적하고 독서 습관을 분석·교정하는 웹 서비스입니다.

## 주요 기능

- 9점 시선 보정 (클릭당 200ms 서버 샘플링으로 정확도 향상)
- 실시간 독서 피드백: 역행 시 블러 처리, 현재 읽는 줄 하이라이트
- 독서 분석 결과: 집중도, 역행 횟수, 독서 시간
- 플로팅 웹캠 위젯 (모든 페이지에서 얼굴 랜드마크 실시간 표시)

## 실행 환경

| 항목 | 요구사항 |
|------|----------|
| Python | 3.10 ~ 3.12 |
| 웹캠 | 필수 |
| 인터넷 | 첫 실행 시 모델 다운로드 (약 30MB) |

## 설치 및 실행

### ⭐️웹 브라우저로 접속 시⭐️ (배포 완료)

```
https://two026-1-sw-8.onrender.com
```

### 로컬 서버로 접속 시
### 1. 저장소 클론

```bash
git clone https://github.com/사용자명/저장소명.git
cd RET_2ver
```

### 2. 패키지 설치

```bash
pip install -r requirements.txt
```

### 3. 로컬 서버 실행

```bash
uvicorn backend.app.main:app --reload
```

> 첫 실행 시 `face_landmarker.task` 모델 파일이 자동으로 다운로드됩니다 (약 30MB, 한 번만).

### 4. 로컬 서버 접속

```
http://localhost:8000
```

## 사용 방법

```
1. 웹캠 동의     → 카메라 스캔 후 실제 웹캠 선택
2. 시선 보정     → 9개 점을 바라보며 각 5번씩 클릭
3. 사용 안내     → 기능 설명 확인
4. 독서         → 실시간 시선 추적 + 역행 블러/하이라이트
5. 결과 확인     → 집중도·역행 횟수·독서 시간 분석
```

## 기술 스택

- **Backend**: Python, FastAPI, MediaPipe, OpenCV, SQLite(branch main, 로컬 서버용), PostgreSQL(branch release, 배포 서버용)
- **Frontend**: HTML / CSS / JavaScript (Vanilla)
- **통신**: WebSocket (실시간 시선 스트리밍), REST API (보정)
