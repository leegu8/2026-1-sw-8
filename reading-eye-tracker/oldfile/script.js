const CLICKS_NEEDED = 5;
const SMOOTH_ALPHA = 0.25; // 낮을수록 부드럽지만 반응 느림

const CAL_POSITIONS = [
    [10, 10], [50, 10], [90, 10],
    [10, 50], [50, 50], [90, 50],
    [10, 90], [50, 90], [90, 90]
];

let gazeDot;
let isRunning = false;
let calDone = false;
let smoothX = null, smoothY = null;
let calClickCounts = [];

function applySmoothing(x, y) {
    if (smoothX === null) {
        smoothX = x;
        smoothY = y;
    } else {
        smoothX = SMOOTH_ALPHA * x + (1 - SMOOTH_ALPHA) * smoothX;
        smoothY = SMOOTH_ALPHA * y + (1 - SMOOTH_ALPHA) * smoothY;
    }
    return { x: smoothX, y: smoothY };
}

function createCalibrationPoints() {
    const overlay = document.getElementById('calibration-overlay');
    // 기존 보정점 제거
    overlay.querySelectorAll('.cal-point').forEach(el => el.remove());
    calClickCounts = new Array(9).fill(0);

    CAL_POSITIONS.forEach(([px, py], i) => {
        const btn = document.createElement('div');
        btn.className = 'cal-point';
        btn.id = `cal-${i}`;
        btn.style.left = `${px}%`;
        btn.style.top = `${py}%`;
        btn.innerHTML = `<span>${CLICKS_NEEDED}</span>`;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (calClickCounts[i] >= CLICKS_NEEDED) return;

            webgazer.recordScreenPosition(e.clientX, e.clientY, 'click');
            calClickCounts[i]++;

            const remaining = CLICKS_NEEDED - calClickCounts[i];
            btn.querySelector('span').textContent = remaining === 0 ? '✓' : remaining;
            if (remaining === 0) btn.classList.add('done');

            const completed = calClickCounts.filter(c => c >= CLICKS_NEEDED).length;
            document.getElementById('cal-progress').textContent = `${completed} / 9 완료`;

            if (completed === 9) finishCalibration();
        });

        overlay.appendChild(btn);
    });
}

function startCalibration() {
    calDone = false;
    smoothX = null;
    smoothY = null;
    document.getElementById('cal-instruction').textContent = '각 점을 바라보며 5번씩 클릭하세요';
    document.getElementById('cal-progress').textContent = '0 / 9 완료';
    document.getElementById('calibration-overlay').style.display = 'flex';
    createCalibrationPoints();
}

function finishCalibration() {
    document.getElementById('cal-instruction').textContent = '보정 완료! 시선 추적을 시작합니다...';
    setTimeout(() => {
        document.getElementById('calibration-overlay').style.display = 'none';
        calDone = true;
        document.getElementById('status').textContent = '✅ 보정 완료! 시선 추적 중...';
        document.getElementById('recal-btn').style.display = 'inline-block';
    }, 800);
}

document.addEventListener('DOMContentLoaded', () => {
    gazeDot = document.getElementById('gaze-dot');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const recalBtn = document.getElementById('recal-btn');
    const status = document.getElementById('status');

    startBtn.addEventListener('click', async () => {
        if (isRunning) return;
        status.textContent = '웹캠 초기화 중... 잠시만 기다려주세요.';

        try {
            webgazer.setRegression('ridge');
            webgazer.saveDataAcrossSessions(false);
            await webgazer.begin();
            webgazer.showVideoPreview(true)
                    .showPredictionPoints(false)
                    .removeMouseEventListeners();

            isRunning = true;
            gazeDot.style.display = 'block';
            status.textContent = '보정 화면의 각 점을 5번씩 클릭하세요.';

            webgazer.setGazeListener((data) => {
                if (!data || !calDone) return;
                const { x, y } = applySmoothing(data.x, data.y);
                gazeDot.style.left = `${x - 10}px`;
                gazeDot.style.top = `${y - 10}px`;
            });

            startCalibration();

        } catch (err) {
            console.error('WebGazer Error:', err);
            status.textContent = '❌ 에러 발생: ' + err.message;
        }
    });

    stopBtn.addEventListener('click', () => {
        if (webgazer) webgazer.pause();
        gazeDot.style.display = 'none';
        isRunning = false;
        calDone = false;
        document.getElementById('calibration-overlay').style.display = 'none';
        recalBtn.style.display = 'none';
        status.textContent = '⏹️ 멈췄습니다.';
    });

    recalBtn.addEventListener('click', () => {
        if (!isRunning) return;
        webgazer.clearData();
        status.textContent = '재보정 중...';
        startCalibration();
    });
});
