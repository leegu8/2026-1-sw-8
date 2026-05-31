// ── 책 로드 ──────────────────────────────────────────────
let lineList    = [];
let allLineList = [];
let readingAreaRect = null;
let currentPage       = 0;
let totalPages        = 1;
let pageBoundaries    = [];
let _paginationTopPad = 0;
let _paginationMaxH   = 0;

(async () => {
    const bookId = +new URLSearchParams(location.search).get('book_id');
    if (!bookId) return;
    const book = await fetch(`/api/db/books/${bookId}`).then(r => r.ok ? r.json() : null);
    if (!book) return;
    document.getElementById('book-title').textContent = `📖 ${book.title}`;
    document.title = `${book.title} - 독서 아이트래킹`;
    const paras = book.content.split(/\n+/).map(s => s.trim()).filter(Boolean);
    document.querySelector('.reading-text').innerHTML = paras.map(para =>
        `<p>${para.split(/\s+/).map(w => `<span class="word">${w}</span>`).join(' ')}</p>`
    ).join('');
    bookWordCount = document.querySelector('.reading-text').innerText
        .trim().split(/\s+/).filter(w => w.length > 0).length;

    const timeIssue = localStorage.getItem('last_time_issue');
    if (timeIssue && bookWordCount > 0) {
        const popup = document.getElementById('improvement-popup');
        if (popup && popup.style.display === 'flex') {
            const fmt = s => { s = Math.round(s); return s >= 60 ? `${Math.floor(s/60)}분 ${s%60}초` : `${s}초`; };
            const optRange = `${fmt(bookWordCount / 400 * 60)} ~ ${fmt(bookWordCount / 270 * 60)}`;
            const note = document.createElement('p');
            note.style.cssText = 'font-size:0.85rem;color:#2980b9;font-weight:600;margin:10px 0 0;padding:10px 0 0;border-top:1px solid #dce8f5;line-height:1.6;';
            note.textContent = `📖 이 글의 적정 독서 시간: ${optRange}`;
            document.getElementById('popup-improvement-list').appendChild(note);
        }
        localStorage.removeItem('last_time_issue');
    }

    buildLineList();
    allLineList = lineList.map(l => ({ ...l }));
    initPagination();
    await createSession(bookId);
})();

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
    const rawTops = lineList.map(l => l.top);
    for (let i = 0; i < lineList.length; i++) {
        if (i > 0) {
            const mid = Math.round((lineList[i-1].bottom + lineList[i].top) / 2);
            lineList[i-1].bottom = mid; lineList[i].top = mid + 1;
        }
    }
    const topToIdx = new Map(rawTops.map((t, i) => [t, i]));
    document.querySelectorAll('.word').forEach(w => {
        const top = Math.round(w.getBoundingClientRect().top + window.scrollY);
        w.dataset.line = topToIdx.get(top) ?? -1;
    });
}

function initPagination() {
    if (!allLineList.length) return;
    const area = document.querySelector('.reading-area');
    const controls = document.querySelector('.reading-controls');
    const nav = document.getElementById('page-nav');
    const areaRect = area.getBoundingClientRect();
    _paginationTopPad = allLineList[0].top - areaRect.top;
    _paginationMaxH   = window.innerHeight - areaRect.top - 50 - controls.offsetHeight - 36;
    const bottomPad   = parseFloat(getComputedStyle(area).paddingBottom) || _paginationTopPad;
    const maxContentH = _paginationMaxH - _paginationTopPad - bottomPad;
    pageBoundaries = [];
    let s = 0;
    while (s < allLineList.length) {
        let e = s, h = 0;
        while (e < allLineList.length) {
            const lh = allLineList[e].bottom - allLineList[e].top;
            if (h + lh > maxContentH && e > s) break;
            h += lh; e++;
        }
        pageBoundaries.push({ start: s, end: e - 1 }); s = e;
    }
    totalPages = pageBoundaries.length;
    const clip = document.getElementById('reading-clip');
    if (clip) { clip.style.overflow = 'hidden'; clip.style.height = maxContentH + 'px'; }
    area.style.overflow = 'hidden';
    area.style.height   = _paginationMaxH + 'px';
    document.body.style.overflowY = 'hidden';
    if (nav) nav.style.display = totalPages > 1 ? 'flex' : 'none';
    goToPage(0);
}

