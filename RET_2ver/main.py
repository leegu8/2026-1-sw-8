# =====================================================
# main.py - FastAPI 서버
#
# 역할:
#   1. static/ 폴더의 HTML/CSS/JS 파일을 브라우저에 제공
#   2. REST API (/api/calibrate) 로 보정 데이터 수집
#   3. WebSocket (/ws) 으로 실시간 시선 좌표 스트리밍
#
# 동작 방식:
#   서버가 시작되면 웹캠을 열고 백그라운드 스레드에서
#   MediaPipe로 홍채 위치를 계속 계산한다.
#   브라우저가 /ws 에 연결하면 30fps로 좌표를 전송한다.
# =====================================================

import cv2
import mediapipe as mp
import numpy as np
import threading
import asyncio
import urllib.request
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

# MediaPipe Tasks API (mediapipe 0.10.x 이상에서 사용하는 새 방식)
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision


# ─── 모델 파일 자동 다운로드 ──────────────────────────────────
# MediaPipe Tasks API는 별도의 .task 모델 파일이 필요하다.
# 없으면 자동으로 다운로드 (첫 실행 시 한 번만, 약 30MB)
MODEL_PATH = 'face_landmarker.task'
MODEL_URL  = (
    'https://storage.googleapis.com/mediapipe-models/'
    'face_landmarker/face_landmarker/float16/latest/face_landmarker.task'
)

def ensure_model():
    if not os.path.exists(MODEL_PATH):
        print('face_landmarker.task 모델 다운로드 중... (첫 실행 시 한 번만, 약 30MB)')
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print('다운로드 완료')


# ─── FaceLandmarker 초기화 ────────────────────────────────────
# FaceLandmarker 는 478개의 얼굴 랜드마크를 반환하며,
# 468번(왼쪽 홍채), 473번(오른쪽 홍채)이 홍채 중심 좌표다.
_landmarker = None

def init_landmarker():
    global _landmarker
    base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
    options = mp_vision.FaceLandmarkerOptions(
        base_options=base_options,
        num_faces=1,
        min_face_detection_confidence=0.3,
        min_face_presence_confidence=0.3,
        min_tracking_confidence=0.3,
    )
    _landmarker = mp_vision.FaceLandmarker.create_from_options(options)

LEFT_IRIS  = 468   # 왼쪽 홍채 중심 랜드마크 인덱스
RIGHT_IRIS = 473   # 오른쪽 홍채 중심 랜드마크 인덱스

SMOOTH_ALPHA = 0.25  # EMA 스무딩 강도 (낮을수록 부드럽고 느림)


def _draw_landmarks(frame, landmarks):
    """
    얼굴 랜드마크를 프레임에 그린다.
      - 478개 전체 랜드마크: 작은 점 (얼굴 메시 시각화)
      - 홍채 중심 (468, 473): 원 + 십자선으로 강조
    """
    h, w = frame.shape[:2]

    # 모든 랜드마크를 1px 초록 점으로 표시 → 얼굴 메시처럼 보임
    for lm in landmarks:
        px, py = int(lm.x * w), int(lm.y * h)
        cv2.circle(frame, (px, py), 1, (0, 200, 80), -1)

    # 홍채 중심: 원 + 십자선
    for idx, color in [(LEFT_IRIS, (0, 255, 80)), (RIGHT_IRIS, (0, 220, 255))]:
        cx, cy = int(landmarks[idx].x * w), int(landmarks[idx].y * h)
        cv2.circle(frame, (cx, cy), 7, color, 2)          # 원
        cv2.line(frame, (cx - 11, cy), (cx + 11, cy), color, 1)  # 가로선
        cv2.line(frame, (cx, cy - 11), (cx, cy + 11), color, 1)  # 세로선

    return frame


