// =====================================================
// widget.js - 플로팅 웹캠 위젯
//
// gaze.js 가 자동으로 로드한다.
// 모든 페이지 오른쪽 상단에 웹캠 미리보기 + 제어 버튼을 표시한다.
// =====================================================

(function () {

// ── 위젯 HTML 삽입 ─────────────────────────────────────────
const widget = document.createElement('div');
widget.id = 'gaze-widget';
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
#gw-toggle-cam { background: #e74c3c; color: white; }
#gw-calibrate  { background: #f39c12; color: white; }

/* 최소화 상태 */
#gaze-widget.minimized #gw-body { display: none; }
#gaze-widget.minimized #gw-minimize { transform: rotate(180deg); }
`;
document.head.appendChild(style);

// ── 상태 변수 ──────────────────────────────────────────────
let webcamOn = true;   // 서버에서 웹캠이 켜져 있다고 가정 (동의 후 진입)

const preview   = document.getElementById('gw-preview');
const noCam     = document.getElementById('gw-no-cam');
const statusEl  = document.getElementById('gw-status');
const toggleBtn = document.getElementById('gw-toggle-cam');

// ── 미리보기 스트림 시작/중단 ──────────────────────────────
function startPreview() {
    // 타임스탬프를 붙여 브라우저 캐시 방지
    preview.src        = `/api/webcam/preview?t=${Date.now()}`;
    preview.style.display = 'block';
    noCam.style.display   = 'none';
}

function stopPreview() {
    preview.src           = '';
    preview.style.display = 'none';
    noCam.style.display   = 'flex';
}

// 페이지 로드 시 서버 상태 확인 후 미리보기 결정
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

// ── 웹캠 토글 버튼 ─────────────────────────────────────────
function setToggleBtn(isOn) {
    toggleBtn.textContent = isOn ? '⏹ 웹캠 끄기' : '▶ 웹캠 켜기';
    toggleBtn.style.background = isOn ? '#e74c3c' : '#27ae60';
}

toggleBtn.addEventListener('click', async () => {
    toggleBtn.disabled = true;

    if (webcamOn) {
        // 끄기
        await fetch('/api/webcam/stop', { method: 'POST' });
        webcamOn = false;
        stopPreview();
        setToggleBtn(false);
        statusEl.textContent = '웹캠 꺼짐';
    } else {
        // 켜기 — 마지막으로 사용한 카메라 인덱스 재사용
        const idx = parseInt(localStorage.getItem('cameraIndex') ?? '0');
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

// ── 재보정 버튼 ────────────────────────────────────────────
document.getElementById('gw-calibrate').addEventListener('click', () => {
    location.href = '/calibration.html';
});

// ── 최소화 토글 ────────────────────────────────────────────
document.getElementById('gw-header').addEventListener('click', (e) => {
    if (e.target.id === 'gw-toggle-cam' || e.target.id === 'gw-calibrate') return;
    widget.classList.toggle('minimized');
});

// ── WebSocket 상태 반영 (gaze.js 에서 호출) ─────────────────
window.updateWidgetStatus = function (data) {
    if (data.type === 'gaze' && data.calibrated) {
        statusEl.textContent = '✅ 시선 추적 중';
        statusEl.style.color = '#2ecc71';
    } else if (data.type === 'gaze' && !data.calibrated) {
        statusEl.textContent = '⚠ 보정 필요';
        statusEl.style.color = '#f39c12';
    } else if (data.type === 'no_face') {
        statusEl.textContent = '얼굴 미감지';
        statusEl.style.color = '#e74c3c';
    }
};

// ── index.html 에서 카메라 선택 시 인덱스 저장 ────────────
// index.html 의 동의 버튼이 camera_index 를 localStorage 에 저장해두면
// 위젯에서 재사용할 수 있다.

})();
