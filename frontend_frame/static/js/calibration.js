const TOTAL_POINTS = 9;
const SAMPLE_COUNT = 25;

/* 9점 위치 — 화면 비율 [x%, y%] (3×3 격자) */
const POINTS = [
    [10, 12], [50, 12], [90, 12],
    [10, 50], [50, 50], [90, 50],
    [10, 85], [50, 85], [90, 85],
];

const overlay     = document.getElementById('cal-overlay');
const barFill     = document.getElementById('cal-bar-fill');
const progressTxt = document.getElementById('cal-progress-text');
const nextBtn     = document.getElementById('cal-next-btn');
const faceEl      = document.getElementById('cal-face-status');
const faceHint    = document.getElementById('face-hint');

let dots       = [];
let doneCount  = 0;
let activeDot  = 0;
let collecting = false;

/* ── 보정 시작 ── */
document.getElementById('start-btn').addEventListener('click', async () => {
    // [TODO] 실제 API 연결
    // await fetch('/api/calibrate', { method: 'DELETE' });

    doneCount  = 0;
    activeDot  = 0;
    collecting = false;

    overlay.style.display = 'block';
    createDots();
    activateDot(0);
    updateProgress(0);
});

/* ── 9개 보정 점 생성 ── */
function createDots() {
    dots.forEach(d => d.remove());
    dots = [];

    POINTS.forEach(([px, py], i) => {
        const el = document.createElement('div');
        el.className  = 'cal-dot';
        el.style.left = `${px}%`;
        el.style.top  = `${py}%`;
        el.addEventListener('click', () => onDotClick(i));
        overlay.appendChild(el);
        dots.push(el);
    });
}

function activateDot(index) {
    dots.forEach((d, i) => {
        d.classList.remove('active');
        if (i < index) d.classList.add('done');
    });
    if (index < TOTAL_POINTS) {
        dots[index].classList.add('active');
    }
}

/* ── 점 클릭 처리 ── */
async function onDotClick(index) {
    if (index !== activeDot || collecting) return;
    collecting = true;

    const rect = overlay.getBoundingClientRect();
    const x    = Math.round(POINTS[index][0] / 100 * rect.width);
    const y    = Math.round(POINTS[index][1] / 100 * rect.height);

    try {
        // [TODO] 실제 API 연결
        // await fetch('/api/calibrate', {
        //     method:  'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body:    JSON.stringify({ x, y, count: SAMPLE_COUNT }),
        // });

        doneCount++;
        dots[index].classList.remove('active');
        dots[index].classList.add('done');
        updateProgress(doneCount);

        if (doneCount < TOTAL_POINTS) {
            activeDot++;
            activateDot(activeDot);
        }
    } catch {
        /* 수집 실패 시 같은 점 재시도 가능하도록 상태 유지 */
    } finally {
        collecting = false;
    }
}

/* ── 진행도 업데이트 ── */
function updateProgress(n) {
    barFill.style.width = `${(n / TOTAL_POINTS) * 100}%`;

    if (n >= TOTAL_POINTS) {
        progressTxt.textContent = '✅ 보정 완료!';
        progressTxt.style.color = '#2ecc71';
        nextBtn.classList.add('ready');
    } else {
        progressTxt.textContent = `${n} / ${TOTAL_POINTS} 완료`;
        progressTxt.style.color = '';
    }
}

/* ── 얼굴 감지 상태 반영 (WebSocket gaze 이벤트 연결 시 활성화) ── */
// [TODO] gaze.js 연결 후 주석 해제
// window.addEventListener('gaze:detected', () => {
//     faceEl.textContent  = '✅ 얼굴 감지됨';
//     faceEl.style.color  = '#2ecc71';
//     faceHint.textContent = '✅ 얼굴이 감지됐습니다. 보정을 시작하세요.';
//     faceHint.style.color = '#27ae60';
// });
// window.addEventListener('gaze:lost', () => {
//     faceEl.textContent = '⚠ 얼굴 미감지 — 카메라를 확인하세요';
//     faceEl.style.color = '#e74c3c';
// });
