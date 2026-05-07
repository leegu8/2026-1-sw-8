// =====================================================
// gaze.js - 모든 페이지에서 공유하는 시선 추적 클라이언트
//
// 이 파일을 <script src="/static/gaze.js"> 로 포함하면:
//   1. Python 서버의 WebSocket (/ws) 에 자동 연결
//   2. #gaze-dot 요소가 있으면 시선 위치에 점을 표시
//   3. 각 페이지에서 onGaze(x, y) 함수를 정의하면
//      시선 데이터를 받을 때마다 호출됨
//   4. widget.js 를 자동으로 로드해 플로팅 웹캠 위젯을 표시
//
// 개발자 모드 (localStorage.devMode === 'true'):
//   웹캠/WebSocket 대신 마우스 커서를 시선으로 사용
// =====================================================

// widget.js 자동 로드 (gaze.js 를 포함하는 모든 페이지에 위젯이 뜸)
(function () {
    const s = document.createElement('script');
    s.src = '/static/widget.js';
    document.head.appendChild(s);
})();

const gazeDot  = document.getElementById('gaze-dot');

// [DEV] ↓↓↓ 개발자 모드 코드 — 배포 전 제거 ↓↓↓
const DEV_MODE = localStorage.getItem('devMode') === 'true';

// ─── 개발자 모드: 마우스를 시선으로 사용 ─────────────────────
if (DEV_MODE) {
    let _tracking = true;
    let _calCount = 0;

    document.addEventListener('mousemove', (e) => {
        if (!_tracking) return;
        const x = e.clientX;
        const y = e.clientY;

        if (gazeDot) {
            gazeDot.style.display = 'block';
            gazeDot.style.left    = `${x}px`;
            gazeDot.style.top     = `${y}px`;
        }
        if (typeof onGaze === 'function') onGaze(x, y);
        if (typeof updateWidgetStatus === 'function') {
            updateWidgetStatus({ type: 'gaze', calibrated: true, x, y });
        }
    });

    // 위젯에서 제어할 수 있도록 전역 노출
    window.devGaze = {
        isTracking: () => _tracking,
        pause() {
            _tracking = false;
            if (gazeDot) gazeDot.style.display = 'none';
            if (typeof updateWidgetStatus === 'function') {
                updateWidgetStatus({ type: 'dev_paused' });
            }
        },
        resume() {
            _tracking = true;
            if (typeof updateWidgetStatus === 'function') {
                updateWidgetStatus({ type: 'dev_resumed' });
            }
        },
    };

    // 캘리브레이션 API 목(mock): 웹캠 없이도 보정 단계를 통과할 수 있게
    addCalibrationPoint = async (x, y) => {
        _calCount++;
        return { success: true, count: _calCount, calibrated: _calCount >= 4, samples_used: 10 };
    };
    clearCalibration = async () => {
        _calCount = 0;
        return { success: true };
    };
    getCalibrationStatus = async () => ({
        count:      _calCount,
        calibrated: _calCount >= 4,
    });

// [DEV] ↑↑↑ 개발자 모드 코드 끝 ↑↑↑

// ─── 일반 모드: WebSocket 시선 추적 ───────────────────────────
} else {
    const ws = new WebSocket(`ws://${location.host}/ws`);

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

        if (typeof updateWidgetStatus === 'function') updateWidgetStatus(data);
    };

    ws.onerror = () => {
        console.error('[gaze.js] WebSocket 연결 실패. 서버가 실행 중인지 확인하세요.');
    };

    ws.onclose = () => {
        if (gazeDot) gazeDot.style.display = 'none';
    };
}


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
