// =====================================================
// widget.js - 플로팅 웹캠 위젯
//
// gaze.js 가 자동으로 로드한다.
// 모든 페이지 오른쪽 상단에 웹캠 미리보기 + 제어 버튼을 표시한다.
// 개발자 모드에서는 마우스 추적 제어 UI로 대체된다.
// =====================================================

(function () {

const DEV_MODE = localStorage.getItem('devMode') === 'true';

// ── 위젯 HTML 삽입 ─────────────────────────────────────────
const widget = document.createElement('div');
widget.id = 'gaze-widget';

if (DEV_MODE) {
    widget.innerHTML = `
<div id="gw-header">
    <span>🛠 개발자 모드</span>
    <button id="gw-minimize" title="최소화">▲</button>
</div>
<div id="gw-body">
    <div id="gw-dev-icon">🖱</div>
    <div id="gw-status">🖱 마우스 추적 중</div>
    <div id="gw-buttons">
        <button id="gw-dev-toggle">⏸ 마우스 추적 정지</button>
        <button id="gw-dev-exit">↩ 일반 모드로</button>
    </div>
</div>
`;
} else {
    widget.innerHTML = `
<div id="gw-header">
    <span>👁 시선 추적</span>
    <button id="gw-minimize" title="최소화">▲</button>
</div>
<div id="gw-body">
    <div id="gw-preview-wrap">
        <img id="gw-preview" alt="">
        <div id="gw-no-cam">웹캠 꺼짐</div>
    </div>
    <div id="gw-status">연결 중...</div>
    <div id="gw-buttons">
        <button id="gw-toggle-cam">⏹ 웹캠 끄기</button>
        <button id="gw-calibrate">🎯 재보정</button>
    </div>
</div>
`;
}

document.body.appendChild(widget);

// ── 스타일 주입 ────────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
#gaze-widget {
    position: fixed;
    top: 68px;
    right: 16px;
    width: 210px;
    background: #1a1a2e;
    border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.45);
    z-index: 8000;
    overflow: hidden;
    font-family: '맑은 고딕', sans-serif;
    transition: height 0.2s ease;
}
#gw-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: #16213e;
    cursor: pointer;
    user-select: none;
}
#gw-header span {
    color: white;
    font-size: 0.82rem;
    font-weight: bold;
}
#gw-minimize {
    background: none;
    border: none;
    color: #aaa;
    cursor: pointer;
    font-size: 0.78rem;
    padding: 0;
    line-height: 1;
    transition: transform 0.2s;
}
#gw-preview-wrap {
    position: relative;
    background: #000;
    width: 210px;
    height: 158px;   /* 4:3 비율 */
    overflow: hidden;
}
#gw-preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: none;
}
#gw-no-cam {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555;
    font-size: 0.82rem;
}
#gw-dev-icon {
    font-size: 2.4rem;
    text-align: center;
    padding: 18px 0 10px;
    color: #aaa;
}
#gw-status {
    padding: 5px 12px;
    font-size: 0.75rem;
    color: #aaa;
    border-bottom: 1px solid #2a2a4a;
    min-height: 24px;
}
#gw-buttons {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px 10px;
}
#gw-buttons button {
    padding: 7px;
    border: none;
    border-radius: 7px;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: bold;
    font-family: inherit;
    transition: opacity 0.15s;
}
#gw-buttons button:hover { opacity: 0.85; }
#gw-toggle-cam  { background: #e74c3c; color: white; }
#gw-calibrate   { background: #f39c12; color: white; }
#gw-dev-toggle  { background: #e74c3c; color: white; }
#gw-dev-exit    { background: #555; color: #ddd; }

