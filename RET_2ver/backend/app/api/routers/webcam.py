import asyncio
import cv2
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from ..schemas import WebcamStartRequest

router = APIRouter(prefix="/api/webcam", tags=["webcam"])


def _get_tracker(request: Request):
    return request.app.state.tracker


@router.post("/start")
async def start(request: Request, req: WebcamStartRequest = WebcamStartRequest()):
    tracker = _get_tracker(request)
    tracker.start(req.camera_index)
    await asyncio.sleep(0.5)
    opened = tracker._cap is not None and tracker._cap.isOpened()
    return {"success": opened}


@router.post("/stop")
async def stop(request: Request):
    _get_tracker(request).stop()
    return {"success": True}


@router.get("/scan")
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
        print(f"카메라 {idx}번 발견 (평균 밝기: {brightness:.1f})")
        available.append({"index": idx, "is_black": brightness < 15})
    return {"cameras": available}


@router.get("/preview")
async def preview(request: Request):
    tracker = _get_tracker(request)

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
