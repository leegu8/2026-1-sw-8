import asyncio
from fastapi import APIRouter, Request
from ..schemas import CalibrationPoint

router = APIRouter(prefix="/api/calibrate", tags=["calibration"])


def _get_tracker(request: Request):
    return request.app.state.tracker


@router.post("")
async def add_calibration(point: CalibrationPoint, request: Request):
    tracker = _get_tracker(request)
    count   = max(1, min(point.count, 20))
    samples = []

    for _ in range(count):
        if tracker.iris_pos is not None:
            samples.append(tracker.iris_pos.copy())
        await asyncio.sleep(0.016)  # 1프레임 대기 후 다음 샘플

    if not samples:
        return {
            "success":      False,
            "sample_count": tracker.calibration.sample_count,
            "calibrated":   False,
        }

    tracker.calibration.add_samples(samples, point.x, point.y)
    return {
        "success":      True,
        "sample_count": tracker.calibration.sample_count,
        "calibrated":   tracker.calibration.is_ready,
    }


@router.delete("")
async def clear_calibration(request: Request):
    _get_tracker(request).clear_calibration()
    return {"success": True}


@router.post("/y-correction")
async def set_y_correction(request: Request, active: bool):
    _get_tracker(request).y_correction_active = active
    return {"active": active}


@router.get("/status")
async def calibration_status(request: Request):
    tracker = _get_tracker(request)
    return {
        "count":        tracker.calibration.point_count,
        "sample_count": tracker.calibration.sample_count,
        "calibrated":   tracker.calibration.is_ready,
    }
