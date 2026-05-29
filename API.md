# API 명세서

## 목차

1. [인증](#인증)
2. [출석](#출석)
3. [레벨 이력](#레벨-이력)
4. [도서](#도서)
5. [독서 세션](#독서-세션)
6. [교정 이벤트](#교정-이벤트)
7. [성장일지](#성장일지)
8. [시선 추적](#시선-추적)

---

## 인증

### POST /api/auth/register

```json
// 요청
{
  "email": "string",
  "password": "string",
  "nickname": "string",
  "level": "초등 | 중등 | 고등"
}

// 응답 201
{
  "id": 1,
  "email": "string",
  "nickname": "string",
  "level": "초등"
}
```

> 이메일 중복 시 `409` / 회원가입 성공 시 레벨 이력 자동 저장

---

### POST /api/auth/login

```json
// 요청
{
  "email": "string",
  "password": "string"
}

// 응답 200
{
  "id": 1,
  "email": "string",
  "nickname": "string",
  "level": "중등"
}
```

> 이메일/비밀번호 불일치 시 `401` / `level`은 LevelHistory 최신 레코드 기준, 없으면 `null`

---

## 출석

### POST /api/db/attendance

```json
// 요청
{ "user_id": 1 }

// 응답 201
{ "checked": true }
```

> `true` = 오늘 첫 출석 (저장됨), `false` = 이미 출석 (저장 안 함)

---

### GET /api/db/users/{user_id}/attendance/streak

```json
// 응답 200
{
  "streak": 5,
  "total_days": 14,
  "recent_dates": ["2026-05-20", "2026-05-21", "2026-05-22"]
}
```

> `streak`: 오늘 기준 연속 출석 일수 / `recent_dates`: 최근 7일 중 출석한 날짜 (오름차순)

---

## 레벨 이력

### GET /api/db/users/{user_id}/level-history

```json
// 응답 200
[
  {
    "id": 1,
    "user_id": 1,
    "level_result": "중등",
    "tested_at": "2026-05-22T10:00:00"
  }
]
```

> 프론트에서 가장 최신 항목을 현재 레벨로 사용

---

## 도서

### GET /api/db/books

```json
// 응답 200 (content 제외)
[
  {
    "id": 1,
    "title": "string",
    "difficulty": "중등",
    "genre": "소설",
    "created_at": "2026-05-22T10:00:00"
  }
]
```

---

### GET /api/db/books/{book_id}

```json
// 응답 200
{
  "id": 1,
  "title": "string",
  "content": "본문 전체",
  "difficulty": "중등",
  "genre": "소설",
  "created_at": "2026-05-22T10:00:00"
}
```

---

### POST /api/db/books

```json
// 요청
{
  "title": "string",
  "content": "string",
  "difficulty": "중등",
  "genre": "소설"
}

// 응답 201
{
  "id": 1,
  "title": "string",
  "content": "string",
  "difficulty": "중등",
  "genre": "소설",
  "created_at": "2026-05-22T10:00:00"
}
```

---

### DELETE /api/db/books/{book_id}

> 응답 `204 No Content`

---

### GET /api/db/users/{user_id}/completed-books

```json
// 응답 200
[
  { "book_id": 1 },
  { "book_id": 3 }
]
```

> `ended_at IS NOT NULL`인 세션의 `book_id` 중복 제거

---

## 독서 세션

### POST /api/db/sessions

```json
// 요청
{
  "user_id": 1,
  "book_id": 2,
  "total_lines": 48
}

// 응답 201
{
  "id": 7,
  "user_id": 1,
  "book_id": 2,
  "started_at": "2026-05-22T10:00:00",
  "ended_at": null,
  "total_duration_sec": null,
  "wpm": null,
  "concentration_score": null,
  "regression_ratio": null,
  "visited_lines": null,
  "total_lines": 48,
  "word_count": null,
  "score": null
}
```

> `started_at` 서버 시간 자동 설정 / 응답의 `id`를 localStorage에 저장해 이후 PATCH·결과 페이지에 사용

---

### PATCH /api/db/sessions/{session_id}

```json
// 요청 (모든 필드 선택, 보낸 것만 업데이트)
{
  "ended_at": "2026-05-22T10:05:12",
  "total_duration_sec": 312,
  "wpm": 210.5,
  "concentration_score": 72.3,
  "regression_ratio": 18.5,
  "visited_lines": 42,
  "total_lines": 48,
  "word_count": 1024,
  "score": 85.0
}
```

> 다 읽었어요 버튼: `ended_at` ~ `word_count` 전송 / 결과 페이지: `score`만 별도 전송

---

### GET /api/db/sessions/{session_id}/result

```json
// 응답 200
{
  "session_id": 7,
  "book_title": "string",
  "total_duration_sec": 312,
  "word_count": 1024,
  "visited_lines": 42,
  "total_lines": 48,
  "correction_events": [
    {
      "event_type": "BLUR",
      "line_index": 5,
      "triggered_at": "2026-05-22T10:02:00"
    }
  ],
  "summary": {
    "wpm": 210.5,
    "completion_rate": 0.87,
    "concentration_score": 72.3,
    "regression_ratio": 18.5,
    "blur_event_count": 3,
    "highlight_event_count": 5
  }
}
```

---

## 교정 이벤트

### POST /api/db/correction-events

```json
// 요청
{
  "session_id": 7,
  "event_type": "BLUR",
  "line_index": 5
}

// 응답 201
{
  "id": 1,
  "session_id": 7,
  "event_type": "BLUR",
  "line_index": 5,
  "triggered_at": "2026-05-22T10:02:00"
}
```

> 독서 종료 버튼 클릭 시 누적된 이벤트를 한 번에 전송 / `line_index` 선택
>
> BLUR: 재독 3/30초 조건 달성 시 재독 발생 줄
> HIGHLIGHT: 집중 이탈 감지 시 이탈된 줄

---

## 성장일지

### GET /api/db/users/{user_id}/growth

```json
// 응답 200 (ended_at IS NOT NULL인 세션 중 최신 5개, started_at 오름차순)
[
  {
    "session_id": 7,
    "book_title": "string",
    "started_at": "2026-05-20",
    "total_duration_sec": 312,
    "score": 85.0,
    "summary": {
      "wpm": 210.5,
      "completion_rate": 0.87,
      "concentration_score": 72.3,
      "regression_ratio": 18.5,
      "blur_event_count": 3,
      "highlight_event_count": 5
    }
  }
]
```

---

## 시선 추적

### GET /api/status

```json
// 응답 200
{
  "webcam_open": true,
  "iris_detected": true,
  "calibrated": true,
  "cal_count": 14
}
```

---

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `POST` | `/api/calibrate` | 보정 포인트 추가 `{x, y, count}` |
| `DELETE` | `/api/calibrate` | 보정 초기화 |
| `POST` | `/api/calibrate/y-correction?active=true\|false` | Y좌표 보정 활성화 토글 (Q모드 ON → false, OFF → true) |
| `GET` | `/api/calibrate/status` | 보정 상태 조회 |
| `POST` | `/api/webcam/start` | 웹캠 시작 `{camera_index}` |
| `POST` | `/api/webcam/stop` | 웹캠 중지 |
| `GET` | `/api/webcam/scan` | 카메라 목록 |
| `GET` | `/api/webcam/preview` | MJPEG 미리보기 (10fps) |
| `WebSocket` | `/ws` | 시선 좌표 스트리밍 30fps `{x, y}` |
