// ── 책 로드 ──────────────────────────────────────────────
let lineList        = [];
let allLineList     = [];
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
            const mid = Math.round((lineList[i - 1].bottom + lineList[i].top) / 2);
            lineList[i - 1].bottom = mid;
            lineList[i].top = mid + 1;
        }
    }
    const topToIdx = new Map(rawTops.map((t, i) => [t, i]));
    document.querySelectorAll('.word').forEach(w => {
        const top = Math.round(w.getBoundingClientRect().top + window.scrollY);
        w.dataset.line = topToIdx.get(top) ?? -1;
    });
}

// ── 페이지네이션 ──────────────────────────────────────────
function initPagination() {
    if (!allLineList.length) return;

    const area     = document.querySelector('.reading-area');
    const controls = document.querySelector('.reading-controls');
    const nav      = document.getElementById('page-nav');
    const areaRect = area.getBoundingClientRect();

    _paginationTopPad = allLineList[0].top - areaRect.top;
    _paginationMaxH   = window.innerHeight
        - areaRect.top
        - 50
        - controls.offsetHeight
        - 36;

    const bottomPad   = parseFloat(getComputedStyle(area).paddingBottom) || _paginationTopPad;
    const maxContentH = _paginationMaxH - _paginationTopPad - bottomPad;

    pageBoundaries = [];
    let s = 0;
    while (s < allLineList.length) {
        let e = s, h = 0;
        while (e < allLineList.length) {
            const lh = allLineList[e].bottom - allLineList[e].top;
            if (h + lh > maxContentH && e > s) break;
            h += lh;
            e++;
        }
        pageBoundaries.push({ start: s, end: e - 1 });
        s = e;
    }
    totalPages = pageBoundaries.length;

    const clip = document.getElementById('reading-clip');
    if (clip) {
        clip.style.overflow = 'hidden';
        clip.style.height   = maxContentH + 'px';
    }

    area.style.overflow        = 'hidden';
    area.style.height          = _paginationMaxH + 'px';
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

    lineList = allLineList.map(l => ({
        ...l,
        top:    l.top    + translateY,
        bottom: l.bottom + translateY,
    }));

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

// ── 패턴 분류 ─────────────────────────────────────────────
function classifyTransition(prev, curr) {
    if (curr.line < 0) return 'oob';
    const dLine = curr.line - prev.line;
    if (dLine > 0) return 'down';
    if (dLine < 0) return 'up';
    const l = lineList[curr.line];
    const lineWidth = l ? l.xMax - l.xMin : 1;
    const dx = curr.x - prev.x;
    if (dx >  lineWidth * 0.02) return 'right';
    if (dx < -lineWidth * 0.02) return 'left';
    return 'still';
}

function getSegIdx(p) {
    if (p.line < 0 || p.line >= lineList.length) return -1;
    const l  = lineList[p.line];
    const sw = (l.xMax - l.xMin) / 5;
    if (sw <= 0 || p.x < l.xMin || p.x > l.xMax) return -1;
    return Math.min(4, Math.floor((p.x - l.xMin) / sw));
}

// ── 실제 시선 추적 로드 ───────────────────────────────────
import('/static/js/gaze.js');

// ── 상태 변수 ────────────────────────────────────────────
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
const ADVANCE_DWELL     = 2;
const REGRESS_DWELL     = 4;
let   startTime         = null;
let   lastValidLine     = -1;
let   lastValidLineTime = 0;
let   blurActive        = false;
let   blurLine          = -1;
let   oobSince          = null;

let   currentReadingLine     = -1;
let   maxReadingLine         = -1;
let   lineDwellLine          = -1;
let   lineDwellCount         = 0;
let   lineDwellMinX          = 0;
let   lineDwellHasRight      = false;
let   baselineLastChangedTime = 0;
let   skimAlertActive        = false;
const lineSegmentsVisited    = new Map();

document.getElementById('reading-status').textContent = '👁 시선 추적 중';

// ── 시선 이벤트 수집 ──────────────────────────────────────
window.addEventListener('gaze:tracking', ({ detail: { x, y } }) => {
    if (document.getElementById('improvement-popup')?.style.display === 'flex') return;
    if (!startTime && isReadingStart(x, y)) {
        startTime = Date.now();
        gazeData.length        = 0;
        patternData.length     = 0;
        rereadingEvents.length = 0;
        lineSegmentsVisited.clear();
        currentReadingLine       = -1;
        maxReadingLine           = -1;
        lineDwellLine            = -1;
        lineDwellCount           = 0;
        lineDwellMinX            = 0;
        lineDwellHasRight        = false;
        baselineLastChangedTime  = Date.now();
        skimAlertActive          = false;
        lastValidLine            = -1;
        lastValidLineTime        = 0;
        oobSince                 = null;
        return;
    }

    const now     = Date.now();
    const rawLine = getLineIndex(y);

    const rawFiltered = rawLine >= 0 ? rawLine
                      : (lastValidLine >= 0 && now - lastValidLineTime < 300) ? lastValidLine
                      : -1;

    const blurOob = blurActive && rawFiltered >= 0 && blurLine >= 0 && rawFiltered < blurLine;
    const xOob    = readingAreaRect ? (x < readingAreaRect.left || x > readingAreaRect.right) : false;
    const line    = (blurOob || xOob) ? -1 : rawFiltered;

    if (!startTime) return;

    if (gazeData.length === 0 || now - gazeData[gazeData.length - 1].t >= 100) {
        const curr = { x, line, t: now };
        let type = 'still';
        if (gazeData.length > 0) {
            type = classifyTransition(gazeData[gazeData.length - 1], curr);
            patternData.push({ type, t: now, line, x });
        }
        updateLineTracking(x, line, type);
        gazeData.push(curr);
        if (rawLine >= 0) {
            lastValidLine     = rawLine;
            lastValidLineTime = now;
            oobSince          = null;
        } else {
            if (oobSince === null) oobSince = now;
        }
    }
});

async function createSession(bookId) {
    const userId = +(localStorage.getItem('user_id') || '0');
    if (!userId) return;
    try {
        const res = await fetch('/api/db/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id:     userId,
                book_id:     bookId,
                total_lines: lineList.length || null,
            }),
        });
        if (res.ok) {
            sessionId = (await res.json()).id;
        } else {
            console.error('createSession 실패:', res.status, await res.text());
        }
    } catch (err) {
        console.error('createSession 오류:', err);
    }
}

