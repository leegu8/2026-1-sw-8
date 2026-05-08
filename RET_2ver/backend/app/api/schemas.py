from pydantic import BaseModel


class CalibrationPoint(BaseModel):
    x: int
    y: int


class WebcamStartRequest(BaseModel):
    camera_index: int = 0
