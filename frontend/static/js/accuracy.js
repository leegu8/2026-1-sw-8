// ── 텍스트 렌더 ──────────────────────────────────────────
const TEST_TEXT =
    '인간의 눈은 독서할 때 매끄럽게 움직이지 않습니다. 시선은 짧은 도약 운동인 단속성 안구 운동을 통해 ' +
    '한 위치에서 다른 위치로 빠르게 이동하며, 그 사이에 짧은 정착을 반복합니다. 이러한 특성 때문에 ' +
    '시선 추적 기술은 독서 습관을 분석하는 데 매우 유용한 도구로 활용됩니다. 특히 역행 안구 운동은 ' +
    '독자가 이미 읽은 텍스트로 시선을 되돌리는 현상으로, 독해력이나 집중력과 밀접한 관련이 있습니다. ' +
    '이 시스템은 이러한 패턴을 실시간으로 감지하여 독서 습관 개선을 위한 피드백을 제공합니다.';

const DEV_MODE = new URLSearchParams(location.search).has('dev');

// ── 라인 계산 ─────────────────────────────────────────────
let lineList = [];

function buildLineList() {
    const map = new Map();
    document.querySelectorAll('.word').forEach(w => {
        const r   = w.getBoundingClientRect();
        const top = Math.round(r.top + window.scrollY);
        if (!map.has(top)) {
            map.set(top, { top, bottom: r.bottom + window.scrollY, xMin: r.left, xMax: r.right });
        } else {
            const l = map.get(top);
            l.bottom = Math.max(l.bottom, r.bottom + window.scrollY);
            l.xMin   = Math.min(l.xMin, r.left);
            l.xMax   = Math.max(l.xMax, r.right);
        }
    });
    lineList = [...map.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => v)
        .slice(0, 5);
}

(function renderText() {
    const container = document.getElementById('reading-text');
    container.innerHTML =
        `<p>${TEST_TEXT.split(/\s+/).map(w => `<span class="word">${w}</span>`).join(' ')}</p>`;

    requestAnimationFrame(() => requestAnimationFrame(() => {
        buildLineList();
        if (lineList.length < 5) {
            document.getElementById('start-desc').textContent =
                '⚠ 텍스트 줄이 5줄 미만입니다. 창 크기를 키워주세요.';
            return;
        }
        const area    = document.getElementById('reading-area');
        const areaTop = area.getBoundingClientRect().top;
        const h       = lineList[4].bottom - window.scrollY - areaTop + 10;
        area.style.height = h + 'px';

        const canvas  = document.getElementById('accuracy-canvas');
        canvas.width  = area.offsetWidth;
        canvas.height = h;

        document.getElementById('start-btn').disabled = false;
    }));
})();

// ── 시선 추적 ────────────────────────────────────────────
if (DEV_MODE) {
    let lx = 0, ly = 0;
    document.addEventListener('mousemove', e => { lx = e.clientX; ly = e.clientY; });
    setInterval(() => {
        window.dispatchEvent(new CustomEvent('gaze:tracking', { detail: { x: lx, y: ly } }));
    }, 33);
} else {
    import('/static/js/gaze.js');
}

let gazeX = 0, gazeY = 0;
window.addEventListener('gaze:tracking', ({ detail: { x, y } }) => { gazeX = x; gazeY = y; });