function isReadingStart(x, y) {
    if (!lineList.length) return false;
    const line = getLineIndex(y);
    if (line !== 0) return false;
    const l = lineList[line];
    if (!l) return false;
    return x >= l.xMin && x <= l.xMin + (l.xMax - l.xMin) / 5;
}

// ── 다 읽었어요 버튼 ──────────────────────────────────────
document.getElementById('done-btn').addEventListener('click', async () => {
    const result = analyzeReading();
    if (sessionId) {
        try {
            await fetch(`/api/db/sessions/${sessionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ended_at:            new Date().toISOString().slice(0, 19),
                    total_duration_sec:  Math.round(result.totalSec),
                    wpm:                 result.error ? null : (result.wpm             ?? null),
                    concentration_score: result.error ? null : (result.focusRate       ?? null),
                    regression_ratio:    result.error ? null : (result.regressionRate  ?? null),
                    visited_lines:       result.visitedLines ?? null,
                    total_lines:         result.totalLines   ?? null,
                    word_count:          bookWordCount || null,
                }),
            });
            for (const ev of pendingCorrectionEvents) {
                await fetch('/api/db/correction-events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId, ...ev }),
                }).catch(() => {});
            }
        } catch {}
    }
    localStorage.setItem('max_rereadings_30s', calcMaxRereadingsIn30s());
    window.location.href = `/result.html?session_id=${sessionId ?? ''}`;
});

document.getElementById('recal-btn').addEventListener('click', () => {
    window.location.href = '/guide.html';
});

document.getElementById('prev-page-btn')?.addEventListener('click', () => goToPage(currentPage - 1));
document.getElementById('next-page-btn')?.addEventListener('click', () => goToPage(currentPage + 1));

// ── 역행 블러 ─────────────────────────────────────────────
function applyRegressionBlur() {
    document.querySelectorAll('.word[data-line]').forEach(w => {
        const ln = +w.dataset.line;
        if (ln >= 0 && ln < blurLine) w.classList.add('word-blur');
        else                          w.classList.remove('word-blur');
    });
}

function clearRegressionBlur() {
    document.querySelectorAll('.word-blur').forEach(w => w.classList.remove('word-blur'));
}

const ivBlurCheck      = document.getElementById('iv-blur-check');
const ivHighlightCheck = document.getElementById('iv-highlight-check');

setInterval(() => {
    if (!startTime || !ivBlurCheck.checked) {
        if (blurActive) { blurActive = false; blurLine = -1; clearRegressionBlur(); blurEventSent = false; }
        return;
    }
    const rereadCount = rereadingsInWindow();
    if (!blurActive && rereadCount >= REREAD_BLUR_ON) {
        blurActive = true;
        if (!blurEventSent) {
            blurEventSent = true;
            sendCorrectionEvent('BLUR', currentReadingLine);
        }
    }
    if (blurActive) {
        if (rereadCount >= REREAD_BLUR_ON) blurLine = currentReadingLine;
        applyRegressionBlur();
    }
}, 500);

// ── 세션 전체 분석 ────────────────────────────────────────
function analyzeReading() {
    const totalSec = startTime ? (Date.now() - startTime) / 1000 : 0;
    if (gazeData.length < 10) return { error: true, totalSec };

    const { visitedLines, totalLines, completionRate } = calcCompletion();
    const focusRate       = calcFocusRate(totalSec);
    const { regressionCount, regRate } = calcRegressions(totalSec);
    const regressionRate  = calcRegressionRate();
    const wordCount = document.querySelector('.reading-text').innerText
        .trim().split(/\s+/).filter(w => w.length > 0).length;
    const wpm = totalSec > 0 ? Math.round(wordCount / (totalSec / 60)) : 0;

    return { totalSec, completionRate, focusRate, regressionCount, regRate, regressionRate, wpm, visitedLines, totalLines, error: false };
}

// ── 완독률 — 방문한 세그먼트 합 / 전체 세그먼트(줄 수 × 5) ──
function calcCompletion() {
    const totalLines = lineList.length;
    if (!totalLines) return { visitedLines: 0, totalLines: 0, completionRate: 0 };

    let visitedSegs = 0;
    for (let i = 0; i < totalLines; i++) {
        visitedSegs += lineSegmentsVisited.get(i)?.size ?? 0;
    }
    const totalSegs = totalLines * 5;
    return { visitedLines: visitedSegs, totalLines: totalSegs, completionRate: Math.round(visitedSegs / totalSegs * 100) };
}

function calcFocusRate(totalSec) {
    if (!patternData.length || totalSec <= 0) return 0;
    const distracted = new Array(patternData.length).fill(false);
    function markRun(type, minMs) {
        let runStart = null;
        for (let i = 0; i < patternData.length; i++) {
            if (patternData[i].type === type) {
                if (runStart === null) runStart = i;
            } else {
                if (runStart !== null) {
                    const dur = patternData[i].t - patternData[runStart].t;
                    if (dur >= minMs) for (let k = runStart; k < i; k++) distracted[k] = true;
                    runStart = null;
                }
            }
        }
        if (runStart !== null) {
            const dur = patternData[patternData.length - 1].t - patternData[runStart].t;
            if (dur >= minMs) for (let k = runStart; k < patternData.length; k++) distracted[k] = true;
        }
    }
    markRun('oob',   100);
    markRun('still', 1500);
    let unfocusedMs = 0;
    for (let i = 0; i < patternData.length; i++) {
        if (distracted[i]) {
            const next = patternData[i + 1];
            unfocusedMs += next ? next.t - patternData[i].t : 100;
        }
    }
    const gazeSpanMs = gazeData[gazeData.length - 1].t - gazeData[0].t;
    if (gazeSpanMs <= 0) return 100;
    return Math.round(Math.max(0, (gazeSpanMs - unfocusedMs) / gazeSpanMs * 100));
}

// ── 역행비율 — 노이즈 필터 적용 ──────────────────────────
// 분모: 방향 전환 + 정지 (still 포함)
// 분자: 노이즈 제거된 left + up
//   제외: left→down(줄바꿈)
function calcRegressionRate() {
    const allMoves = patternData.filter(p =>
        p.type === 'right' || p.type === 'left' || p.type === 'up' || p.type === 'down' || p.type === 'still'
    );
    if (!allMoves.length) return 0;

    const saccades = patternData.filter(p =>
        p.type === 'right' || p.type === 'left' || p.type === 'up' || p.type === 'down'
    );
    const regCount = saccades.filter((p, i) => {
        if (p.type === 'up') return true;
        if (p.type !== 'left') return false;
        if (saccades[i + 1]?.type === 'down') return false;
        return true;
    }).length;
    return Math.round(regCount / allMoves.length * 100);
}

function calcRegressions(totalSec = 0) {
    const regressionCount = rereadingEvents.length;
    const regRate = totalSec > 0
        ? Math.round(regressionCount / (totalSec / 30) * 10) / 10
        : 0;
    return { regressionCount, regRate };
}

// ── 줄 기반 역행 감지 ────────────────────────────────────
function updateLineTracking(x, line, type = 'still') {
    if (line < 0) { lineDwellCount = 0; return; }

    if (currentReadingLine < 0) {
        currentReadingLine = line;
        if (line > maxReadingLine) maxReadingLine = line;
    }

    // 세그먼트 방문 기록 — 시선이 닿는 모든 줄, Set으로 개별 추적
    const l = lineList[line];
    if (l) {
        const sw = (l.xMax - l.xMin) / 5;
        if (sw > 0) {
            const seg = Math.max(0, Math.min(4, Math.floor((x - l.xMin) / sw)));
            if (!lineSegmentsVisited.has(line)) lineSegmentsVisited.set(line, new Set());
            lineSegmentsVisited.get(line).add(seg);
        }
    }

    if (line === lineDwellLine) {
        lineDwellCount++;
        if (x < lineDwellMinX) lineDwellMinX = x;
        if (type === 'right') lineDwellHasRight = true;
    } else {
        lineDwellLine     = line;
        lineDwellCount    = 1;
        lineDwellMinX     = x;
        lineDwellHasRight = (type === 'right');
    }

    if (lineDwellCount >= ADVANCE_DWELL && lineDwellHasRight) {
        if (line <= maxReadingLine) {
            if (line < currentReadingLine) rereadingEvents.push(Date.now());
            if (line !== currentReadingLine) baselineLastChangedTime = Date.now();
            currentReadingLine = line;
        } else if (line === currentReadingLine + 1) {
            const maxSeg = lineSegmentsVisited.get(currentReadingLine)?.size ?? 0;
            if (maxSeg >= 3) {
                const nextL     = lineList[line];
                const lineWidth = nextL ? nextL.xMax - nextL.xMin : 0;
                const landedLeft = lineWidth > 0 && lineDwellMinX <= nextL.xMin + lineWidth * 0.5;
                if (landedLeft) {
                    currentReadingLine      = line;
                    maxReadingLine          = line;
                    baselineLastChangedTime = Date.now();
                    skimAlertActive         = false;
                }
            }
        }
    }
}

function rereadingsInWindow(windowMs = REREAD_WINDOW_MS) {
    const cutoff = Date.now() - windowMs;
    return rereadingEvents.filter(t => t >= cutoff).length;
}

function calcMaxRereadingsIn30s() {
    if (!rereadingEvents.length) return 0;
    const W = 30000;
    let max = 0;
    for (let i = 0; i < rereadingEvents.length; i++) {
        let count = 0;
        for (let j = i; j < rereadingEvents.length && rereadingEvents[j] - rereadingEvents[i] <= W; j++) count++;
        max = Math.max(max, count);
    }
    return max;
}

// ── 집중 이탈 판정 ────────────────────────────────────────
function isLostFocus() {
    if (!startTime || patternData.length < 3) return false;
    const cutoff = Date.now() - 2000;
    const recent = patternData.filter(p => p.t >= cutoff);
    if (recent.length < 3) return false;
    return recent.every(p => p.type === 'oob' || p.type === 'still');
}

// ── 하이라이트 바 ─────────────────────────────────────────
function showOverlay(el) {
    el.style.display = 'block';
    requestAnimationFrame(() => { el.style.opacity = '1'; });
}
function hideOverlay(el) {
    el.style.opacity = '0';
    setTimeout(() => { if (el.style.opacity === '0') el.style.display = 'none'; }, 450);
}

function updateHighlightBar(lineIdx) {
    const bar = document.getElementById('line-highlight-bar');
    if (lineIdx < 0 || lineIdx >= lineList.length) { hideOverlay(bar); return; }
    const areaTop = document.querySelector('.reading-area').getBoundingClientRect().top + window.scrollY;
    const ln = lineList[lineIdx];
    bar.style.top    = (ln.top - areaTop) + 'px';
    bar.style.height = (ln.bottom - ln.top + 4) + 'px';
    showOverlay(bar);
}

setInterval(() => {
    const bar = document.getElementById('line-highlight-bar');
    if (!startTime || !ivHighlightCheck.checked) { hideOverlay(bar); highlightEventSent = false; return; }
    if (isLostFocus()) {
        updateHighlightBar(currentReadingLine);
        if (!highlightEventSent) {
            highlightEventSent = true;
            sendCorrectionEvent('HIGHLIGHT', currentReadingLine);
        }
    } else {
        hideOverlay(bar);
        highlightEventSent = false;
    }
}, 500);
