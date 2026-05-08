import cv2
import numpy as np

_LEFT_IRIS  = 468
_RIGHT_IRIS = 473

_OVAL   = [10,338,297,332,284,251,389,356,454,323,361,288,
           397,365,379,378,400,377,152,148,176,149,150,136,
           172,58,132,93,234,127,162,21,54,103,67,109,10]
_L_EYE  = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398,362]
_R_EYE  = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33]
_L_BROW = [276,283,282,295,285,300,293,334,296,336]
_R_BROW = [46,53,52,65,55,70,63,105,66,107]
_NOSE   = [168,6,197,195,5,4,1,19,94]
_LIPS   = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146,61]


class FaceMeshVisualizer:
    """얼굴 랜드마크 및 홍채 중심을 프레임에 그린다."""

    def draw(self, frame: np.ndarray, landmarks) -> np.ndarray:
        h, w = frame.shape[:2]

        def pts(indices):
            return np.array(
                [[int(landmarks[i].x * w), int(landmarks[i].y * h)] for i in indices],
                dtype=np.int32,
            )

        cv2.polylines(frame, [pts(_OVAL)],   False, (0, 230, 140), 1)
        cv2.polylines(frame, [pts(_L_EYE)],  False, (0, 220, 255), 1)
        cv2.polylines(frame, [pts(_R_EYE)],  False, (0, 220, 255), 1)
        cv2.polylines(frame, [pts(_L_BROW)], False, (0, 180, 110), 1)
        cv2.polylines(frame, [pts(_R_BROW)], False, (0, 180, 110), 1)
        cv2.polylines(frame, [pts(_NOSE)],   False, (0, 180, 110), 1)
        cv2.polylines(frame, [pts(_LIPS)],   False, (0, 180, 110), 1)

        for idx, color in [(_LEFT_IRIS, (0, 255, 100)), (_RIGHT_IRIS, (0, 200, 255))]:
            cx = int(landmarks[idx].x * w)
            cy = int(landmarks[idx].y * h)
            cv2.circle(frame, (cx, cy), 7, color, 2)
            cv2.line(frame, (cx - 11, cy), (cx + 11, cy), color, 1)
            cv2.line(frame, (cx, cy - 11), (cx, cy + 11), color, 1)

        return frame
