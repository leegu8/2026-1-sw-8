import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def gaze_websocket(websocket: WebSocket):
    """
    30fps 로 시선 좌표를 JSON 으로 스트리밍한다.

    {"type": "gaze", "x": 450, "y": 310, "calibrated": true}
    {"type": "gaze", "calibrated": false}
    {"type": "no_face"}
    """
    await websocket.accept()
    tracker = websocket.app.state.tracker
    try:
        while True:
            pos  = tracker.get_screen_pos()
            iris = tracker.iris_pos

            if pos:
                await websocket.send_json({"type": "gaze", "x": pos[0], "y": pos[1], "calibrated": True})
            elif iris:
                await websocket.send_json({"type": "gaze", "calibrated": False})
            else:
                await websocket.send_json({"type": "no_face"})

            await asyncio.sleep(0.033)

    except WebSocketDisconnect:
        pass
