import numpy as np

RIDGE_ALPHA = 1.0
_MIN_POINTS = 4     # 최소 4개 보정점 이상이면 즉시 학습


class CalibrationModel:
    """
    120차원 눈 패치 특징 벡터 → 화면 픽셀 좌표 Ridge Regression 모델.

    마우스 이동(정지) + 클릭 데이터를 통해 누적 학습한다.
    샘플 수가 _MIN_SAMPLES(150) 이상이 되면 학습을 시작한다.
    """

    def __init__(self) -> None:
        self._features:    list[np.ndarray] = []
        self._screen_x:    list[float]      = []
        self._screen_y:    list[float]      = []
        self._wx:          np.ndarray | None = None
        self._wy:          np.ndarray | None = None
        self._point_count: int              = 0

    @property
    def is_ready(self) -> bool:
        return self._wx is not None

    @property
    def point_count(self) -> int:
        return self._point_count

    @property
    def sample_count(self) -> int:
        return len(self._features)

    def add_samples(self, samples: list[np.ndarray],
                    screen_x: int, screen_y: int) -> None:
        if not samples:
            return

        arr   = np.array(samples, dtype=np.float64)
        mean  = arr.mean(axis=0)
        dists = np.linalg.norm(arr - mean, axis=1)
        threshold = dists.mean() + 2 * dists.std() if dists.std() > 0 else np.inf
        valid = arr[dists <= threshold]
        if len(valid) == 0:
            valid = arr

        for feat in valid:
            if not np.any(feat):  # 특징 추출 실패 샘플(zeros) 제외
                continue
            self._features.append(feat)
            self._screen_x.append(float(screen_x))
            self._screen_y.append(float(screen_y))

        self._point_count += 1
        if self._point_count >= _MIN_POINTS:
            self._fit()

    def predict(self, features: np.ndarray) -> tuple[float, float]:
        feat_b = np.append(features, 1.0)
        return float(feat_b @ self._wx), float(feat_b @ self._wy)

    def clear(self) -> None:
        self._features    = []
        self._screen_x    = []
        self._screen_y    = []
        self._wx          = None
        self._wy          = None
        self._point_count = 0

    def _fit(self) -> None:
        X   = np.array(self._features, dtype=np.float64)
        X_b = np.column_stack([X, np.ones(len(X))])
        sx  = np.array(self._screen_x)
        sy  = np.array(self._screen_y)

        n   = X_b.shape[1]
        reg = RIDGE_ALPHA * np.eye(n)
        reg[-1, -1] = 0

        A        = X_b.T @ X_b + reg
        self._wx = np.linalg.solve(A, X_b.T @ sx)
        self._wy = np.linalg.solve(A, X_b.T @ sy)