# ─── 시선 트래커 클래스 ───────────────────────────────────────
class GazeTracker:
    """
    웹캠을 백그라운드 스레드에서 계속 읽고,
    MediaPipe FaceLandmarker로 홍채 위치를 계산하여 저장한다.
    """

    def __init__(self):
        self.iris_pos     = None   # 현재 홍채 정규화 좌표 (0~1, 이미지 기준)
        self.cal_data     = []     # [(iris_x, iris_y, screen_x, screen_y), ...]
        self.cal_matrix   = None   # 최소제곱법으로 계산된 변환 행렬 (3×2)
        self.latest_frame = None   # 위젯 미리보기용 최신 프레임
        self._smooth_x    = None
        self._smooth_y    = None
        self._cap         = None
        self._running     = False

    def start(self, camera_index: int = 0):
        """지정한 인덱스의 웹캠을 열고 백그라운드 캡처 스레드를 시작한다."""
        if self._running:
            self.stop()

        self._cap = cv2.VideoCapture(camera_index)
        if not self._cap.isOpened():
            print(f'❌ 웹캠 {camera_index}번을 열 수 없습니다.')
            return

        print(f'✅ 웹캠 {camera_index}번 열기 성공')
        self._running = True
        t = threading.Thread(target=self._capture_loop, daemon=True)
        t.start()

    def stop(self):
        self._running = False
        if self._cap:
            self._cap.release()

    def _capture_loop(self):
        """
        매 프레임마다 웹캠 이미지를 읽고 홍채 위치를 self.iris_pos 에 저장.
        FaceLandmarker.detect() 로 얼굴 랜드마크를 추출한다.
        """
        frame_count = 0
        while self._running:
            ret, frame = self._cap.read()
            if not ret:
                continue

            frame_count += 1
            if frame_count == 1:
                print('✅ 웹캠 프레임 읽기 성공 - 시선 추적 시작됨')

            try:
                # BGR → RGB 변환, MediaPipe 는 연속 메모리 배열 필요
                rgb      = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                rgb      = rgb.copy()   # C-contiguous 배열 보장
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result   = _landmarker.detect(mp_image)

                if result.face_landmarks:
                    lm = result.face_landmarks[0]
                    self.iris_pos = (
                        (lm[LEFT_IRIS].x + lm[RIGHT_IRIS].x) / 2,
                        (lm[LEFT_IRIS].y + lm[RIGHT_IRIS].y) / 2,
                    )
                    if frame_count <= 3:
                        print(f'✅ 얼굴 감지됨: iris_pos={self.iris_pos}')

                    # 랜드마크를 그린 뒤 미리보기용으로 저장
                    annotated = _draw_landmarks(frame.copy(), lm)
                    self.latest_frame = cv2.flip(annotated, 1)
                else:
                    self.iris_pos = None
                    self.latest_frame = cv2.flip(frame, 1)   # 감지 안 되면 원본만 반전
                    if frame_count % 60 == 0:
                        print(f'⚠ 얼굴 미감지 (frame={frame_count})')

            except Exception as e:
                import traceback
                print(f'❌ 캡처 루프 오류 (frame={frame_count}): {e}')
                traceback.print_exc()
                break   # 반복 에러 방지

    # ── 보정 ─────────────────────────────────────────────────
    def add_calibration_point(self, iris_x: float, iris_y: float,
                               screen_x: int, screen_y: int) -> None:
        """평균 홍채 좌표와 화면 좌표를 보정 데이터에 추가한다."""
        self.cal_data.append((iris_x, iris_y, screen_x, screen_y))
        if len(self.cal_data) >= 6:
            self._compute_matrix()

    def add_calibration_samples(self, iris_samples: list,
                                 screen_x: int, screen_y: int) -> None:
        """
        여러 홍채 샘플을 개별 데이터 포인트로 저장한다 (이상치 제거 후).

        평균 1개만 저장하는 대신 각 샘플을 독립 데이터로 사용하면
        최소제곱법 적합도가 크게 향상된다.
        이상치 제거: 평균에서 2σ 이상 벗어난 샘플 제외.
        """
        if not iris_samples:
            return

        xs = np.array([s[0] for s in iris_samples])
        ys = np.array([s[1] for s in iris_samples])
        x_mean, x_std = xs.mean(), xs.std() + 1e-9
        y_mean, y_std = ys.mean(), ys.std() + 1e-9

        valid = [
            s for s in iris_samples
            if abs(s[0] - x_mean) <= 2 * x_std
            and abs(s[1] - y_mean) <= 2 * y_std
        ]
        if not valid:
            valid = iris_samples  # 모두 제거될 경우 폴백

        for s in valid:
            self.cal_data.append((s[0], s[1], screen_x, screen_y))

        if len(self.cal_data) >= 6:
            self._compute_matrix()

    def clear_calibration(self):
        self.cal_data   = []
        self.cal_matrix = None
        self._smooth_x  = None
        self._smooth_y  = None

    def _compute_matrix(self):
        """
        2차 다항식 최소제곱법으로 홍채 좌표 → 화면 좌표 변환 행렬을 계산한다.

        선형 변환(affine)은 홍채-화면 간 비선형성을 표현하지 못한다.
        2차 항(x², y², xy)을 추가하면 원근 왜곡·굴절 등 비선형 오차를 보정할 수 있다.

        수식:  [sx, sy] ≈ [x, y, x², y², xy, 1] @ matrix
        matrix 의 shape 는 (6, 2).
        """
        src = np.array([[d[0], d[1]] for d in self.cal_data], dtype=np.float64)
        dst = np.array([[d[2], d[3]] for d in self.cal_data], dtype=np.float64)
        x, y = src[:, 0], src[:, 1]
        A = np.column_stack([x, y, x**2, y**2, x * y, np.ones(len(src))])
        result, _, _, _ = np.linalg.lstsq(A, dst, rcond=None)
        self.cal_matrix = result   # shape (6, 2)

    def get_screen_pos(self):
        """
        현재 홍채 위치를 화면 좌표로 변환하고 EMA 스무딩을 적용한다.
        보정이 완료되지 않았거나 얼굴이 없으면 None 반환.
        """
        if self.iris_pos is None or self.cal_matrix is None:
            return None

        px, py = self.iris_pos[0], self.iris_pos[1]
        v      = np.array([px, py, px**2, py**2, px * py, 1.0])
        xy     = v @ self.cal_matrix
        raw_x, raw_y = float(xy[0]), float(xy[1])

        if self._smooth_x is None:
            self._smooth_x, self._smooth_y = raw_x, raw_y
        else:
            self._smooth_x = SMOOTH_ALPHA * raw_x + (1 - SMOOTH_ALPHA) * self._smooth_x
            self._smooth_y = SMOOTH_ALPHA * raw_y + (1 - SMOOTH_ALPHA) * self._smooth_y

        return int(self._smooth_x), int(self._smooth_y)


