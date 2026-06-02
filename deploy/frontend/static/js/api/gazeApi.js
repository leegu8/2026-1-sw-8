const GAZE_SERVER = 'http://localhost:8765';

export async function addCalibrationPoint(x, y, count = 3) {
    const res = await fetch(`${GAZE_SERVER}/api/calibrate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ x, y, count }),
    });
    return res.json();
}

export async function setYCorrection(active) {
    return (await fetch(`${GAZE_SERVER}/api/calibrate/y-correction?active=${active}`, { method: 'POST' })).json();
}

export async function clearCalibration() {
    return (await fetch(`${GAZE_SERVER}/api/calibrate`, { method: 'DELETE' })).json();
}

export async function getCalibrationStatus() {
    return (await fetch(`${GAZE_SERVER}/api/calibrate/status`)).json();
}

export async function startWebcam(cameraIndex = 0) {
    const res = await fetch(`${GAZE_SERVER}/api/webcam/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ camera_index: cameraIndex }),
    });
    return res.json();
}

export async function stopWebcam() {
    return (await fetch(`${GAZE_SERVER}/api/webcam/stop`, { method: 'POST' })).json();
}

export async function scanWebcams() {
    return (await fetch(`${GAZE_SERVER}/api/webcam/scan`)).json();
}

export async function getSystemStatus() {
    return (await fetch(`${GAZE_SERVER}/api/status`)).json();
}
