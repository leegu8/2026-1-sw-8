import asyncio
from fastapi import APIRouter, Request
from ..schemas import CalibrationPoint
from ...core.config import SAMPLE_COUNT, SAMPLE_INTERVAL

router = APIRouter(prefix="/api/calibrate", tags=["calibration"])


def _get_tracker(request: Request):
    return request.app.state.tracker


@router.post("")
async def add_calibration(point: CalibrationPoint, request: Request):
    tracker = _get_tracker(request)
    samples = []
    for _ in range(SAMPLE_COUNT):
        if tracker.iris_pos is not None:
            samples.append(tracker.iris_pos)
        await asyncio.sleep(SAMPLE_INTERVAL)

    if not samples:
        return {"success": False, "count": tracker.calibration.point_count, "calibrated": False}

    tracker.calibration.add_samples(samples, point.x, point.y)
    return {
        "success":      True,
        "count":        tracker.calibration.point_count,
        "calibrated":   tracker.calibration.is_ready,
        "samples_used": len(samples),
    }


@router.delete("")
async def clear_calibration(request: Request):
    _get_tracker(request).clear_calibration()
    return {"success": True}


@router.get("/status")
async def calibration_status(request: Request):
    tracker = _get_tracker(request)
    return {"count": tracker.calibration.point_count, "calibrated": tracker.calibration.is_ready}