# ─── 전역 트래커 인스턴스 ─────────────────────────────────────
tracker = GazeTracker()


# ─── 서버 수명 주기 ───────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_model()      # 모델 파일 확인 / 다운로드
    init_landmarker()   # FaceLandmarker 초기화 (웹캠은 아직 열지 않음)
    yield
    tracker.stop()      # 서버 종료 시 혹시 켜져 있으면 닫기

app = FastAPI(lifespan=lifespan)


# ─── 정적 파일 제공 ───────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")


# ─── 페이지 라우트 ───────────────────────────────────────────
@app.get("/")
async def root():
    return FileResponse("static/index.html")

@app.get("/{page}.html")
async def serve_page(page: str):
    path = Path(f"static/{page}.html")
    if path.exists():
        return FileResponse(str(path))
    return FileResponse("static/index.html")


# ─── 보정 REST API ────────────────────────────────────────────
class CalibrationPoint(BaseModel):
    x: int
    y: int

SAMPLE_COUNT    = 25     # 샘플 수집 횟수
SAMPLE_INTERVAL = 0.02   # 샘플 간격 (초) → 25회 × 20ms = 500ms 총 수집

@app.post("/api/calibrate")
async def add_calibration(point: CalibrationPoint):
    """
    사용자가 보정 점을 클릭하면 200ms 동안 홍채 좌표를 10번 샘플링해서
    평균값을 보정 데이터로 저장한다.

    단일 순간값 대신 평균을 쓰는 이유:
      - 클릭 순간 눈이 아직 미세하게 흔들릴 수 있음
      - 카메라 노이즈로 인한 1프레임 오차를 완화
      - 짧은 구간의 평균이 단일 샘플보다 훨씬 안정적
    """
    samples = []
    for _ in range(SAMPLE_COUNT):
        if tracker.iris_pos is not None:
            samples.append(tracker.iris_pos)
        await asyncio.sleep(SAMPLE_INTERVAL)

    if not samples:
        return {"success": False, "count": len(tracker.cal_data), "calibrated": False}

    tracker.add_calibration_samples(samples, point.x, point.y)

    return {
        "success":      True,
        "count":        len(tracker.cal_data),
        "calibrated":   tracker.cal_matrix is not None,
        "samples_used": len(samples),
    }