function goToPage(page) {
    if (page < 0 || page >= totalPages) return;
    currentPage = page;
    const { start: startIdx } = pageBoundaries[page];
    const translateY = allLineList[0].top - allLineList[startIdx].top;
    document.querySelector('.reading-text').style.transform = `translateY(${translateY}px)`;
    const area = document.querySelector('.reading-area');
    area.style.height = _paginationMaxH + 'px';
    lineList = allLineList.map(l => ({ ...l, top: l.top + translateY, bottom: l.bottom + translateY }));
    readingAreaRect = area.getBoundingClientRect();
    updatePageNav();
}

function updatePageNav() {
    const prevBtn   = document.getElementById('prev-page-btn');
    const nextBtn   = document.getElementById('next-page-btn');
    const indicator = document.getElementById('page-indicator');
    const doneBtn   = document.getElementById('done-btn');
    if (prevBtn)   prevBtn.disabled   = currentPage <= 0;
    if (nextBtn)   nextBtn.disabled   = currentPage >= totalPages - 1;
    if (indicator) indicator.textContent = `${currentPage + 1} / ${totalPages}`;
    if (doneBtn) {
        const isLast = currentPage >= totalPages - 1;
        doneBtn.disabled = !isLast;
        doneBtn.style.opacity = isLast ? '' : '0.35';
        doneBtn.style.cursor  = isLast ? '' : 'not-allowed';
    }
}

function getLineIndex(y) {
    if (!lineList.length) return -1;
    const docY = y + window.scrollY;
    for (let i = 0; i < lineList.length; i++) {
        if (docY >= lineList[i].top && docY <= lineList[i].bottom) return i;
    }
    return -1;
}

function classifyTransition(prev, curr) {
    if (curr.line < 0) return 'oob';
    const dLine = curr.line - prev.line;
    if (dLine > 0) return 'down';
    if (dLine < 0) return 'up';
    const l = lineList[curr.line];
    const dx = curr.x - prev.x;
    const lineWidth = l ? l.xMax - l.xMin : 1;
    if (dx >  lineWidth * 0.02) return 'right';
    if (dx < -lineWidth * 0.02) return 'left';
    return 'still';
}

function getSegIdx(p) {
    if (p.line < 0 || p.line >= lineList.length) return -1;
    const l = lineList[p.line];
    const sw = (l.xMax - l.xMin) / 5;
    if (sw <= 0 || p.x < l.xMin || p.x > l.xMax) return -1;
    return Math.min(4, Math.floor((p.x - l.xMin) / sw));
}

const DEV_MODE = new URLSearchParams(location.search).has('dev');
if (!DEV_MODE) { import('/static/js/gaze.js'); }

let   sessionId       = null;
let   bookWordCount   = 0;
const gazeData        = [];
const patternData     = [];
const rereadingEvents = [];
let blurEventSent      = false;
let highlightEventSent = false;
const pendingCorrectionEvents = [];

function sendCorrectionEvent(type, lineIndex) {
    pendingCorrectionEvents.push({ event_type: type, line_index: lineIndex ?? null });
}

const REREAD_WINDOW_MS  = 30_000;
const REREAD_BLUR_ON    = 3;
let   startTime              = null;
let   lastValidLine          = -1;
let   lastValidLineTime      = 0;
let   blurActive             = false;
let   blurLine               = -1;
let   oobSince               = null;
let   currentReadingLine     = -1;
let   maxReadingLine         = -1;
let   lineDwellLine          = -1;
let   lineDwellCount         = 0;
let   lineDwellRightCount    = 0;
let   baselineLastChangedTime = 0;
const lineSegmentsVisited    = new Map();
const gazeDot = document.getElementById('gaze-dot');

