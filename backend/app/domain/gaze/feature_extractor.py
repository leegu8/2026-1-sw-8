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

# 얼굴 랜드마크 (고개 각도 보정용)
NOSE_TIP     = 1
GLABELLA     = 6    # 미간
CHIN         = 152
L_CHEEK      = 234  # 왼쪽 광대
R_CHEEK      = 454  # 오른쪽 광대

# 보정 강도 (0이면 보정 없음, 클수록 강하게 보정)
YAW_SCALE    = 0.3
PITCH_SCALE  = 0.15
PITCH_BASE   = 0.45  # 정면 응시 시 코끝의 얼굴 내 수직 비율 (실험값)


class GazeFeatureExtractor:
    def extract(self, landmarks) -> tuple[float, float]:
        lm = landmarks

        # 눈 중심 및 크기 계산
        l_cx = (lm[L_EYE_INNER].x + lm[L_EYE_OUTER].x) / 2
        l_cy = (lm[L_EYE_TOP].y   + lm[L_EYE_BOTTOM].y) / 2
        l_w  = abs(lm[L_EYE_OUTER].x  - lm[L_EYE_INNER].x) + 1e-6
        l_h  = abs(lm[L_EYE_BOTTOM].y - lm[L_EYE_TOP].y)   + 1e-6

        r_cx = (lm[R_EYE_INNER].x + lm[R_EYE_OUTER].x) / 2
        r_cy = (lm[R_EYE_TOP].y   + lm[R_EYE_BOTTOM].y) / 2
        r_w  = abs(lm[R_EYE_OUTER].x  - lm[R_EYE_INNER].x) + 1e-6
        r_h  = abs(lm[R_EYE_BOTTOM].y - lm[R_EYE_TOP].y)   + 1e-6

        # 홍채 상대 좌표 (눈 크기로 정규화)
        l_rel_x = (lm[LEFT_IRIS].x  - l_cx) / l_w
        l_rel_y = (lm[LEFT_IRIS].y  - l_cy) / l_h
        r_rel_x = (lm[RIGHT_IRIS].x - r_cx) / r_w
        r_rel_y = (lm[RIGHT_IRIS].y - r_cy) / r_h

        # 눈 너비 기반 가중 평균 — 더 크게 보이는 눈(정면에 가까운 쪽)에 높은 가중치
        total_w = l_w + r_w
        w_l = l_w / total_w
        w_r = r_w / total_w
        rel_x = l_rel_x * w_l + r_rel_x * w_r
        rel_y = l_rel_y * w_l + r_rel_y * w_r

        # yaw 보정 — 코끝에서 양쪽 광대까지 거리 비율로 좌우 회전 추정
        dist_l = lm[NOSE_TIP].x - lm[L_CHEEK].x
        dist_r = lm[R_CHEEK].x  - lm[NOSE_TIP].x
        face_w = dist_l + dist_r + 1e-6
        yaw    = (dist_r - dist_l) / face_w  # 오른쪽으로 돌면 양수
        rel_x -= yaw * YAW_SCALE

        # pitch 보정 — 미간~코끝 비율로 상하 기울임 추정
        face_h     = lm[CHIN].y - lm[GLABELLA].y + 1e-6
        nose_ratio = (lm[NOSE_TIP].y - lm[GLABELLA].y) / face_h
        pitch      = nose_ratio - PITCH_BASE  # 고개 숙이면 양수
        rel_y     -= pitch * PITCH_SCALE

        return rel_x, rel_y
