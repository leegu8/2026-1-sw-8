import asyncio
import cv2
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel

from .config import MODEL_PATH, MODEL_URL, DEADZONE_PX, Y_CORRECTION_K
from .model_loader import ensure_model, create_landmarker
from .gaze.tracker import GazeTracker
from .gaze.feature_extractor import GazeFeatureExtractor
from .gaze.calibration import CalibrationModel
from .gaze.visualizer import FaceMeshVisualizer


class CalibrationPoint(BaseModel):
    x:     int
    y:     int
    count: int = 3


class WebcamStartRequest(BaseModel):
    camera_index: int = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_model()
    app.state.tracker = GazeTracker(
        landmarker  = create_landmarker(),
        extractor   = GazeFeatureExtractor(),
        calibration = CalibrationModel(),
        visualizer  = FaceMeshVisualizer(),
    )
    yield
    app.state.tracker.stop()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class _PrivateNetworkMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if (request.method == "OPTIONS"
                and "access-control-request-private-network" in request.headers):
            res = Response()
            res.headers["Access-Control-Allow-Origin"] = request.headers.get("origin", "*")
            res.headers["Access-Control-Allow-Private-Network"] = "true"
            res.headers["Access-Control-Allow-Methods"] = "*"
            res.headers["Access-Control-Allow-Headers"] = "*"
            return res
        response = await call_next(request)
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


app.add_middleware(_PrivateNetworkMiddleware)


def _tracker(request: Request):
    return request.app.state.tracker


# ── 보정 ──────────────────────────────────────────────────────

@app.post("/api/calibrate")
async def add_calibration(point: CalibrationPoint, request: Request):
    tracker = _tracker(request)
    count   = max(1, min(point.count, 20))
    samples = []
    for _ in range(count):
        if tracker.iris_pos is not None:
            samples.append(tracker.iris_pos.copy())
        await asyncio.sleep(0.016)
    if not samples:
        return {"success": False, "sample_count": tracker.calibration.sample_count, "calibrated": False}
    tracker.calibration.add_samples(samples, point.x, point.y)
    return {"success": True, "sample_count": tracker.calibration.sample_count, "calibrated": tracker.calibration.is_ready}


@app.delete("/api/calibrate")
async def clear_calibration(request: Request):
    _tracker(request).clear_calibration()
    return {"success": True}


@app.post("/api/calibrate/y-correction")
async def set_y_correction(request: Request, active: bool):
    _tracker(request).y_correction_active = active
    return {"active": active}


@app.get("/api/calibrate/status")
async def calibration_status(request: Request):
    tracker = _tracker(request)
    return {
        "count":        tracker.calibration.point_count,
        "sample_count": tracker.calibration.sample_count,
        "calibrated":   tracker.calibration.is_ready,
    }


# ── 웹캠 ──────────────────────────────────────────────────────

@app.post("/api/webcam/start")
async def start(request: Request, req: WebcamStartRequest = WebcamStartRequest()):
    tracker = _tracker(request)
    tracker.start(req.camera_index)
    await asyncio.sleep(0.5)
    opened = tracker._cap is not None and tracker._cap.isOpened()
    return {"success": opened}


@app.post("/api/webcam/stop")
async def stop(request: Request):
    _tracker(request).stop()
    return {"success": True}


@app.get("/api/webcam/scan")
async def scan():
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
        available.append({"index": idx, "is_black": brightness < 15})
    return {"cameras": available}


@app.get("/api/webcam/preview")
async def preview(request: Request):
    tracker = _tracker(request)

    async def generate():
        while True:
            frame = tracker.latest_frame
            if frame is None:
                await asyncio.sleep(0.1)
                continue
            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
            )
            await asyncio.sleep(0.1)

    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")


# ── 상태 ──────────────────────────────────────────────────────

@app.get("/api/status")
async def system_status(request: Request):
    tracker = _tracker(request)
    return {
        "webcam_open":   tracker._cap is not None and tracker._cap.isOpened(),
        "iris_detected": tracker.iris_pos is not None,
        "calibrated":    tracker.calibration.is_ready,
        "cal_count":     tracker.calibration.point_count,
    }


# ── WebSocket ─────────────────────────────────────────────────

@app.websocket("/ws")
async def gaze_websocket(websocket: WebSocket):
    await websocket.accept()
    tracker = websocket.app.state.tracker
    try:
        while True:
            try:
                pos  = tracker.get_screen_pos()
                iris = tracker.iris_pos
                if pos:
                    await websocket.send_json({"type": "gaze", "x": pos[0], "y": pos[1], "calibrated": True})
                elif iris is not None:
                    await websocket.send_json({"type": "gaze", "calibrated": False})
                else:
                    await websocket.send_json({"type": "no_face"})
            except WebSocketDisconnect:
                raise
            except Exception as e:
                print(f"[WARN] WebSocket 내부 오류: {e}")
            await asyncio.sleep(0.033)
    except WebSocketDisconnect:
        pass