if (DEV_MODE) {
    document.getElementById('dev-mode-badge').style.display = 'block';
    document.getElementById('recal-btn')?.style && (document.getElementById('recal-btn').style.display = 'none');
    document.body.style.cursor = 'none';
    document.getElementById('reading-status').textContent   = '🖱 개발자 모드 (마우스 = 시선)';
    gazeDot.style.display = 'block';
    let lastMouseX = 0, lastMouseY = 0;
    document.addEventListener('mousemove', e => {
        lastMouseX = e.clientX; lastMouseY = e.clientY;
        gazeDot.style.left = e.clientX + 'px'; gazeDot.style.top = e.clientY + 'px';
    });
    setInterval(() => {
        window.dispatchEvent(new CustomEvent('gaze:tracking', { detail: { x: lastMouseX, y: lastMouseY } }));
    }, 33);
} else {
    document.getElementById('reading-status').textContent = '👁 시선 추적 중';
}

{
    const devFeatures = [
        { key: 'totalSec',       label: '① 독서시간' },
        { key: 'completion',     label: '② 완독률'   },
        { key: 'focus',          label: '③ 집중도'   },
        { key: 'regressionRate', label: '④ 역행비율' },
        { key: 'wpm',            label: '⑤ WPM'      },
        { key: 'behavior',       label: '⑥ 독서상태' },
        { key: 'baseLine',       label: '⑦ 기준 줄'  },
    ];

    function getFeatureValue(key) {
        if (!startTime) return '대기중';
        const elapsed = (Date.now() - startTime) / 1000;
        switch (key) {
            case 'totalSec': { const s = Math.floor(elapsed); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
            case 'completion':     return `${calcCompletion().completionRate}%`;
            case 'focus':          return `${calcFocusRate(elapsed)}%`;
            case 'regressionRate': return `${calcRegressionRate()}%`;
            case 'wpm': { const wc = document.querySelector('.reading-text').innerText.trim().split(/\s+/).filter(w=>w.length>0).length; return `${elapsed>0?Math.round(wc/(elapsed/60)):0}`; }
            case 'baseLine': { if (currentReadingLine < 0) return '--'; const segsSet = lineSegmentsVisited.get(currentReadingLine); const maxSeg = segsSet?.size>0?Math.max(...segsSet):-1; return `${currentReadingLine+1}줄 (${maxSeg+1}/5) ${maxReadingLine>=0?'↑'+(maxReadingLine+1):''}`.trim(); }
            case 'behavior': { const m={reading:'📖 정상독서',wrap:'↩ 줄바꿈',rereading:'🔄 재독',distracted:'😶 집중이탈',oob:'⊗ 이탈',idle:'대기중'}; return m[getReadingBehavior()]||'--'; }
            default: return '--';
        }
    }

    const panel = document.createElement('div');
    panel.id = 'dev-panel';
    panel.innerHTML =
        '<div class="dev-panel-title">📊 분석 항목 모니터</div>' +
        devFeatures.map(f => `<div class="dev-feature-row"><span class="dev-feature-label">${f.label}</span><span class="dev-feature-val" style="color:#4ade80">--</span></div>`).join('') +
        `<div style="border-top:1px solid rgba(139,92,246,0.25);margin:8px 0 6px;"></div>
        <div class="dev-feature-row" id="dev-status-regression"><span class="dev-feature-label">📖 재독</span><span class="dev-feature-val" style="color:#6b7280">없음</span></div>
        <div class="dev-feature-row" id="dev-status-focus"><span class="dev-feature-label">🧠 집중</span><span class="dev-feature-val" style="color:#4ade80">집중 중</span></div>
        <div style="border-top:1px solid rgba(139,92,246,0.25);margin:8px 0 6px;"></div>
        <div class="dev-feature-row"><span class="dev-feature-label" style="font-size:0.75rem;color:#9ca3af">최근패턴</span><span id="dev-pattern-hist" style="font-size:1.05rem;letter-spacing:3px;color:#9ca3af;min-width:80px;text-align:right">--</span></div>`;
    document.body.appendChild(panel);
    const ivPanel = document.getElementById('intervention-panel');
    if (ivPanel) { const ivRect = ivPanel.getBoundingClientRect(); panel.style.top = (ivRect.bottom+8)+'px'; panel.style.right='auto'; panel.style.left='20px'; }

    const PC = {right:'#4ade80',down:'#60a5fa',left:'#f87171',up:'#f97316',still:'#facc15',oob:'#9ca3af'};
    const PI = {right:'▶',down:'↓',left:'◀',up:'↑',still:'⏸',oob:'⊗'};

    setInterval(() => {
        panel.querySelectorAll('.dev-feature-row').forEach((row, i) => {
            if (i < devFeatures.length) {
                const v = row.querySelector('.dev-feature-val');
                v.textContent = getFeatureValue(devFeatures[i].key);
                if (devFeatures[i].key === 'behavior') {
                    const bc={reading:'#4ade80',wrap:'#60a5fa',rereading:'#f97316',distracted:'#f87171',oob:'#9ca3af',idle:'#6b7280'};
                    v.style.color = bc[getReadingBehavior()]||'#9ca3af';
                }
            }
        });
        const re = document.getElementById('dev-status-regression').querySelector('.dev-feature-val');
        const rc = startTime ? rereadingsInWindow() : 0;
        re.textContent = rc>0?`${rc}회 / 30초`:'없음';
        re.style.color = rc>=REREAD_BLUR_ON?'#f87171':rc>0?'#f97316':'#6b7280';
        const fe = document.getElementById('dev-status-focus').querySelector('.dev-feature-val');
        const il = startTime && isLostFocus();
        fe.textContent = il?'⚠ 집중 이탈':'집중 중'; fe.style.color = il?'#f87171':'#4ade80';
        const he = document.getElementById('dev-pattern-hist');
        if (patternData.length) he.innerHTML = patternData.slice(-10).map(p=>`<span style="color:${PC[p.type]||'#9ca3af'}">${PI[p.type]||'?'}</span>`).join('');
    }, 1000);
}

function isReadingStart(x, y) {
    if (!lineList.length) return false;
    const line = getLineIndex(y);
    if (line !== 0) return false;
    const l = lineList[line];
    if (!l) return false;
    return x >= l.xMin && x <= l.xMin + (l.xMax - l.xMin) / 5;
}

window.addEventListener('gaze:tracking', ({ detail: { x, y } }) => {
    if (document.getElementById('improvement-popup')?.style.display === 'flex') return;
    if (!startTime && isReadingStart(x, y)) {
        startTime = Date.now();
        gazeData.length = patternData.length = rereadingEvents.length = 0;
        lineSegmentsVisited.clear();
        currentReadingLine = maxReadingLine = lineDwellLine = -1;
        lineDwellCount = lineDwellRightCount = 0;
        baselineLastChangedTime = Date.now();
        lastValidLine = 0; lastValidLineTime = 0; oobSince = null;
        return;
    }
    const now     = Date.now();
    const rawLine = getLineIndex(y);
    const rawFiltered = rawLine >= 0 ? rawLine : (lastValidLine >= 0 && now - lastValidLineTime < 300) ? lastValidLine : -1;
    updateGazeLineHighlight(currentReadingLine);
    const blurOob = blurActive && rawFiltered >= 0 && blurLine >= 0 && rawFiltered < blurLine;
    const xOob    = readingAreaRect ? (x < readingAreaRect.left || x > readingAreaRect.right) : false;
    const line    = (blurOob || xOob) ? -1 : rawFiltered;
    if (!startTime) return;
    if (gazeData.length === 0 || now - gazeData[gazeData.length-1].t >= 100) {
        const curr = { x, line, t: now };
        let type = 'still';
        if (gazeData.length > 0) { type = classifyTransition(gazeData[gazeData.length-1], curr); patternData.push({ type, t: now, line, x }); }
        updateLineTracking(x, line, type);
        gazeData.push(curr);
        if (rawLine >= 0) { lastValidLine = rawLine; lastValidLineTime = now; oobSince = null; }
        else { if (oobSince === null) oobSince = now; }
    }
});

async function createSession(bookId) {
    const userId = +(localStorage.getItem('user_id') || '0');
    if (!userId) return;
    try {
        const res = await fetch('/api/db/sessions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, book_id: bookId, total_lines: lineList.length || null }),
        });
        if (res.ok) sessionId = (await res.json()).id;
    } catch {}
}

