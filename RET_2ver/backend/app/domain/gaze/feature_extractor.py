LEFT_IRIS    = 468
RIGHT_IRIS   = 473
L_EYE_INNER  = 133
L_EYE_OUTER  = 33
L_EYE_TOP    = 159
L_EYE_BOTTOM = 145
R_EYE_INNER  = 362
R_EYE_OUTER  = 263
R_EYE_TOP    = 386
R_EYE_BOTTOM = 374


class GazeFeatureExtractor:
    """
    얼굴 랜드마크에서 고개 방향 불변 시선 특징 (rel_iris_x, rel_iris_y) 을 추출한다.

    홍채 위치를 눈 크기로 정규화하므로 yaw/pitch를 포함하지 않아도
    고개를 돌렸을 때 점이 따라 움직이지 않는다.
    """

    def extract(self, landmarks) -> tuple[float, float]:
        lm  = landmarks
        l_cx = (lm[L_EYE_INNER].x + lm[L_EYE_OUTER].x) / 2
        l_cy = (lm[L_EYE_TOP].y   + lm[L_EYE_BOTTOM].y) / 2
        l_w  = abs(lm[L_EYE_OUTER].x  - lm[L_EYE_INNER].x)  + 1e-6
        l_h  = abs(lm[L_EYE_BOTTOM].y - lm[L_EYE_TOP].y)     + 1e-6

        r_cx = (lm[R_EYE_INNER].x + lm[R_EYE_OUTER].x) / 2
        r_cy = (lm[R_EYE_TOP].y   + lm[R_EYE_BOTTOM].y) / 2
        r_w  = abs(lm[R_EYE_OUTER].x  - lm[R_EYE_INNER].x)  + 1e-6
        r_h  = abs(lm[R_EYE_BOTTOM].y - lm[R_EYE_TOP].y)     + 1e-6

        rel_x = ((lm[LEFT_IRIS].x  - l_cx) / l_w + (lm[RIGHT_IRIS].x  - r_cx) / r_w) / 2
        rel_y = ((lm[LEFT_IRIS].y  - l_cy) / l_h + (lm[RIGHT_IRIS].y  - r_cy) / r_h) / 2
        return rel_x, rel_y
