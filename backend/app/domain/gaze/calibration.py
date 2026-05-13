import numpy as np

RIDGE_ALPHA = 1.0  # 정규화 강도 (클수록 과적합 방지)
_MIN_POINTS = 6    # 최소 캘리브레이션 포인트 수


class CalibrationModel:
    """
    120차원 눈 패치 특징 벡터 → 화면 픽셀 좌표 Ridge Regression 모델.

    선형회귀 대비 과적합이 적고, 적은 캘리브레이션 포인트에서도 안정적이다.
    X/Y 축을 독립적으로 학습한다.
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

    def add_samples(self, samples: list[np.ndarray],
                    screen_x: int, screen_y: int) -> None:
        if not samples:
            return

        arr  = np.array(samples, dtype=np.float64)   # (n, 120)
        mean = arr.mean(axis=0)
        dists = np.linalg.norm(arr - mean, axis=1)   # L2 거리로 이상치 제거
        threshold = dists.mean() + 2 * dists.std() if dists.std() > 0 else np.inf
        valid = arr[dists <= threshold]
        if len(valid) == 0:
            valid = arr

        for feat in valid:
            self._features.append(feat)
            self._screen_x.append(float(screen_x))
            self._screen_y.append(float(screen_y))

        self._point_count += 1
        if self._point_count >= _MIN_POINTS:
            self._fit()

    def predict(self, features: np.ndarray) -> tuple[float, float]:
        feat_b = np.append(features, 1.0)             # bias 항 추가
        return float(feat_b @ self._wx), float(feat_b @ self._wy)

    def clear(self) -> None:
        self._features    = []
        self._screen_x    = []
        self._screen_y    = []
        self._wx          = None
        self._wy          = None
        self._point_count = 0

    def _fit(self) -> None:
        X   = np.array(self._features, dtype=np.float64)    # (n, 120)
        X_b = np.column_stack([X, np.ones(len(X))])         # (n, 121) bias 포함
        sx  = np.array(self._screen_x)
        sy  = np.array(self._screen_y)

        n   = X_b.shape[1]
        reg = RIDGE_ALPHA * np.eye(n)
        reg[-1, -1] = 0                                      # bias 항은 정규화 제외

        A        = X_b.T @ X_b + reg
        self._wx = np.linalg.solve(A, X_b.T @ sx)
        self._wy = np.linalg.solve(A, X_b.T @ sy)