@app.delete("/api/calibrate")
async def clear_calibration():
    tracker.clear_calibration()
    return {"success": True}

class WebcamStartRequest(BaseModel):
    camera_index: int = 0

@app.post("/api/webcam/start")
async def webcam_start(req: WebcamStartRequest = WebcamStartRequest()):
    """사용자 동의 후 지정한 인덱스의 웹캠을 활성화한다."""
    tracker.start(req.camera_index)
    await asyncio.sleep(0.5)
    opened = tracker._cap is not None and tracker._cap.isOpened()
    return {"success": opened}

@app.post("/api/webcam/stop")
async def webcam_stop():
    tracker.stop()
    return {"success": True}

@app.get("/api/webcam/scan")
async def webcam_scan():
    """인덱스 0~4 까지 카메라를 스캔하여 사용 가능한 목록을 반환한다."""
    available = []
    for idx in range(5):
        cap = cv2.VideoCapture(idx)
        if not cap.isOpened():
            cap.release()
            continue
        ret, frame = cap.read()
        cap.release()
        if not ret:
            continue
        brightness = float(frame.mean())
        print(f'카메라 {idx}번 발견 (평균 밝기: {brightness:.1f})')
        available.append({
            "index":    idx,
            "is_black": brightness < 15,
        })
    return {"cameras": available}

@app.get("/api/calibrate/status")
async def calibration_status():
    return {
        "count":      len(tracker.cal_data),
        "calibrated": tracker.cal_matrix is not None,
    }

@app.get("/api/webcam/preview")
async def webcam_preview():
    """웹캠 영상을 MJPEG 스트림으로 제공한다 (위젯 미리보기용, 10fps)."""
    async def generate():
        while True:
            frame = tracker.latest_frame
            if frame is None:
                await asyncio.sleep(0.1)
                continue
            _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 55])
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' + buf.tobytes() + b'\r\n'
            )
            await asyncio.sleep(0.1)   # 10fps — 미리보기는 낮은 프레임으로 충분

    return StreamingResponse(generate(), media_type='multipart/x-mixed-replace; boundary=frame')

@app.get("/api/status")
async def system_status():
    """웹캠·얼굴 감지 상태를 한눈에 확인하는 진단 엔드포인트."""
    return {
        "webcam_open":    tracker._cap is not None and tracker._cap.isOpened(),
        "iris_detected":  tracker.iris_pos is not None,
        "iris_pos":       tracker.iris_pos,
        "calibrated":     tracker.cal_matrix is not None,
        "cal_count":      len(tracker.cal_data),
    }


# ─── WebSocket: 실시간 시선 스트리밍 ─────────────────────────
@app.websocket("/ws")
async def websocket_gaze(websocket: WebSocket):
    """
    브라우저가 연결하면 30fps 로 시선 좌표를 JSON 으로 전송한다.

    전송 메시지 형식:
        {"type": "gaze", "x": 450, "y": 310, "calibrated": true}
        {"type": "gaze", "calibrated": false}   ← 보정 전
        {"type": "no_face"}                      ← 얼굴 미감지
    """
    await websocket.accept()
    try:
        while True:
            pos  = tracker.get_screen_pos()
            iris = tracker.iris_pos

            if pos:
                await websocket.send_json({
                    "type":       "gaze",
                    "x":          pos[0],
                    "y":          pos[1],
                    "calibrated": True,
                })
            elif iris:
                await websocket.send_json({
                    "type":       "gaze",
                    "calibrated": False,
                })
            else:
                await websocket.send_json({"type": "no_face"})

            await asyncio.sleep(0.033)

    except WebSocketDisconnect:
        pass
