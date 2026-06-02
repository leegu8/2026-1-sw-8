import cv2
import mediapipe as mp
import threading
import numpy as np

from .feature_extractor import GazeFeatureExtractor
from .calibration import CalibrationModel
from .visualizer import FaceMeshVisualizer
from ..config import DEADZONE_PX, Y_CORRECTION_K

_PROCESS_NOISE     = 20.0
_MEASUREMENT_NOISE = 600.0
_DT                = 1 / 30


class _GazeKalmanFilter:
    def __init__(self) -> None:
        dt = _DT
        self._F = np.array([[1, 0, dt, 0],
                            [0, 1, 0, dt],
                            [0, 0, 1,  0],
                            [0, 0, 0,  1]], dtype=np.float64)
        self._H = np.array([[1, 0, 0, 0],
                            [0, 1, 0, 0]], dtype=np.float64)
        self._Q = np.eye(4) * _PROCESS_NOISE
        self._R = np.eye(2) * _MEASUREMENT_NOISE
        self._x: np.ndarray | None = None
        self._P = np.eye(4) * 1000.0

    def update(self, mx: float, my: float) -> tuple[float, float]:
        z = np.array([[mx], [my]])
        if self._x is None:
            self._x = np.array([[mx], [my], [0.0], [0.0]])
            return mx, my
        x_p = self._F @ self._x
        P_p = self._F @ self._P @ self._F.T + self._Q
        S   = self._H @ P_p @ self._H.T + self._R
        K   = P_p @ self._H.T @ np.linalg.inv(S)
        self._x = x_p + K @ (z - self._H @ x_p)
        self._P = (np.eye(4) - K @ self._H) @ P_p
        return float(self._x[0, 0]), float(self._x[1, 0])

    def reset(self) -> None:
        self._x = None
        self._P = np.eye(4) * 1000.0


class GazeTracker:
    def __init__(
        self,
        landmarker,
        extractor:   GazeFeatureExtractor,
        calibration: CalibrationModel,
        visualizer:  FaceMeshVisualizer,
    ) -> None:
        self._landmarker  = landmarker
        self._extractor   = extractor
        self._calibration = calibration
        self._visualizer  = visualizer
        self.iris_pos:     tuple | None = None
        self.latest_frame               = None
        self._kalman                    = _GazeKalmanFilter()
        self._out_x:       int   | None = None
        self._out_y:       int   | None = None
        self._cap                       = None
        self._running                   = False
        self.y_correction_active: bool  = True

    @property
    def calibration(self) -> CalibrationModel:
        return self._calibration

    def start(self, camera_index: int = 0) -> None:
        if self._running:
            self.stop()
        self._cap = cv2.VideoCapture(camera_index)
        if not self._cap.isOpened():
            print(f"❌ 웹캠 {camera_index}번을 열 수 없습니다.")
            return
        print(f"✅ 웹캠 {camera_index}번 열기 성공")
        self._running = True
        threading.Thread(target=self._capture_loop, daemon=True).start()

    def stop(self) -> None:
        self._running = False
        if self._cap:
            self._cap.release()

    def clear_calibration(self) -> None:
        self._calibration.clear()
        self._kalman.reset()
        self._out_x = self._out_y = None

    def get_screen_pos(self) -> tuple[int, int] | None:
        if self.iris_pos is None or not self._calibration.is_ready:
            return None
        try:
            raw_x, raw_y = self._calibration.predict(self.iris_pos)
            if not (np.isfinite(raw_x) and np.isfinite(raw_y)):
                return None
            smooth_x, smooth_y = self._kalman.update(raw_x, raw_y)
            corrected_y = smooth_y * np.exp(-Y_CORRECTION_K * max(0.0, smooth_y - 100)) if self.y_correction_active else smooth_y
            new_x, new_y = int(smooth_x), int(corrected_y)
        except Exception as e:
            print(f"⚠ get_screen_pos 예외: {type(e).__name__}: {e}")
            return None
        if self._out_x is not None:
            if (abs(new_x - self._out_x) < DEADZONE_PX
                    and abs(new_y - self._out_y) < DEADZONE_PX):
                return self._out_x, self._out_y
        self._out_x, self._out_y = new_x, new_y
        return new_x, new_y

    def _capture_loop(self) -> None:
        frame_count = 0
        while self._running:
            ret, frame = self._cap.read()
            if not ret:
                continue
            frame_count += 1
            if frame_count == 1:
                print("✅ 웹캠 프레임 읽기 성공 - 시선 추적 시작됨")
            try:
                rgb      = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).copy()
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result   = self._landmarker.detect(mp_image)
                if result.face_landmarks:
                    lm            = result.face_landmarks[0]
                    self.iris_pos = self._extractor.extract(lm, frame)
                    annotated     = self._visualizer.draw(frame.copy(), lm)
                    self.latest_frame = cv2.flip(annotated, 1)
                else:
                    self.iris_pos     = None
                    self.latest_frame = cv2.flip(frame, 1)
            except Exception as e:
                import traceback
                print(f"❌ 캡처 루프 오류 (frame={frame_count}): {e}")
                traceback.print_exc()
                break
