import { startWebcam, stopWebcam, getSystemStatus } from '../api/gazeApi.js';

const _HTML = `
<div id="gw-header">
    <span>시선 추적</span>
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

const _CSS = `
#gaze-widget {
    position: fixed; top: 68px; right: 16px; width: 210px;
    background: #1a1a2e; border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.45);
    z-index: 8000; overflow: hidden;
    font-family: '맑은 고딕', sans-serif; transition: height 0.2s ease;
}
#gw-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; background: #16213e; cursor: grab; user-select: none;
}
#gw-header.dragging { cursor: grabbing; }
#gw-header span { color: white; font-size: 0.82rem; font-weight: bold; }
#gw-minimize {
    background: none; border: none; color: #aaa; cursor: pointer;
    font-size: 0.78rem; padding: 0; line-height: 1; transition: transform 0.2s;
}
#gw-preview-wrap {
    position: relative; background: #000; width: 210px; height: 158px; overflow: hidden;
}
#gw-preview { width: 100%; height: 100%; object-fit: cover; display: none; }
#gw-no-cam {
    position: absolute; inset: 0; display: flex;
    align-items: center; justify-content: center; color: #555; font-size: 0.82rem;
}
#gw-status {
    padding: 5px 12px; font-size: 0.75rem; color: #aaa;
    border-bottom: 1px solid #2a2a4a; min-height: 24px;
}
#gw-buttons { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px 10px; }
#gw-buttons button {
    padding: 7px; border: none; border-radius: 7px; cursor: pointer;
    font-size: 0.8rem; font-weight: bold; font-family: inherit; transition: opacity 0.15s;
}
#gw-buttons button:hover { opacity: 0.85; }
#gw-toggle-cam { background: #e74c3c; color: white; }
#gw-calibrate  { background: #f39c12; color: white; }
#gaze-widget.minimized #gw-body { display: none; }
#gaze-widget.minimized #gw-minimize { transform: rotate(180deg); }
`;

export class GazeWidget {
    #root;
    #preview;
    #noCam;
    #statusEl;
    #toggleBtn;
    #webcamOn = true;

    init() {
        this.#root           = document.createElement('div');
        this.#root.id        = 'gaze-widget';
        this.#root.innerHTML = _HTML;
        document.body.appendChild(this.#root);

        const style         = document.createElement('style');
        style.textContent   = _CSS;
        document.head.appendChild(style);

        this.#preview   = document.getElementById('gw-preview');
        this.#noCam     = document.getElementById('gw-no-cam');
        this.#statusEl  = document.getElementById('gw-status');
        this.#toggleBtn = document.getElementById('gw-toggle-cam');

        this.#bindEvents();
        this.#syncWithServer();
    }

    updateStatus(type) {
        const map = {
            tracking: { text: '✅ 시선 추적 중', color: '#2ecc71' },
            detected: { text: '⚠ 보정 필요',   color: '#f39c12' },
            lost:     { text: '얼굴 미감지',     color: '#e74c3c' },
        };
        const s = map[type] ?? map.lost;
        this.#statusEl.textContent = s.text;
        this.#statusEl.style.color = s.color;
    }

    #startPreview() {
        this.#preview.src           = `http://localhost:8765/api/webcam/preview?t=${Date.now()}`;
        this.#preview.style.display = 'block';
        this.#noCam.style.display   = 'none';
    }

    #stopPreview() {
        this.#preview.src           = '';
        this.#preview.style.display = 'none';
        this.#noCam.style.display   = 'flex';
    }

    #setToggleBtn(isOn) {
        this.#toggleBtn.textContent      = isOn ? '⏹ 웹캠 끄기' : '▶ 웹캠 켜기';
        this.#toggleBtn.style.background = isOn ? '#e74c3c' : '#27ae60';
        this.#webcamOn = isOn;
    }

    async #syncWithServer() {
        try {
            const s = await getSystemStatus();
            this.#setToggleBtn(s.webcam_open);
            s.webcam_open ? this.#startPreview() : this.#stopPreview();
        } catch { }
    }

    #bindEvents() {
        this.#toggleBtn.addEventListener('click', async () => {
            this.#toggleBtn.disabled = true;
            if (this.#webcamOn) {
                await stopWebcam();
                this.#stopPreview();
                this.#setToggleBtn(false);
                this.#statusEl.textContent = '웹캠 꺼짐';
            } else {
                const idx  = parseInt(localStorage.getItem('cameraIndex') ?? '0');
                const data = await startWebcam(idx);
                if (data.success) {
                    this.#startPreview();
                    this.#setToggleBtn(true);
                    this.#statusEl.textContent = '웹캠 켜짐';
                } else {
                    this.#statusEl.textContent = '❌ 웹캠을 열 수 없음';
                }
            }
            this.#toggleBtn.disabled = false;
        });

        document.getElementById('gw-calibrate').addEventListener('click', () => {
            location.href = '/guide.html';
        });

        const header = document.getElementById('gw-header');
        let dragging = false, ox = 0, oy = 0, moved = false;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            dragging = true;
            moved    = false;
            const r  = this.#root.getBoundingClientRect();
            ox = e.clientX - r.left;
            oy = e.clientY - r.top;
            this.#root.style.right  = '';
            this.#root.style.bottom = '';
            this.#root.style.left   = r.left + 'px';
            this.#root.style.top    = r.top  + 'px';
            header.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            moved = true;
            const x = Math.min(Math.max(e.clientX - ox, 0), window.innerWidth  - this.#root.offsetWidth);
            const y = Math.min(Math.max(e.clientY - oy, 0), window.innerHeight - this.#root.offsetHeight);
            this.#root.style.left = x + 'px';
            this.#root.style.top  = y + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            header.classList.remove('dragging');
        });

        header.addEventListener('click', (e) => {
            if (e.target.closest('button') || moved) return;
            this.#root.classList.toggle('minimized');
        });
    }
}
