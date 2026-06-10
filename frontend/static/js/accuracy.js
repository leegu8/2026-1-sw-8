const TEST_PARAS = [
    '시선 추적 정확도 측정 테스트입니다. 초록색으로 강조된 줄을 눈으로 바라봐 주세요.',
    '각 줄을 충분히 응시한 뒤 측정 버튼을 눌러 주세요. 고개는 고정하고 눈만 움직여 주세요.',
    '이 테스트는 독서 페이지와 동일한 줄 단위 감지 방식으로 정확도를 측정합니다.',
    '카메라와 40~70cm 거리를 유지하면 더 정확한 측정 결과를 얻을 수 있습니다.',
    '보정이 잘 이루어진 경우 높은 정확도가 측정됩니다. 집중해서 응시해 주세요.',
    '테스트가 완료되면 줄별 정확도와 전체 평균 정확도를 확인할 수 있습니다.',
];

const DEV_MODE = new URLSearchParams(location.search).has('dev');
if (DEV_MODE) {
    const dot = document.getElementById('gaze-dot');
    dot.style.display = 'block';
    document.body.style.cursor = 'none';
    let lx = 0, ly = 0;
    document.addEventListener('mousemove', e => {
        lx = e.clientX; ly = e.clientY;
        dot.style.left = lx + 'px'; dot.style.top = ly + 'px';
    });
    setInterval(() => {
        window.dispatchEvent(new CustomEvent('gaze:tracking', { detail: { x: lx, y: ly } }));
    }, 33);
} else {
    import('/static/js/gaze.js');
}

// ── 줄 목록 (reading 페이지와 동일) ──────────────────────
let lineList = [];
let readingAreaRect = null;

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
    lineList = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    readingAreaRect = document.querySelector('.reading-area')?.getBoundingClientRect() ?? null;
    for (let i = 0; i < lineList.length; i++) {
        if (i > 0) {
            const mid = Math.round((lineList[i-1].bottom + lineList[i].top) / 2);
            lineList[i-1].bottom = mid;
            lineList[i].top = mid + 1;
        }
    }
}

// reading 페이지와 동일한 getLineIndex
function getLineIndex(y) {
    if (!lineList.length) return -1;
    const docY = y + window.scrollY;
    for (let i = 0; i < lineList.length; i++) {
        if (docY >= lineList[i].top && docY <= lineList[i].bottom) return i;
    }
    return -1;
}

function highlightLine(lineIdx) {
    const el   = document.getElementById('target-highlight');
    const area = document.querySelector('.reading-area');
    if (lineIdx < 0 || lineIdx >= lineList.length || !area) { el.style.display = 'none'; return; }
    const areaTop = area.getBoundingClientRect().top + window.scrollY;
    const ln = lineList[lineIdx];
    el.style.top    = (ln.top - areaTop) + 'px';
    el.style.height = (ln.bottom - ln.top + 4) + 'px';
    el.style.display = 'block';
}

function barColor(pct) {
    return pct >= 75 ? '#6EE7A6' : pct >= 50 ? '#FFC56B' : '#FF7676';
}

// ── 점 좌→우 이동 + 시선 측정 ────────────────────────────
const DOT_DURATION_MS = 3000;

function animateDot(lineIdx) {
    return new Promise(resolve => {
        const ln  = lineList[lineIdx];
        const dot = document.getElementById('moving-dot');

        const startX  = ln.xMin;
        const endX    = ln.xMax;
        const screenY = (ln.top + ln.bottom) / 2 - window.scrollY;

        dot.style.top     = screenY + 'px';
        dot.style.left    = startX + 'px';
        dot.style.display = 'block';

        let total = 0, correct = 0;

        const gazeHandler = ({ detail: { x, y } }) => {
            total++;
            if (getLineIndex(y) === lineIdx) correct++;
        };
        window.addEventListener('gaze:tracking', gazeHandler);

        const startTime = performance.now();
        function step(now) {
            const progress = Math.min((now - startTime) / DOT_DURATION_MS, 1);
            dot.style.left = (startX + (endX - startX) * progress) + 'px';

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                dot.style.display = 'none';
                window.removeEventListener('gaze:tracking', gazeHandler);
                resolve({
                    acc:     total > 0 ? Math.round(correct / total * 100) : 0,
                    total,
                    correct,
                });
            }
        }
        requestAnimationFrame(step);
    });
}

