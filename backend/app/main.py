from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .core.model_loader import ensure_model, create_landmarker
from .domain.gaze.feature_extractor import GazeFeatureExtractor
from .domain.gaze.calibration import CalibrationModel
from .domain.gaze.visualizer import FaceMeshVisualizer
from .domain.gaze.tracker import GazeTracker
from .db.session import init_db
from .api.routers import calibration, webcam, gaze_ws, database

_ROOT        = Path(__file__).parent.parent.parent
_FRONTEND    = _ROOT / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
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

app.mount("/static", StaticFiles(directory=str(_FRONTEND / "static")), name="static")

app.include_router(calibration)
app.include_router(webcam)
app.include_router(gaze_ws)
app.include_router(database)


@app.get("/api/status")
async def system_status(request: Request):
    tracker = request.app.state.tracker
    return {
        "webcam_open":   tracker._cap is not None and tracker._cap.isOpened(),
        "iris_detected": tracker.iris_pos is not None,
        "calibrated":    tracker.calibration.is_ready,
        "cal_count":     tracker.calibration.point_count,
    }


@app.get("/")
async def root():
    return FileResponse(str(_FRONTEND / "pages" / "index.html"))


@app.get("/{page}.html")
async def serve_page(page: str):
    path = _FRONTEND / "pages" / f"{page}.html"
    if path.exists():
        return FileResponse(str(path))
    return FileResponse(str(_FRONTEND / "pages" / "index.html"))
