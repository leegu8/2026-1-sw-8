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
        .slice(0, 4);
}

(function renderText() {
    const container = document.getElementById('reading-text');
    container.innerHTML =
        `<p>${TEST_TEXT.split(/\s+/).map(w => `<span class="word">${w}</span>`).join(' ')}</p>`;

    requestAnimationFrame(() => requestAnimationFrame(() => {
        buildLineList();
        if (lineList.length < 4) {
            document.getElementById('start-desc').textContent =
                '⚠ 텍스트 줄이 4줄 미만입니다. 창 크기를 키워주세요.';
            return;
        }
        const area    = document.getElementById('reading-area');
        const areaTop = area.getBoundingClientRect().top;
        const h       = lineList[3].bottom - window.scrollY - areaTop + 10;
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

// ── 줄 박스 안에 있는지 판별 ──────────────────────────────
function isInLineBox(gazeX, gazeY, li) {
    if (li < 0 || li >= lineList.length) return false;
    const l  = lineList[li];
    const vt = l.top    - window.scrollY;
    const vb = l.bottom - window.scrollY;
    return gazeX >= l.xMin && gazeX <= l.xMax && gazeY >= vt && gazeY <= vb;
}

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
const MOVE_SPEED_PX_S  = 280;  // 가로 이동 속도 (px/s)
const TRANSITION_MS    = 350;  // 줄 이동 시간 (수집 안 함)

let trackPoints = []; // { dotX, dotY, gazeX, gazeY }

function buildSegments() {
    const segs = [];
    for (let li = 0; li < lineList.length; li++) {
        const l  = lineList[li];
        const cy = (l.top + l.bottom) / 2 - window.scrollY;
        const duration = (l.xMax - l.xMin) / MOVE_SPEED_PX_S * 1000;
        segs.push({ fromX: l.xMin, fromY: cy, toX: l.xMax, toY: cy, duration, lineIdx: li });
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

            trackPoints.push({ dotX, dotY, gazeX, gazeY, lineIdx: seg.lineIdx });

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
const nextArea     = document.getElementById('next-area');
const nextBtn      = document.getElementById('next-btn');

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function waitNext() {
    return new Promise(resolve => {
        nextArea.style.display = 'block';
        nextBtn.onclick = () => { nextArea.style.display = 'none'; resolve(); };
    });
}

async function blinkDot(x, y) {
    targetDot.style.left    = x + 'px';
    targetDot.style.top     = y + 'px';
    targetDot.style.display = 'block';
    for (let i = 0; i < 3; i++) {
        targetDot.style.opacity = '1';
        await delay(180);
        targetDot.style.opacity = '0.1';
        await delay(130);
    }
    targetDot.style.opacity = '1';
    await delay(200);
}

async function startTest() {
    document.getElementById('start-area').style.display = 'none';
    document.body.style.overflowY = 'hidden';
    progressWrap.style.display    = 'block';
    statusEl.style.display        = 'block';
    trackPoints = [];

    const segs    = buildSegments();
    const totalMs = segs.reduce((s, g) => s + g.duration, 0);
    let elapsed   = 0;

    for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];

        // 첫 줄 제외 — 버튼 누를 때까지 대기
        if (i > 0) {
            statusEl.textContent = `줄 ${seg.lineIdx + 1} 준비되면 버튼을 누르세요`;
            await waitNext();
        }

        statusEl.textContent = `줄 ${seg.lineIdx + 1} / ${lineList.length}  —  점을 따라가세요`;

        // 시작점 깜박임
        await blinkDot(seg.fromX, seg.fromY);

        await runSegment(seg);
        elapsed += seg.duration;
        progressEl.style.width = (elapsed / totalMs * 100) + '%';

        // 줄 끝 → 점 사라짐
        targetDot.style.opacity = '0';
        await delay(400);
        targetDot.style.display = 'none';
    }

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

    // 줄 박스 테두리
    for (let li = 0; li < lineList.length; li++) {
        const l  = lineList[li];
        const bx = l.xMin   - rect.left;
        const by = l.top    - window.scrollY - rect.top;
        const bw = l.xMax   - l.xMin;
        const bh = l.bottom - l.top;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(bx, by, bw, bh);
    }

    // 점 경로 (흰색 점선, 줄별로 끊김)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    let prevLi = -1;
    filtered.forEach(p => {
        const { x, y } = toC(p.dotX, p.dotY);
        if (p.lineIdx !== prevLi) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        prevLi = p.lineIdx;
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // 시선 점 — 박스 안이면 초록, 밖이면 빨강
    for (const p of filtered) {
        const { x, y } = toC(p.gazeX, p.gazeY);
        const inside = isInLineBox(p.gazeX, p.gazeY, p.lineIdx);
        ctx.fillStyle = inside ? 'rgba(74,222,128,0.65)' : 'rgba(248,113,113,0.65)';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ── 결과 요약 (인라인) ─────────────────────────────────────
function showSummary() {
    const filtered = filterOutliers(trackPoints);
    if (!filtered.length) return;

    // 전체 정확도 (줄 박스 안에 있는 비율)
    const totalCorrect = filtered.filter(p => isInLineBox(p.gazeX, p.gazeY, p.lineIdx)).length;
    const overallAcc   = Math.round(totalCorrect / filtered.length * 100);

    // 줄별 정확도
    const lineAccs = Array.from({ length: lineList.length }, (_, li) => {
        const lr = filtered.filter(p => p.lineIdx === li);
        if (!lr.length) return null;
        const correct = lr.filter(p => isInLineBox(p.gazeX, p.gazeY, li)).length;
        return Math.round(correct / lr.length * 100);
    });

    document.getElementById('result-px').textContent = overallAcc;

    let grade;
    if      (overallAcc >= 80) grade = '✅ 우수 — 독서 시선 추적에 충분한 정확도입니다.';
    else if (overallAcc >= 60) grade = '🟡 양호 — 대부분의 줄을 정확히 인식할 수 있습니다.';
    else if (overallAcc >= 40) grade = '🟠 보통 — 재보정 시 정확도가 향상될 수 있습니다.';
    else                       grade = '🔴 낮음 — 보정 페이지에서 재보정을 권장합니다.';
    document.getElementById('result-grade').textContent = grade;

    const colorFor = pct => pct >= 80 ? '#4ade80' : pct >= 60 ? '#facc15' : pct >= 40 ? '#fb923c' : '#f87171';
    document.getElementById('result-lines').innerHTML = lineAccs.map((pct, i) =>
        `<div class="rs-line-card">
            <div class="rs-line-label">줄 ${i + 1}</div>
            <div class="rs-line-val" style="color:${pct != null ? colorFor(pct) : '#4b5563'}">
                ${pct != null ? pct + '%' : '—'}
            </div>
        </div>`
    ).join('');

    document.getElementById('result-section').style.display = 'block';
}
