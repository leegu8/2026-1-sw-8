-- ================================================
-- 아이트래킹 기반 실시간 정독 유도 서비스
-- Database Schema (MySQL)
-- ================================================

CREATE DATABASE IF NOT EXISTS eye_tracking_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE eye_tracking_db;

-- ------------------------------------------------
-- 1. USER (사용자)
-- ------------------------------------------------
CREATE TABLE USER (
  id            BIGINT        NOT NULL AUTO_INCREMENT,
  email         VARCHAR(255)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  nickname      VARCHAR(50)   NOT NULL,
  role          ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_email (email)
) ENGINE=InnoDB;

-- ------------------------------------------------
-- 2. CALIBRATION (웹캠 시선 보정 데이터)
-- ------------------------------------------------
CREATE TABLE CALIBRATION (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  user_id            BIGINT        NOT NULL,
  calibration_params JSON          NOT NULL COMMENT '보정 파라미터 (MediaPipe 기반)',
  accuracy_score     FLOAT         NOT NULL COMMENT '보정 정확도 0.0 ~ 1.0',
  calibrated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_calibration_user FOREIGN KEY (user_id) REFERENCES USER(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------
-- 3. TEXT_CONTENT (읽기 텍스트 콘텐츠)
-- ------------------------------------------------
CREATE TABLE TEXT_CONTENT (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  title            VARCHAR(255) NOT NULL,
  body             LONGTEXT     NOT NULL,
  total_sentences  INT          NOT NULL DEFAULT 0,
  total_paragraphs INT          NOT NULL DEFAULT 0,
  difficulty       ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'medium',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- ------------------------------------------------
-- 4. READING_SESSION (독서 세션)
-- ------------------------------------------------
CREATE TABLE READING_SESSION (
  id               BIGINT   NOT NULL AUTO_INCREMENT,
  user_id          BIGINT   NOT NULL,
  text_id          BIGINT   NOT NULL,
  calibration_id   BIGINT   NOT NULL,
  started_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at         DATETIME          DEFAULT NULL,
  status           ENUM('in_progress', 'completed', 'abandoned') NOT NULL DEFAULT 'in_progress',
  total_duration_ms INT              DEFAULT NULL COMMENT '총 독서 시간 (ms)',
  PRIMARY KEY (id),
  CONSTRAINT fk_session_user        FOREIGN KEY (user_id)        REFERENCES USER(id)         ON DELETE CASCADE,
  CONSTRAINT fk_session_text        FOREIGN KEY (text_id)        REFERENCES TEXT_CONTENT(id) ON DELETE CASCADE,
  CONSTRAINT fk_session_calibration FOREIGN KEY (calibration_id) REFERENCES CALIBRATION(id)  ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ------------------------------------------------
-- 5. GAZE_EVENT (시선 이벤트 로그)
-- ------------------------------------------------
CREATE TABLE GAZE_EVENT (
  id              BIGINT   NOT NULL AUTO_INCREMENT,
  session_id      BIGINT   NOT NULL,
  event_type      ENUM('fixation', 'saccade', 'regression', 'blink') NOT NULL,
  gaze_x          FLOAT    NOT NULL COMMENT '화면 X 좌표 (px)',
  gaze_y          FLOAT    NOT NULL COMMENT '화면 Y 좌표 (px)',
  duration_ms     INT      NOT NULL COMMENT '지속 시간 (ms)',
  sentence_index  INT               DEFAULT NULL COMMENT '매핑된 문장 인덱스',
  paragraph_index INT               DEFAULT NULL COMMENT '매핑된 단락 인덱스',
  recorded_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_gaze_session FOREIGN KEY (session_id) REFERENCES READING_SESSION(id) ON DELETE CASCADE,
  INDEX idx_gaze_session_time (session_id, recorded_at)
) ENGINE=InnoDB;

-- ------------------------------------------------
-- 6. READING_METRIC (정독 지표 - 세션별 1건)
-- ------------------------------------------------
CREATE TABLE READING_METRIC (
  id                  BIGINT   NOT NULL AUTO_INCREMENT,
  session_id          BIGINT   NOT NULL,
  avg_fixation_ms     FLOAT    NOT NULL COMMENT '평균 고정 시간 (ms)',
  regression_ratio    FLOAT    NOT NULL COMMENT '회귀 시선 비율 0.0 ~ 1.0',
  linearity_score     FLOAT    NOT NULL COMMENT '시선 선형성 점수 0.0 ~ 1.0',
  concentration_score FLOAT    NOT NULL COMMENT '종합 집중도 점수 0.0 ~ 100.0',
  reading_pattern     ENUM('linear', 'f_pattern', 'scattered') NOT NULL,
  calculated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_metric_session (session_id),
  CONSTRAINT fk_metric_session FOREIGN KEY (session_id) REFERENCES READING_SESSION(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------
-- 7. INTERVENTION (실시간 개입 이력)
-- ------------------------------------------------
CREATE TABLE INTERVENTION (
  id                BIGINT   NOT NULL AUTO_INCREMENT,
  session_id        BIGINT   NOT NULL,
  metric_id         BIGINT   NOT NULL,
  trigger_reason    ENUM('high_fixation', 'high_regression', 'f_pattern') NOT NULL,
  intervention_type ENUM('highlight', 'blur', 'focus_mode', 'word_guide') NOT NULL,
  triggered_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_ms       INT               DEFAULT NULL COMMENT '개입 지속 시간 (ms)',
  accepted          TINYINT(1) NOT NULL DEFAULT 1 COMMENT '사용자가 개입을 수용했는지',
  PRIMARY KEY (id),
  CONSTRAINT fk_intervention_session FOREIGN KEY (session_id) REFERENCES READING_SESSION(id) ON DELETE CASCADE,
  CONSTRAINT fk_intervention_metric  FOREIGN KEY (metric_id)  REFERENCES READING_METRIC(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------
-- 8. SESSION_REPORT (독서 완료 후 리포트)
-- ------------------------------------------------
CREATE TABLE SESSION_REPORT (
  id             BIGINT   NOT NULL AUTO_INCREMENT,
  session_id     BIGINT   NOT NULL,
  heatmap_data   JSON              DEFAULT NULL COMMENT '히트맵 시각화 데이터',
  gaze_plot_data JSON              DEFAULT NULL COMMENT 'Gaze plot 데이터',
  overall_score  FLOAT    NOT NULL COMMENT '최종 정독 점수 0.0 ~ 100.0',
  feedback_text  TEXT              DEFAULT NULL COMMENT 'AI 생성 피드백 텍스트',
  generated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_session (session_id),
  CONSTRAINT fk_report_session FOREIGN KEY (session_id) REFERENCES READING_SESSION(id) ON DELETE CASCADE
) ENGINE=InnoDB;