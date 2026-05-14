import cv2
import numpy as np

L_EYE_INNER  = 133
L_EYE_OUTER  = 33
L_EYE_TOP    = 159
L_EYE_BOTTOM = 145
R_EYE_INNER  = 362
R_EYE_OUTER  = 263
R_EYE_TOP    = 386
R_EYE_BOTTOM = 374

PATCH_W = 10   # 눈 패치 가로 픽셀
PATCH_H = 6    # 눈 패치 세로 픽셀
EYE_PAD = 0.3  # 눈 영역 패딩 비율


class GazeFeatureExtractor:
    """
    양쪽 눈 영역을 6×10 픽셀 패치로 리사이즈한 뒤
    두 패치를 이어 붙여 120차원 특징 벡터를 반환한다.

    픽셀 외형 정보(홍채 크기·위치·흰자 비율 등)를 모두 담아
    Ridge Regression 입력으로 사용한다.
    """

    def extract(self, landmarks, frame: np.ndarray) -> np.ndarray:
        try:
            lm   = landmarks
            h, w = frame.shape[:2]
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            l_patch = self._eye_patch(gray, lm, L_EYE_OUTER, L_EYE_INNER,
                                      L_EYE_TOP, L_EYE_BOTTOM, w, h)
            r_patch = self._eye_patch(gray, lm, R_EYE_OUTER, R_EYE_INNER,
                                      R_EYE_TOP, R_EYE_BOTTOM, w, h)

            l_flat = l_patch.flatten().astype(np.float64)
            r_flat = r_patch.flatten().astype(np.float64)
            return np.concatenate([self._normalize(l_flat), self._normalize(r_flat)])
        except Exception as e:
            print(f"❌ feature_extractor 오류: {e}")
            return np.zeros(PATCH_H * PATCH_W * 2, dtype=np.float64)

    def _normalize(self, v: np.ndarray) -> np.ndarray:
        m, s = v.mean(), v.std()
        return (v - m) / (s + 1e-6)

    def _eye_patch(self, gray, lm, outer, inner, top, bottom,
                   fw, fh) -> np.ndarray:
        cx  = (lm[outer].x + lm[inner].x) / 2
        cy  = (lm[top].y   + lm[bottom].y) / 2
        ew  = abs(lm[outer].x - lm[inner].x)
        eh  = abs(lm[bottom].y - lm[top].y)

        x1 = int((cx - ew / 2 - ew * EYE_PAD) * fw)
        x2 = int((cx + ew / 2 + ew * EYE_PAD) * fw)
        y1 = int((cy - eh / 2 - eh * EYE_PAD) * fh)
        y2 = int((cy + eh / 2 + eh * EYE_PAD) * fh)

        x1, x2 = max(0, x1), min(fw, x2)
        y1, y2 = max(0, y1), min(fh, y2)

        if x2 <= x1 or y2 <= y1:
            return np.zeros((PATCH_H, PATCH_W), dtype=np.float32)

        patch = gray[y1:y2, x1:x2]
        return cv2.resize(patch, (PATCH_W, PATCH_H),
                          interpolation=cv2.INTER_AREA).astype(np.float32)