// ── 상태 ─────────────────────────────────────────────────
let testLines = [];
let testIdx   = 0;
let results   = [];
let currentTargetLine = -1;
let measuring = false;

// ── 테스트 시작 ───────────────────────────────────────────
async function startTest() {
    document.getElementById('start-box').style.display = 'none';
    document.getElementById('test-section').style.display = 'block';

    const textEl = document.getElementById('reading-text');
    textEl.innerHTML = TEST_PARAS.map(p =>
        `<p>${p.split(/\s+/).map(w => `<span class="word">${w}</span>`).join(' ')}</p>`
    ).join('');

    await new Promise(r => setTimeout(r, 100));
    buildLineList();

    if (!lineList.length) {
        document.getElementById('status-msg').textContent = '줄 목록을 구성하지 못했습니다.';
        return;
    }

    const MAX  = 6;
    const step = Math.max(1, Math.floor(lineList.length / MAX));
    testLines  = [];
    for (let i = 0; i < lineList.length; i += step) {
        testLines.push(i);
        if (testLines.length >= MAX) break;
    }

    testIdx = 0;
    results = [];
    showLine(0);
}

function showLine(idx) {
    currentTargetLine = testLines[idx];
    measuring = false;

    highlightLine(currentTargetLine);

    const btn = document.getElementById('next-btn');
    document.getElementById('status-msg').textContent  = `${currentTargetLine + 1}번째 줄을 바라보세요`;
    document.getElementById('status-prog').textContent = `${idx + 1} / ${testLines.length}`;
    btn.textContent    = '측정하기';
    btn.style.display  = 'inline-block';
    btn.disabled       = false;
}

// ── 버튼 클릭 → 점 이동하며 측정 ─────────────────────────
async function nextLine() {
    if (measuring) return;
    measuring = true;

    const btn = document.getElementById('next-btn');
    btn.disabled      = true;
    btn.textContent   = '측정 중...';
    document.getElementById('status-msg').textContent = `${currentTargetLine + 1}번째 줄 — 점을 눈으로 따라가세요`;

    const { acc, total, correct } = await animateDot(currentTargetLine);
    results.push({ line: currentTargetLine, acc, total, correct });

    // 결과 잠깐 표시
    document.getElementById('status-msg').textContent = `${currentTargetLine + 1}번째 줄: ${acc}%`;
    btn.style.display = 'none';
    await new Promise(r => setTimeout(r, 700));

    testIdx++;
    if (testIdx < testLines.length) {
        showLine(testIdx);
    } else {
        document.getElementById('target-highlight').style.display = 'none';
        showResults(results);
    }
}

// ── 결과 표시 ────────────────────────────────────────────
function showResults(results) {
    document.getElementById('test-section').style.display = 'none';
    document.getElementById('results-box').style.display  = 'block';

    const avg = Math.round(results.reduce((s, r) => s + r.acc, 0) / results.length);
    const scoreEl = document.getElementById('result-score');
    scoreEl.textContent = `${avg}%`;
    scoreEl.style.color = barColor(avg);

    document.getElementById('result-tbody').innerHTML = results.map(r => `
        <tr>
            <td>${r.line + 1}번째 줄</td>
            <td style="font-weight:600;color:${barColor(r.acc)}">${r.acc}%</td>
            <td>
                <div class="mini-bar">
                    <div class="mini-fill" style="width:${r.acc}%;background:${barColor(r.acc)};"></div>
                </div>
            </td>
            <td style="color:rgba(232,238,255,0.45)">${r.correct} / ${r.total}</td>
        </tr>
    `).join('');
}
