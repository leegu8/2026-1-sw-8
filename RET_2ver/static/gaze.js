// =====================================================
// gaze.js - 모든 페이지에서 공유하는 시선 추적 클라이언트
//
// 이 파일을 <script src="/static/gaze.js"> 로 포함하면:
//   1. Python 서버의 WebSocket (/ws) 에 자동 연결
//   2. #gaze-dot 요소가 있으면 시선 위치에 점을 표시
//   3. 각 페이지에서 onGaze(x, y) 함수를 정의하면
//      시선 데이터를 받을 때마다 호출됨
//   4. widget.js 를 자동으로 로드해 플로팅 웹캠 위젯을 표시
// =====================================================

// widget.js 자동 로드 (gaze.js 를 포함하는 모든 페이지에 위젯이 뜸)
(function () {
    const s = document.createElement('script');
    s.src = '/static/widget.js';
    document.head.appendChild(s);
})();

const ws = new WebSocket(`ws://${location.host}/ws`);
const gazeDot = document.getElementById('gaze-dot');

ws.onopen = () => {
    console.log('[gaze.js] 시선 추적 서버에 연결됨');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'gaze' && data.calibrated) {
        if (gazeDot) {
            gazeDot.style.display = 'block';
            gazeDot.style.left    = `${data.x}px`;
            gazeDot.style.top     = `${data.y}px`;
        }
        if (typeof onGaze === 'function') onGaze(data.x, data.y);

    } else if (data.type === 'gaze' && !data.calibrated) {
        if (typeof onFaceDetected === 'function') onFaceDetected();

    } else if (data.type === 'no_face') {
        if (gazeDot) gazeDot.style.display = 'none';
        if (typeof onNoFace === 'function') onNoFace();
    }

    // 위젯 상태 업데이트 (widget.js 가 로드된 경우)
    if (typeof updateWidgetStatus === 'function') updateWidgetStatus(data);
};

ws.onerror = () => {
    console.error('[gaze.js] WebSocket 연결 실패. 서버가 실행 중인지 확인하세요.');
};

ws.onclose = () => {
    if (gazeDot) gazeDot.style.display = 'none';
};


// ─── 보정 REST API 헬퍼 ────────────────────────────────────
async function addCalibrationPoint(x, y) {
    const res = await fetch('/api/calibrate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ x, y }),
    });
    return res.json();
}

async function clearCalibration() {
    const res = await fetch('/api/calibrate', { method: 'DELETE' });
    return res.json();
}

async function getCalibrationStatus() {
    const res = await fetch('/api/calibrate/status');
    return res.json();
}
