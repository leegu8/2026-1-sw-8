# 2026-1 공개SW프로젝트 8팀
## 작업 내용
- 아이트래킹 기반 정독 유도 서비스의 MySQL ERD 설계 및 DB 스키마 추가
- 백엔드(Node.js)와 MySQL 연동 및 데이터 입출력 테스트 완료

## 추가된 파일
- `database/schema.sql`: 전체 테이블 생성 스크립트
- `backend/server.js`: API 서버 기초 코드

## 테이블 목록
- USER: 사용자 계정
- CALIBRATION: 웹캠 시선 보정 데이터
- TEXT_CONTENT: 읽기 텍스트 콘텐츠
- READING_SESSION: 독서 세션
- GAZE_EVENT: 시선 이벤트 로그
- READING_METRIC: 정독 지표
- INTERVENTION: 실시간 개입 이력
- SESSION_REPORT: 독서 완료 리포트
