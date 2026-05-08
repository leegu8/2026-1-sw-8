import numpy as np
from ...core.config import Y_GAIN


class CalibrationModel:
    """
    홍채 상대 좌표 → 화면 픽셀 좌표 선형 회귀 모델.

    X/Y 를 독립적으로 피팅하고, Y 기울기에 Y_GAIN 을 곱해
    수직 이동 범위가 수평보다 좁은 문제를 보정한다.
    """

    _MIN_POINTS = 6

    def __init__(self, y_gain: float = Y_GAIN) -> None:
        self._y_gain = y_gain
        self._data: list[tuple] = []
        self._cx = None
        self._cy = None

    @property
    def is_ready(self) -> bool:
        return self._cx is not None

    @property
    def point_count(self) -> int:
        return len(self._data)

    def add_samples(self, samples: list, screen_x: int, screen_y: int) -> None:
        if not samples:
            return
        arr  = np.array(samples, dtype=np.float64)
        mean = arr.mean(axis=0)
        std  = arr.std(axis=0) + 1e-9
        valid = [s for s in samples
                 if np.all(np.abs(np.array(s) - mean) <= 2 * std)]
        if not valid:
            valid = samples
        for s in valid:
            self._data.append((*s, screen_x, screen_y))
        if len(self._data) >= self._MIN_POINTS:
            self._fit()

    def predict(self, rx: float, ry: float) -> tuple[float, float]:
        raw_x = float(np.array([rx, 1.0]) @ self._cx)
        raw_y = float(np.array([ry, 1.0]) @ self._cy)
        return raw_x, raw_y

    def clear(self) -> None:
        self._data = []
        self._cx   = None
        self._cy   = None

    def _fit(self) -> None:
        arr = np.array(self._data, dtype=np.float64)
        rx, ry = arr[:, 0], arr[:, 1]
        sx, sy = arr[:, 2], arr[:, 3]

        Ax = np.column_stack([rx, np.ones(len(arr))])
        Ay = np.column_stack([ry, np.ones(len(arr))])

        self._cx, *_ = np.linalg.lstsq(Ax, sx, rcond=None)
        self._cy, *_ = np.linalg.lstsq(Ay, sy, rcond=None)
        self._cy[0] *= self._y_gain
