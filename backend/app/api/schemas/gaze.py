from pydantic import BaseModel


class CalibrationPoint(BaseModel):
    x:     int
    y:     int
    count: int = 3  # 수집할 샘플 수 (이동 정지=2, 클릭=8)


class WebcamStartRequest(BaseModel):
    camera_index: int = 0
