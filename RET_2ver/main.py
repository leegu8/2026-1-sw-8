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

# 눈 윤곽 랜드마크 인덱스 (상대 홍채 위치 계산용)
L_EYE_INNER  = 133
L_EYE_OUTER  = 33
L_EYE_TOP    = 159
L_EYE_BOTTOM = 145
R_EYE_INNER  = 362
R_EYE_OUTER  = 263
R_EYE_TOP    = 386
R_EYE_BOTTOM = 374

SMOOTH_ALPHA = 0.10  # EMA 스무딩 강도 (낮을수록 부드럽고 느림)
DEADZONE_PX  = 6    # 이 픽셀 이내 움직임은 떨림으로 간주해 무시
Y_GAIN       = 1.5  # Y축 기울기 증폭 (수직 홍채 이동 범위가 수평보다 좁아서 보정)

# 얼굴 주요 부위 랜드마크 인덱스 그룹 (MediaPipe 478-point 모델 기준)
_OVAL  = [10,338,297,332,284,251,389,356,454,323,361,288,
          397,365,379,378,400,377,152,148,176,149,150,136,
          172,58,132,93,234,127,162,21,54,103,67,109,10]
_L_EYE = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398,362]
_R_EYE = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33]
_L_BROW = [276,283,282,295,285,300,293,334,296,336]
_R_BROW = [46,53,52,65,55,70,63,105,66,107]
_NOSE   = [168,6,197,195,5,4,1,19,94]
_LIPS   = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146,61]


def _extract_gaze_features(lm):
    """
    얼굴 랜드마크에서 고개 방향 불변 시선 특징을 추출한다.

    반환값: (rel_iris_x, rel_iris_y)
      - 홍채 위치를 눈 크기(가로·세로)로 정규화한 값
      - 고개를 돌려도 눈 안에서 홍채의 상대 위치는 유지되므로
        yaw/pitch를 특징에 포함하지 않는다.
        (yaw/pitch를 포함하면 보정 시 학습된 고개-화면 상관관계가
         시선 고정 상태에서도 점을 움직이는 원인이 됨)
    """
    l_cx = (lm[L_EYE_INNER].x + lm[L_EYE_OUTER].x) / 2
    l_cy = (lm[L_EYE_TOP].y   + lm[L_EYE_BOTTOM].y) / 2
    l_w  = abs(lm[L_EYE_OUTER].x - lm[L_EYE_INNER].x) + 1e-6
    l_h  = abs(lm[L_EYE_BOTTOM].y - lm[L_EYE_TOP].y)  + 1e-6

    r_cx = (lm[R_EYE_INNER].x + lm[R_EYE_OUTER].x) / 2
    r_cy = (lm[R_EYE_TOP].y   + lm[R_EYE_BOTTOM].y) / 2
    r_w  = abs(lm[R_EYE_OUTER].x - lm[R_EYE_INNER].x) + 1e-6
    r_h  = abs(lm[R_EYE_BOTTOM].y - lm[R_EYE_TOP].y)  + 1e-6

    rel_iris_x = ((lm[LEFT_IRIS].x - l_cx) / l_w + (lm[RIGHT_IRIS].x - r_cx) / r_w) / 2
    rel_iris_y = ((lm[LEFT_IRIS].y - l_cy) / l_h + (lm[RIGHT_IRIS].y - r_cy) / r_h) / 2

    return (rel_iris_x, rel_iris_y)


def _draw_landmarks(frame, landmarks):
    """
    얼굴 랜드마크를 프레임에 그린다.
      - 478개 전체 랜드마크: 작은 점 (얼굴 메시 시각화)
      - 홍채 중심 (468, 473): 원 + 십자선으로 강조
    """
    h, w = frame.shape[:2]

    def pts(indices):
        return np.array([[int(landmarks[i].x * w), int(landmarks[i].y * h)]
                         for i in indices], dtype=np.int32)

    # 얼굴 윤곽 (밝은 청록)
    cv2.polylines(frame, [pts(_OVAL)],   False, (0, 230, 140), 1)
    # 눈 윤곽 (하늘색)
    cv2.polylines(frame, [pts(_L_EYE)],  False, (0, 220, 255), 1)
    cv2.polylines(frame, [pts(_R_EYE)],  False, (0, 220, 255), 1)
    # 눈썹·코·입술 (연한 청록)
    cv2.polylines(frame, [pts(_L_BROW)], False, (0, 180, 110), 1)
    cv2.polylines(frame, [pts(_R_BROW)], False, (0, 180, 110), 1)
    cv2.polylines(frame, [pts(_NOSE)],   False, (0, 180, 110), 1)
    cv2.polylines(frame, [pts(_LIPS)],   False, (0, 180, 110), 1)

    # 홍채 중심 원 + 십자선
    for idx, color in [(LEFT_IRIS, (0, 255, 100)), (RIGHT_IRIS, (0, 200, 255))]:
        cx = int(landmarks[idx].x * w)
        cy = int(landmarks[idx].y * h)
        cv2.circle(frame, (cx, cy), 7, color, 2)
        cv2.line(frame, (cx - 11, cy), (cx + 11, cy), color, 1)
        cv2.line(frame, (cx, cy - 11), (cx, cy + 11), color, 1)

    return frame