// ── 이상치 필터 ───────────────────────────────────────────
function filterOutliers(points) {
    if (points.length < 4) return points;
    const errs = points.map(p => Math.hypot(p.gazeX - p.dotX, p.gazeY - p.dotY));
    const sorted = [...errs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const thresh = Math.min(Math.max(median * 3 + 30, 80), 300);
    return points.filter((_, i) => errs[i] <= thresh);
}

// ── 이동 경로 ─────────────────────────────────────────────
const MOVE_SPEED_PX_S  = 120;  // 가로 이동 속도 (px/s)
const TRANSITION_MS    = 450;  // 줄 이동 시간 (수집 안 함)

let trackPoints = []; // { dotX, dotY, gazeX, gazeY }

function buildSegments() {
    const segs = [];
    for (let li = 0; li < lineList.length; li++) {
        const l  = lineList[li];
        const cy = (l.top + l.bottom) / 2 - window.scrollY;
        const duration = (l.xMax - l.xMin) / MOVE_SPEED_PX_S * 1000;

        segs.push({ fromX: l.xMin, fromY: cy, toX: l.xMax, toY: cy, duration, collect: true });

        if (li < lineList.length - 1) {
            const n  = lineList[li + 1];
            const ny = (n.top + n.bottom) / 2 - window.scrollY;
            segs.push({ fromX: l.xMax, fromY: cy, toX: n.xMin, toY: ny, duration: TRANSITION_MS, collect: false });
        }
    }
    return segs;
}

function runSegment(seg) {
    return new Promise(resolve => {
        let startTs = null;
        function frame(ts) {
            if (!startTs) startTs = ts;
            const t    = Math.min((ts - startTs) / seg.duration, 1);
            const dotX = seg.fromX + (seg.toX - seg.fromX) * t;
            const dotY = seg.fromY + (seg.toY - seg.fromY) * t;

            targetDot.style.left = dotX + 'px';
            targetDot.style.top  = dotY + 'px';

            if (seg.collect) trackPoints.push({ dotX, dotY, gazeX, gazeY });

            if (t < 1) requestAnimationFrame(frame);
            else resolve();
        }
        requestAnimationFrame(frame);
    });
}

// ── UI ───────────────────────────────────────────────────
const statusEl     = document.getElementById('status-bar');
const progressEl   = document.getElementById('progress-bar');
const progressWrap = document.getElementById('progress-wrap');
const targetDot    = document.getElementById('target-dot');

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function startTest() {
    document.getElementById('start-area').style.display = 'none';
    document.body.style.overflowY = 'hidden';
    progressWrap.style.display    = 'block';
    statusEl.style.display        = 'block';
    statusEl.textContent          = '파란 점을 시선으로 따라가세요';
    trackPoints = [];

    const segs    = buildSegments();
    const sweeps  = segs.filter(s => s.collect);
    const totalMs = segs.reduce((s, g) => s + g.duration, 0);
    let elapsed   = 0;

    // 첫 점 등장
    const first = segs[0];
    targetDot.style.left    = first.fromX + 'px';
    targetDot.style.top     = first.fromY + 'px';
    targetDot.style.display = 'block';
    void targetDot.offsetWidth;
    targetDot.style.opacity = '1';
    await delay(400);

    for (let i = 0; i < segs.length; i++) {
        await runSegment(segs[i]);
        elapsed += segs[i].duration;
        progressEl.style.width = (elapsed / totalMs * 100) + '%';
        await delay(30);
    }

    // 점 페이드 아웃
    targetDot.style.opacity = '0';
    await delay(250);
    targetDot.style.display = 'none';

    progressEl.style.width        = '100%';
    statusEl.style.display        = 'none';
    progressWrap.style.display    = 'none';
    document.body.style.overflowY = '';

    drawResults();
    document.getElementById('legend').style.display = 'block';
    showSummary();
}

document.getElementById('start-btn').addEventListener('click', startTest);

// ── 결과 시각화 ───────────────────────────────────────────
function drawResults() {
    const area   = document.getElementById('reading-area');
    const canvas = document.getElementById('accuracy-canvas');
    const ctx    = canvas.getContext('2d');
    const rect   = area.getBoundingClientRect();
    canvas.width  = area.offsetWidth;
    canvas.height = area.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const filtered = filterOutliers(trackPoints);
    if (!filtered.length) return;

    const toC = (vx, vy) => ({ x: vx - rect.left, y: vy - rect.top });

    // 시선 경로 (주황 점)
    for (const p of filtered) {
        const { x, y } = toC(p.gazeX, p.gazeY);
        const err = Math.hypot(p.gazeX - p.dotX, p.gazeY - p.dotY);
        const alpha = Math.max(0.15, 0.6 - err / 400);
        ctx.fillStyle = `rgba(251,146,60,${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // 점 경로 (파란 선)
    ctx.strokeStyle = 'rgba(59,130,246,0.55)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    filtered.forEach((p, i) => {
        const { x, y } = toC(p.dotX, p.dotY);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
}

// ── 결과 요약 (인라인) ─────────────────────────────────────
function showSummary() {
    const filtered = filterOutliers(trackPoints);
    if (!filtered.length) return;

    const errors  = filtered.map(p => Math.hypot(p.gazeX - p.dotX, p.gazeY - p.dotY));
    const avg     = errors.reduce((s, e) => s + e, 0) / errors.length;

    // 줄별 평균
    const area    = document.getElementById('reading-area');
    const rect    = area.getBoundingClientRect();
    const lineAvgs = Array.from({ length: 5 }, (_, li) => {
        const l  = lineList[li];
        const cy = (l.top + l.bottom) / 2 - window.scrollY;
        const lr = filtered.filter(p =>
            p.dotY >= cy - 20 && p.dotY <= cy + 20 &&
            p.dotX >= l.xMin  && p.dotX <= l.xMax
        );
        return lr.length
            ? lr.reduce((s, p) => s + Math.hypot(p.gazeX - p.dotX, p.gazeY - p.dotY), 0) / lr.length
            : null;
    });

    document.getElementById('result-px').textContent = Math.round(avg);

    let grade;
    if      (avg < 30)  grade = '✅ 우수 — 독서 시선 추적에 충분한 정확도입니다.';
    else if (avg < 60)  grade = '🟡 양호 — 대부분의 줄을 정확히 인식할 수 있습니다.';
    else if (avg < 100) grade = '🟠 보통 — 재보정 시 정확도가 향상될 수 있습니다.';
    else                grade = '🔴 낮음 — 보정 페이지에서 재보정을 권장합니다.';
    document.getElementById('result-grade').textContent = grade;

    const colorFor = e => e < 30 ? '#4ade80' : e < 60 ? '#facc15' : e < 100 ? '#fb923c' : '#f87171';
    document.getElementById('result-lines').innerHTML = lineAvgs.map((e, i) =>
        `<div class="rs-line-card">
            <div class="rs-line-label">줄 ${i + 1}</div>
            <div class="rs-line-val" style="color:${e != null ? colorFor(e) : '#4b5563'}">
                ${e != null ? Math.round(e) + 'px' : '—'}
            </div>
        </div>`
    ).join('');

    document.getElementById('result-section').style.display = 'block';
}
