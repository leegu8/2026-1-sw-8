export async function addCalibrationPoint(x, y) {
    const res = await fetch('/api/calibrate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ x, y }),
    });
    return res.json();
}

export async function clearCalibration() {
    return (await fetch('/api/calibrate', { method: 'DELETE' })).json();
}

export async function getCalibrationStatus() {
    return (await fetch('/api/calibrate/status')).json();
}

export async function startWebcam(cameraIndex = 0) {
    const res = await fetch('/api/webcam/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ camera_index: cameraIndex }),
    });
    return res.json();
}

export async function stopWebcam() {
    return (await fetch('/api/webcam/stop', { method: 'POST' })).json();
}

export async function scanWebcams() {
    return (await fetch('/api/webcam/scan')).json();
}

export async function getSystemStatus() {
    return (await fetch('/api/status')).json();
}
