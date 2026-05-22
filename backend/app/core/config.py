from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent.parent
# Path.home()에 한국어 포함 가능 → 프로젝트 루트(ASCII) 아래에 모델 저장
_MODEL_CACHE  = _ROOT / ".eye_tracking"
_MODEL_CACHE.mkdir(parents=True, exist_ok=True)

MODEL_PATH    = str(_MODEL_CACHE / "face_landmarker.task")
# 기존 홈 디렉토리에 다운로드된 파일이 있으면 자동 복사
MODEL_PATH_LEGACY = str(Path.home() / ".eye_tracking" / "face_landmarker.task")
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