# ─── 시선 트래커 클래스 ───────────────────────────────────────
class GazeTracker:
    """
    웹캠을 백그라운드 스레드에서 계속 읽고,
    MediaPipe FaceLandmarker로 홍채 위치를 계산하여 저장한다.
    """

    def __init__(self):
        self.iris_pos     = None   # 현재 시선 특징 벡터 (rel_iris_x, rel_iris_y, yaw_feat, pitch_feat)
        self.cal_data     = []     # [(rx, ry, yaw, pitch, screen_x, screen_y), ...]
        self.cal_matrix   = None   # 최소제곱법으로 계산된 변환 행렬 (12×2)
        self.latest_frame = None   # 위젯 미리보기용 최신 프레임
        self._smooth_x    = None
        self._smooth_y    = None
        self._out_x       = None   # 데드존 적용 후 최종 출력 좌표
        self._out_y       = None
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

                has_face = bool(result.face_landmarks)

                if has_face:
                    lm = result.face_landmarks[0]
                    self.iris_pos = _extract_gaze_features(lm)
                    if frame_count <= 3:
                        print(f'✅ 얼굴 감지됨: iris_pos={self.iris_pos}')

                    # 랜드마크를 그린 뒤 미리보기용으로 저장
                    annotated = _draw_landmarks(frame.copy(), lm)
                    self.latest_frame = cv2.flip(annotated, 1)
                else:
                    self.iris_pos = None
                    self.latest_frame = cv2.flip(frame, 1)
                    if frame_count % 60 == 0:
                        print(f'⚠ 얼굴 미감지 (frame={frame_count})')

            except Exception as e:
                import traceback
                print(f'❌ 캡처 루프 오류 (frame={frame_count}): {e}')
                traceback.print_exc()
                break   # 반복 에러 방지

    # ── 보정 ─────────────────────────────────────────────────
    def add_calibration_samples(self, iris_samples: list,
                                 screen_x: int, screen_y: int) -> None:
        """
        4차원 시선 특징 샘플들을 개별 데이터 포인트로 저장한다 (이상치 제거 후).

        각 샘플은 (rel_iris_x, rel_iris_y, yaw_feat, pitch_feat) 튜플.
        이상치 제거: 각 특징 차원에서 평균 ± 2σ 밖의 샘플을 제외.
        """
        if not iris_samples:
            return

        arr = np.array(iris_samples, dtype=np.float64)   # (N, 2)
        mean = arr.mean(axis=0)
        std  = arr.std(axis=0) + 1e-9

        valid = [s for s in iris_samples
                 if np.all(np.abs(np.array(s) - mean) <= 2 * std)]
        if not valid:
            valid = iris_samples

        for s in valid:
            self.cal_data.append((*s, screen_x, screen_y))  # (rx, ry, sx, sy)

        if len(self.cal_data) >= 6:    # 모델당 특징 6개 → 최소 6포인트 필요
            self._compute_matrix()

    def clear_calibration(self):
        self.cal_data   = []
        self.cal_matrix = None
        self._smooth_x  = None
        self._smooth_y  = None
        self._out_x     = None
        self._out_y     = None

    def _compute_matrix(self):
        """
        X·Y 독립 2차 다항식 회귀. 특징은 상대 홍채 위치만 사용.

        screen_x ← [rx, rx², 1]
        screen_y ← [ry, ry², 1]

        yaw/pitch를 제거한 이유:
          보정 중 사용자가 특정 방향을 볼 때 고개도 자연히 약간 돌아가므로,
          yaw/pitch를 특징에 포함하면 '고개 방향 → 화면 위치'를 학습하게 됨.
          그 결과 시선은 고정해도 고개를 돌리면 점이 따라 움직인다.
        """
        arr = np.array(self.cal_data, dtype=np.float64)
        rx, ry = arr[:,0], arr[:,1]
        sx, sy = arr[:,2], arr[:,3]

        Ax = np.column_stack([rx, np.ones(len(arr))])
        Ay = np.column_stack([ry, np.ones(len(arr))])

        cx, _, _, _ = np.linalg.lstsq(Ax, sx, rcond=None)
        cy, _, _, _ = np.linalg.lstsq(Ay, sy, rcond=None)
        cy[0] *= Y_GAIN  # 수직 홍채 이동 범위가 좁으므로 기울기를 증폭
        self.cal_matrix = (cx, cy)

    def get_screen_pos(self):
        """
        현재 홍채 위치를 화면 좌표로 변환하고 EMA 스무딩을 적용한다.
        보정이 완료되지 않았거나 얼굴이 없으면 None 반환.
        """
        if self.iris_pos is None or self.cal_matrix is None:
            return None

        rx, ry = self.iris_pos
        cx, cy = self.cal_matrix

        raw_x = float(np.array([rx, 1.0]) @ cx)
        raw_y = float(np.array([ry, 1.0]) @ cy)

        if self._smooth_x is None:
            self._smooth_x, self._smooth_y = raw_x, raw_y
        else:
            self._smooth_x = SMOOTH_ALPHA * raw_x + (1 - SMOOTH_ALPHA) * self._smooth_x
            self._smooth_y = SMOOTH_ALPHA * raw_y + (1 - SMOOTH_ALPHA) * self._smooth_y

        new_x, new_y = int(self._smooth_x), int(self._smooth_y)

        # 데드존: 직전 출력과 차이가 작으면 떨림으로 간주해 이전 값 유지
        if self._out_x is not None:
            if abs(new_x - self._out_x) < DEADZONE_PX and abs(new_y - self._out_y) < DEADZONE_PX:
                return self._out_x, self._out_y

        self._out_x, self._out_y = new_x, new_y
        return new_x, new_y


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
            _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
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
