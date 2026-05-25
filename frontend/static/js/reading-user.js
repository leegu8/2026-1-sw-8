// ── 책 로드 ──────────────────────────────────────────────
let lineList        = [];
let readingAreaRect = null;

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
    buildLineList();
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

let blurEventSent = false;

async function sendCorrectionEvent(type, lineIndex) {
    if (!sessionId) return;
    try {
        await fetch('/api/db/correction-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, event_type: type, line_index: lineIndex }),
        });
    } catch {}
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
                x_min:       readingAreaRect ? readingAreaRect.left  : null,
                x_max:       readingAreaRect ? readingAreaRect.right : null,
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
        } catch {}
    }
    window.location.href = `/result.html?session_id=${sessionId ?? ''}`;
});

document.getElementById('recal-btn').addEventListener('click', () => {
    window.location.href = '/guide.html';
});

// ── 역행 블러 (항상 활성) ─────────────────────────────────
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

setInterval(() => {
    if (!startTime) return;
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

function calcCompletion() {
    const totalLines = lineList.length;
    if (!totalLines) return { visitedLines: 0, totalLines: 0, completionRate: 0 };
    let visited = 0;
    for (let i = 0; i < totalLines; i++) {
        if ((lineSegmentsVisited.get(i) ?? -1) >= 3) visited++;
    }
    return { visitedLines: visited, totalLines, completionRate: Math.round(visited / totalLines * 100) };
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

function calcRegressionRate() {
    const saccades = patternData.filter(p => ['right','left','up','down'].includes(p.type));
    if (!saccades.length) return 0;
    const regCount = saccades.filter(p => p.type === 'up' || p.type === 'left').length;
    return Math.round(regCount / saccades.length * 100);
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

    if (line === currentReadingLine) {
        const l = lineList[line];
        if (l) {
            const sw = (l.xMax - l.xMin) / 5;
            if (sw > 0) {
                const seg  = Math.max(0, Math.min(4, Math.floor((x - l.xMin) / sw)));
                const prev = lineSegmentsVisited.get(line) ?? -1;
                if (seg > prev) lineSegmentsVisited.set(line, seg);
            }
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
            const maxSeg = lineSegmentsVisited.get(currentReadingLine) ?? -1;
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
