from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent.parent
# 한국어 경로에서 MediaPipe C 라이브러리가 파일을 못 열기 때문에 홈 디렉토리 사용
_MODEL_CACHE  = Path.home() / ".eye_tracking"
_MODEL_CACHE.mkdir(parents=True, exist_ok=True)

MODEL_PATH    = str(_MODEL_CACHE / "face_landmarker.task")
MODEL_PATH_LEGACY = str(_ROOT / "face_landmarker.task")
MODEL_URL     = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
)

SMOOTH_ALPHA    = 0.10
DEADZONE_PX     = 6
Y_GAIN          = 1.5
SAMPLE_COUNT    = 25
SAMPLE_INTERVAL = 0.02

DATABASE_URL = "sqlite+aiosqlite:///./eye_tracking.db"