/* 최소화 상태 */
#gaze-widget.minimized #gw-body { display: none; }
#gaze-widget.minimized #gw-minimize { transform: rotate(180deg); }
`;
document.head.appendChild(style);

// ── 공통: 최소화 토글 ──────────────────────────────────────
document.getElementById('gw-header').addEventListener('click', (e) => {
    if (['gw-toggle-cam', 'gw-calibrate', 'gw-dev-toggle', 'gw-dev-exit'].includes(e.target.id)) return;
    widget.classList.toggle('minimized');
});

const statusEl = document.getElementById('gw-status');

// ── WebSocket 상태 반영 (gaze.js 에서 호출) ─────────────────
window.updateWidgetStatus = function (data) {
    if (data.type === 'dev_paused') {
        statusEl.textContent = '⏸ 마우스 추적 정지됨';
        statusEl.style.color = '#e74c3c';
    } else if (data.type === 'dev_resumed') {
        statusEl.textContent = '🖱 마우스 추적 중';
        statusEl.style.color = '#2ecc71';
    } else if (data.type === 'gaze' && data.calibrated) {
        statusEl.textContent = DEV_MODE ? '🖱 마우스 추적 중' : '✅ 시선 추적 중';
        statusEl.style.color = '#2ecc71';
    } else if (data.type === 'gaze' && !data.calibrated) {
        statusEl.textContent = '⚠ 보정 필요';
        statusEl.style.color = '#f39c12';
    } else if (data.type === 'no_face') {
        statusEl.textContent = '얼굴 미감지';
        statusEl.style.color = '#e74c3c';
    }
};

// ── 개발자 모드 전용 버튼 ──────────────────────────────────
if (DEV_MODE) {
    const devToggleBtn = document.getElementById('gw-dev-toggle');

    devToggleBtn.addEventListener('click', () => {
        const dg = window.devGaze;
        if (!dg) return;

        if (dg.isTracking()) {
            dg.pause();
            devToggleBtn.textContent = '▶ 마우스 추적 시작';
            devToggleBtn.style.background = '#27ae60';
        } else {
            dg.resume();
            devToggleBtn.textContent = '⏸ 마우스 추적 정지';
            devToggleBtn.style.background = '#e74c3c';
        }
    });

    document.getElementById('gw-dev-exit').addEventListener('click', () => {
        localStorage.removeItem('devMode');
        location.href = '/';
    });

// ── 일반 모드 전용 버튼 ────────────────────────────────────
} else {
    let webcamOn = true;
    const preview   = document.getElementById('gw-preview');
    const noCam     = document.getElementById('gw-no-cam');
    const toggleBtn = document.getElementById('gw-toggle-cam');

    function startPreview() {
        preview.src           = `/api/webcam/preview?t=${Date.now()}`;
        preview.style.display = 'block';
        noCam.style.display   = 'none';
    }

    function stopPreview() {
        preview.src           = '';
        preview.style.display = 'none';
        noCam.style.display   = 'flex';
    }

    fetch('/api/status').then(r => r.json()).then(s => {
        if (s.webcam_open) {
            webcamOn = true;
            startPreview();
            setToggleBtn(true);
        } else {
            webcamOn = false;
            stopPreview();
            setToggleBtn(false);
        }
    }).catch(() => {});

    function setToggleBtn(isOn) {
        toggleBtn.textContent        = isOn ? '⏹ 웹캠 끄기' : '▶ 웹캠 켜기';
        toggleBtn.style.background   = isOn ? '#e74c3c' : '#27ae60';
    }

    toggleBtn.addEventListener('click', async () => {
        toggleBtn.disabled = true;

        if (webcamOn) {
            await fetch('/api/webcam/stop', { method: 'POST' });
            webcamOn = false;
            stopPreview();
            setToggleBtn(false);
            statusEl.textContent = '웹캠 꺼짐';
        } else {
            const idx  = parseInt(localStorage.getItem('cameraIndex') ?? '0');
            const res  = await fetch('/api/webcam/start', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ camera_index: idx }),
            });
            const data = await res.json();
            if (data.success) {
                webcamOn = true;
                startPreview();
                setToggleBtn(true);
                statusEl.textContent = '웹캠 켜짐';
            } else {
                statusEl.textContent = '❌ 웹캠을 열 수 없음';
            }
        }
        toggleBtn.disabled = false;
    });

    document.getElementById('gw-calibrate').addEventListener('click', () => {
        location.href = '/calibration.html';
    });
}

})();
