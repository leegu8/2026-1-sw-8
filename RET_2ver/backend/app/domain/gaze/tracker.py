import cv2
import mediapipe as mp
import threading

from .feature_extractor import GazeFeatureExtractor
from .calibration import CalibrationModel
from .visualizer import FaceMeshVisualizer
from ...core.config import SMOOTH_ALPHA, DEADZONE_PX


class GazeTracker:
    """
    웹캠을 백그라운드 스레드에서 읽고 시선 특징을 계산한다.

    캡처·감지 루프만 담당하며, 특징 추출/보정/시각화는
    각 전문 클래스에 위임한다 (SRP, DIP).
    """

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
        self._smooth_x:    float | None = None
        self._smooth_y:    float | None = None
        self._out_x:       int   | None = None
        self._out_y:       int   | None = None
        self._cap                       = None
        self._running                   = False

    @property
    def calibration(self) -> CalibrationModel:
        return self._calibration

    # ── 웹캠 제어 ────────────────────────────────────────────

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

    # ── 보정 상태 초기화 ──────────────────────────────────────

    def clear_calibration(self) -> None:
        self._calibration.clear()
        self._smooth_x = self._smooth_y = None
        self._out_x    = self._out_y    = None

    # ── 화면 좌표 반환 ────────────────────────────────────────

    def get_screen_pos(self) -> tuple[int, int] | None:
        if self.iris_pos is None or not self._calibration.is_ready:
            return None

        rx, ry       = self.iris_pos
        raw_x, raw_y = self._calibration.predict(rx, ry)

        if self._smooth_x is None:
            self._smooth_x, self._smooth_y = raw_x, raw_y
        else:
            self._smooth_x = SMOOTH_ALPHA * raw_x + (1 - SMOOTH_ALPHA) * self._smooth_x
            self._smooth_y = SMOOTH_ALPHA * raw_y + (1 - SMOOTH_ALPHA) * self._smooth_y

        new_x, new_y = int(self._smooth_x), int(self._smooth_y)

        if self._out_x is not None:
            if (abs(new_x - self._out_x) < DEADZONE_PX
                    and abs(new_y - self._out_y) < DEADZONE_PX):
                return self._out_x, self._out_y

        self._out_x, self._out_y = new_x, new_y
        return new_x, new_y

    # ── 캡처 루프 (백그라운드 스레드) ─────────────────────────

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
                    self.iris_pos = self._extractor.extract(lm)
                    annotated     = self._visualizer.draw(frame.copy(), lm)
                    self.latest_frame = cv2.flip(annotated, 1)
                    if frame_count <= 3:
                        print(f"✅ 얼굴 감지됨: iris_pos={self.iris_pos}")
                else:
                    self.iris_pos     = None
                    self.latest_frame = cv2.flip(frame, 1)
                    if frame_count % 60 == 0:
                        print(f"⚠ 얼굴 미감지 (frame={frame_count})")

            except Exception as e:
                import traceback
                print(f"❌ 캡처 루프 오류 (frame={frame_count}): {e}")
                traceback.print_exc()
                break
