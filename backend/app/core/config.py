from pathlib import Path

# 프로젝트 경로에 한국어 포함 → MediaPipe C 라이브러리 오류 방지를 위해 홈 디렉토리 사용
_MODEL_CACHE  = Path.home() / ".eye_tracking"
_MODEL_CACHE.mkdir(parents=True, exist_ok=True)

MODEL_PATH        = str(_MODEL_CACHE / "face_landmarker.task")
MODEL_PATH_LEGACY = MODEL_PATH
MODEL_URL     = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
)

SMOOTH_ALPHA    = 0.10
DEADZONE_PX     = 6
Y_CORRECTION_K  = 0 #0.00004   # Y축 하향 편향 보정 계수 — corrected_y = y × exp(-k × y)
Y_GAIN          = 1.5
SAMPLE_COUNT    = 25
SAMPLE_INTERVAL = 0.02

DATABASE_URL = "sqlite+aiosqlite:///./eye_tracking.db"
