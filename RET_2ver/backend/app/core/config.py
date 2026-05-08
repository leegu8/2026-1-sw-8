from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent.parent

MODEL_PATH    = str(_ROOT / "face_landmarker.task")
MODEL_URL     = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
)

SMOOTH_ALPHA    = 0.10
DEADZONE_PX     = 6
Y_GAIN          = 1.5
SAMPLE_COUNT    = 25
SAMPLE_INTERVAL = 0.02
