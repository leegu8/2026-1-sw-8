import uvicorn

uvicorn.run("gaze_client.gaze_server:app", host="0.0.0.0", port=8765)
