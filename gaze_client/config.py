from pathlib import Path

_MODEL_CACHE = Path.home() / ".eye_tracking"
_MODEL_CACHE.mkdir(parents=True, exist_ok=True)

MODEL_PATH        = str(_MODEL_CACHE / "face_landmarker.task")
MODEL_PATH_LEGACY = MODEL_PATH
MODEL_URL         = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
)

SMOOTH_ALPHA    = 0.10
DEADZONE_PX     = 6
Y_CORRECTION_K  = 0.00004
Y_GAIN          = 1.5
SAMPLE_COUNT    = 25
SAMPLE_INTERVAL = 0.02