document.getElementById('done-btn').addEventListener('click', async () => {
    const result = analyzeReading();
    if (sessionId) {
        try {
            await fetch(`/api/db/sessions/${sessionId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ended_at:            new Date().toISOString().slice(0,19),
                    total_duration_sec:  Math.round(result.totalSec),
                    wpm:                 result.error ? null : (result.wpm            ?? null),
                    concentration_score: result.error ? null : (result.focusRate      ?? null),
                    regression_ratio:    result.error ? null : (result.regressionRate ?? null),
                    visited_lines:       result.visitedLines ?? null,
                    total_lines:         result.totalLines   ?? null,
                    word_count:          bookWordCount || null,
                }),
            });
            for (const ev of pendingCorrectionEvents) {
                await fetch('/api/db/correction-events', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId, ...ev }),
                }).catch(() => {});
            }
        } catch {}
    }
    localStorage.setItem('max_rereadings_30s', calcMaxRereadingsIn30s());
    window.location.href = `/result.html?session_id=${sessionId ?? ''}`;
});

document.getElementById('recal-btn')?.addEventListener('click', () => { window.location.href = '/guide.html'; });
document.getElementById('prev-page-btn')?.addEventListener('click', () => goToPage(currentPage - 1));
document.getElementById('next-page-btn')?.addEventListener('click', () => goToPage(currentPage + 1));

function applyRegressionBlur() {
    document.querySelectorAll('.word[data-line]').forEach(w => {
        const ln = +w.dataset.line;
        if (ln >= 0 && ln < blurLine) w.classList.add('word-blur');
        else w.classList.remove('word-blur');
    });
}
function clearRegressionBlur() { document.querySelectorAll('.word-blur').forEach(w => w.classList.remove('word-blur')); }

const ivBlurCheck = document.getElementById('iv-blur-check');
setInterval(() => {
    if (!startTime || !ivBlurCheck.checked) {
        if (blurActive) { blurActive = false; blurLine = -1; clearRegressionBlur(); blurEventSent = false; } return;
    }
    const rc = rereadingsInWindow();
    if (!blurActive && rc >= REREAD_BLUR_ON) { blurActive = true; if (!blurEventSent) { blurEventSent = true; sendCorrectionEvent('BLUR', currentReadingLine); } }
    if (blurActive) { if (rc >= REREAD_BLUR_ON) blurLine = currentReadingLine; applyRegressionBlur(); }
}, 500);

function analyzeReading() {
    const totalSec = startTime ? (Date.now() - startTime) / 1000 : 0;
    if (gazeData.length < 10) return { error: true, totalSec };
    const { visitedLines, totalLines, completionRate } = calcCompletion();
    const focusRate      = calcFocusRate(totalSec);
    const { regressionCount, regRate } = calcRegressions(totalSec);
    const regressionRate = calcRegressionRate();
    const wordCount = document.querySelector('.reading-text').innerText.trim().split(/\s+/).filter(w=>w.length>0).length;
    const wpm = totalSec > 0 ? Math.round(wordCount / (totalSec / 60)) : 0;
    return { totalSec, completionRate, focusRate, regressionCount, regRate, regressionRate, wpm, visitedLines, totalLines, error: false };
}

function calcCompletion() {
    const totalLines = lineList.length;
    if (!totalLines) return { visitedLines: 0, totalLines: 0, completionRate: 0 };
    let visitedSegs = 0;
    for (let i = 0; i < totalLines; i++) visitedSegs += lineSegmentsVisited.get(i)?.size ?? 0;
    const totalSegs = totalLines * 5;
    return { visitedLines: visitedSegs, totalLines: totalSegs, completionRate: Math.round(visitedSegs / totalSegs * 100) };
}

function calcFocusRate(totalSec) {
    if (!patternData.length || totalSec <= 0) return 0;
    const distracted = new Array(patternData.length).fill(false);
    function markRun(type, minMs) {
        let rs = null;
        for (let i = 0; i < patternData.length; i++) {
            if (patternData[i].type === type) { if (rs === null) rs = i; }
            else { if (rs !== null) { const dur = patternData[i].t - patternData[rs].t; if (dur >= minMs) for (let k = rs; k < i; k++) distracted[k] = true; rs = null; } }
        }
        if (rs !== null) { const dur = patternData[patternData.length-1].t - patternData[rs].t; if (dur >= minMs) for (let k = rs; k < patternData.length; k++) distracted[k] = true; }
    }
    markRun('oob', 100); markRun('still', 1500);
    let unfocusedMs = 0;
    for (let i = 0; i < patternData.length; i++) { if (distracted[i]) { const next = patternData[i+1]; unfocusedMs += next ? next.t - patternData[i].t : 100; } }
    const span = gazeData[gazeData.length-1].t - gazeData[0].t;
    if (span <= 0) return 100;
    return Math.round(Math.max(0, (span - unfocusedMs) / span * 100));
}

function calcRegressionRate() {
    const allMoves = patternData.filter(p => ['right','left','up','down','still'].includes(p.type));
    if (!allMoves.length) return 0;
    const saccades = patternData.filter(p => ['right','left','up','down'].includes(p.type));
    const regCount = saccades.filter((p, i) => {
        if (p.type === 'up') return true;
        if (p.type !== 'left') return false;
        if (saccades[i+1]?.type === 'down') return false;
        return true;
    }).length;
    return Math.round(regCount / allMoves.length * 100);
}

function calcRegressions(totalSec = 0) {
    const regressionCount = rereadingEvents.length;
    const regRate = totalSec > 0 ? Math.round(regressionCount / (totalSec / 30) * 10) / 10 : 0;
    return { regressionCount, regRate };
}

function updateLineTracking(x, line, type = 'still') {
    if (line < 0) { lineDwellCount = 0; return; }
    if (currentReadingLine < 0) { currentReadingLine = line; if (line > maxReadingLine) maxReadingLine = line; }
    const l = lineList[line];
    if (l) {
        const sw = (l.xMax - l.xMin) / 5;
        if (sw > 0) {
            const seg = Math.max(0, Math.min(4, Math.floor((x - l.xMin) / sw)));
            if (!lineSegmentsVisited.has(line)) lineSegmentsVisited.set(line, new Set());
            lineSegmentsVisited.get(line).add(seg);
        }
    }
    if (line === lineDwellLine) { lineDwellCount++; if (type === 'right') lineDwellRightCount++; }
    else { lineDwellLine = line; lineDwellCount = 1; lineDwellRightCount = (type === 'right') ? 1 : 0; }
    if (lineDwellRightCount >= 3) {
        if (line < currentReadingLine) { rereadingEvents.push(Date.now()); baselineLastChangedTime = Date.now(); currentReadingLine = line; }
        else if (line > currentReadingLine) { baselineLastChangedTime = Date.now(); currentReadingLine = line; if (line > maxReadingLine) maxReadingLine = line; }
    }
}

function rereadingsInWindow(windowMs = REREAD_WINDOW_MS) { return rereadingEvents.filter(t => t >= Date.now() - windowMs).length; }

function calcMaxRereadingsIn30s() {
    if (!rereadingEvents.length) return 0;
    const W = 30000; let max = 0;
    for (let i = 0; i < rereadingEvents.length; i++) {
        let count = 0;
        for (let j = i; j < rereadingEvents.length && rereadingEvents[j] - rereadingEvents[i] <= W; j++) count++;
        max = Math.max(max, count);
    }
    return max;
}

function isLostFocus() {
    if (!startTime || patternData.length < 3) return false;
    const recent = patternData.filter(p => p.t >= Date.now() - 2000);
    if (recent.length < 3) return false;
    return recent.every(p => p.type === 'oob' || p.type === 'still');
}

function getReadingBehavior() {
    if (!startTime || patternData.length === 0) return 'idle';
    const types = patternData.slice(-10).map(p => p.type);
    if (types.slice(-3).every(t => t === 'oob')) return 'oob';
    if (types.slice(-5).every(t => t === 'still' || t === 'oob')) return 'distracted';
    if (rereadingEvents.some(t => t >= Date.now() - 2000)) return 'rereading';
    if (types.slice(-3).includes('down')) return 'wrap';
    if (types.includes('right')) return 'reading';
    return 'idle';
}

function showOverlay(el) { el.style.display = 'block'; requestAnimationFrame(() => { el.style.opacity = '1'; }); }
function hideOverlay(el) { el.style.opacity = '0'; setTimeout(() => { if (el.style.opacity === '0') el.style.display = 'none'; }, 450); }

const _gazeLineHighlight = document.getElementById('current-line-highlight');
function updateGazeLineHighlight(lineIdx) {
    if (!lineList.length || lineIdx < 0 || lineIdx >= lineList.length) { _gazeLineHighlight.style.display = 'none'; return; }
    const areaTop = document.querySelector('.reading-area').getBoundingClientRect().top + window.scrollY;
    const ln = lineList[lineIdx];
    _gazeLineHighlight.style.top    = (ln.top - areaTop) + 'px';
    _gazeLineHighlight.style.height = (ln.bottom - ln.top + 4) + 'px';
    _gazeLineHighlight.style.display = 'block';
}

const _calloutFocus = document.getElementById('callout-focus');
function _positionCallout(el, lineIdx, side) {
    if (lineIdx < 0 || lineIdx >= lineList.length) return;
    const ln = lineList[lineIdx];
    const centerY = (ln.top + ln.bottom) / 2 - window.scrollY;
    if (side === 'left') { el.style.left = ''; el.style.right = (window.innerWidth - (readingAreaRect?.left ?? 0) + 6) + 'px'; }
    else { el.style.right = ''; el.style.left = ((readingAreaRect?.right ?? window.innerWidth * 0.75) + 6) + 'px'; }
    el.style.top = (centerY - el.offsetHeight / 2) + 'px';
}
function showFocusCallout(lineIdx) {
    if (lineIdx < 0 || lineIdx >= lineList.length) { hideFocusCallout(); return; }
    _calloutFocus.querySelector('.callout-box').textContent = '👁 집중하세요';
    _calloutFocus.classList.add('show');
    _positionCallout(_calloutFocus, lineIdx, 'left');
}
function hideFocusCallout() { _calloutFocus.classList.remove('show'); }

function updateHighlightBar(lineIdx) {
    const bar = document.getElementById('line-highlight-bar');
    if (lineIdx < 0 || lineIdx >= lineList.length) { hideOverlay(bar); return; }
    const areaTop = document.querySelector('.reading-area').getBoundingClientRect().top + window.scrollY;
    const ln = lineList[lineIdx];
    bar.style.top    = (ln.top - areaTop) + 'px';
    bar.style.height = (ln.bottom - ln.top + 4) + 'px';
    showOverlay(bar);
}

const ivHighlightCheck = document.getElementById('iv-highlight-check');
setInterval(() => {
    const bar = document.getElementById('line-highlight-bar');
    if (!startTime || !ivHighlightCheck.checked) { hideOverlay(bar); hideFocusCallout(); return; }
    if (isLostFocus()) {
        updateHighlightBar(currentReadingLine);
        showFocusCallout(currentReadingLine);
        if (!highlightEventSent) { highlightEventSent = true; sendCorrectionEvent('HIGHLIGHT', currentReadingLine); }
    } else { hideOverlay(bar); hideFocusCallout(); highlightEventSent = false; }
}, 500);
