import os
import urllib.request
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from .config import MODEL_PATH, MODEL_URL


def ensure_model() -> None:
    if not os.path.exists(MODEL_PATH):
        print("face_landmarker.task 모델 다운로드 중... (첫 실행 시 한 번만, 약 30MB)")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("다운로드 완료")


def create_landmarker():
    options = mp_vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
        num_faces=1,
        min_face_detection_confidence=0.3,
        min_face_presence_confidence=0.3,
        min_tracking_confidence=0.3,
    )
    return mp_vision.FaceLandmarker.create_from_options(options)
