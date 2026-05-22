// ── 책 로드 ──────────────────────────────────────────────
let lineList = []; // [{top, bottom, xMin, xMax}] — document y, viewport x

(async () => {
    const bookId = +new URLSearchParams(location.search).get('book_id');
    if (!bookId) return;
    const books = await fetch('/static/textdate/books.json').then(r => r.json());
    const book  = books.find(b => b.id === bookId);
    if (!book) return;
    document.getElementById('book-title').textContent = `📖 ${book.title}`;
    document.title = `${book.title} - 독서 아이트래킹`;
    const paras = book.content.split(/\n+/).map(s => s.trim()).filter(Boolean);
    document.querySelector('.reading-text').innerHTML = paras.map(para =>
        `<p>${para.split(/\s+/).map(w => `<span class="word">${w}</span>`).join(' ')}</p>`
    ).join('');
    buildLineList();
})();

// 줄별 메타 구축 — document 기준 y, viewport 기준 x (수평 스크롤 없음)
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

    // 단어 태깅용 원본 top 저장 (확장 전)
    const rawTops = lineList.map(l => l.top);

    // 인접 줄 간 gap을 공평하게 분할 — 각 줄의 top/bottom을 중간점까지 확장
    for (let i = 0; i < lineList.length; i++) {
        if (i > 0) {
            const mid = Math.round((lineList[i - 1].bottom + lineList[i].top) / 2);
            lineList[i - 1].bottom = mid;
            lineList[i].top = mid + 1;
        }
    }

    // 단어별 줄 인덱스 태깅 — 확장 전 원본 top 기준으로 매칭
    const topToIdx = new Map(rawTops.map((t, i) => [t, i]));
    document.querySelectorAll('.word').forEach(w => {
        const top = Math.round(w.getBoundingClientRect().top + window.scrollY);
        w.dataset.line = topToIdx.get(top) ?? -1;
    });
}

// 뷰포트 y → 줄 인덱스 — 확장된 경계 기반, gap 없음
function getLineIndex(y) {
    if (!lineList.length) return -1;
    const docY = y + window.scrollY;
    for (let i = 0; i < lineList.length; i++) {
        if (docY >= lineList[i].top && docY <= lineList[i].bottom) return i;
    }
    return -1;
}

// ── 패턴 분류 ─────────────────────────────────────────────
// 연속 두 포인트 간 전환을 5가지 패턴으로 분류
// forward  : 같은 줄, x 전진 (줄너비 3% 이상)
// wrap     : 줄+1 이동 (정상 줄바꿈)
// regress  : 줄 감소 OR 같은 줄 x 급후퇴 (줄너비 8% 이상)
// still    : 거의 안 움직임 (fixation 후보)
// oob      : 텍스트 범위 이탈
function classifyTransition(prev, curr) {
    if (curr.line < 0 || prev.line < 0) return 'oob';

    const l = lineList[curr.line];
    const lineWidth = l ? l.xMax - l.xMin : 0;
    if (lineWidth <= 0) return 'still';

    const dLine = curr.line - prev.line;
    const dx    = curr.x   - prev.x;

    if (dLine < 0)               return 'regress';
    if (dLine === 1)              return 'wrap';
    if (dLine > 1)                return 'oob';

    // 같은 줄
    if (dx >  lineWidth * 0.03)  return 'forward';
    if (dx < -lineWidth * 0.08)  return 'regress';
    return 'still';
}

// 줄 내 세그먼트 인덱스 (0~4) — x가 [xMin, xMax] 밖이면 -1
function getSegIdx(p) {
    if (p.line < 0 || p.line >= lineList.length) return -1;
    const l  = lineList[p.line];
    const sw = (l.xMax - l.xMin) / 5;
    if (sw <= 0 || p.x < l.xMin || p.x > l.xMax) return -1;
    return Math.min(4, Math.floor((p.x - l.xMin) / sw));
}


// ── gaze.js 조건부 로드 ───────────────────────────────────
const DEV_MODE = new URLSearchParams(location.search).has('dev');

if (!DEV_MODE) {
    import('/static/js/gaze.js');
}

// ── 상태 변수 ────────────────────────────────────────────
const gazeData    = [];
const patternData = []; // [{type, t, line, x}] — gazeData 전환별 패턴
let   startTime      = null;
let   lastValidLine  = -1;   // line >= 0 인 최신 줄 인덱스
let   blurActive     = false; // 역행 블러 활성 상태
let   blurAnchorLine = -1;   // 블러 기준 줄 — 활성 중 앞으로만 이동, 뒤로 안 감
let   oobSince       = null;  // 시선이 텍스트 범위 이탈 시작 시점

const gazeDot = document.getElementById('gaze-dot');

// ── 개발자 모드 설정 ──────────────────────────────────────
if (DEV_MODE) {
    document.getElementById('dev-mode-badge').style.display = 'block';
    document.getElementById('recal-btn').style.display      = 'none';
    document.body.style.cursor = 'none';
    document.getElementById('reading-status').textContent   = '🖱 개발자 모드 (마우스 = 시선)';

    gazeDot.style.display = 'block';

    document.addEventListener('mousemove', e => {
        gazeDot.style.left = e.clientX + 'px';
        gazeDot.style.top  = e.clientY + 'px';
        window.dispatchEvent(new CustomEvent('gaze:tracking', {
            detail: { x: e.clientX, y: e.clientY }
        }));
    });

    // ── 분석 항목 모니터 패널 ─────────────────────────────
    const devFeatures = [
        { key: 'totalSec',   label: '① 독서시간' },
        { key: 'completion', label: '② 완독률'   },
        { key: 'focus',      label: '③ 집중도'   },
        { key: 'regression', label: '④ 역행비율' },
        { key: 'wpm',        label: '⑤ WPM'      },
        { key: 'pattern',    label: '⑥ 현재패턴' },
    ];

    function getFeatureValue(key) {
        if (!startTime) return '대기중';
        const elapsed = (Date.now() - startTime) / 1000;
        switch (key) {
            case 'totalSec': {
                const s = Math.floor(elapsed);
                return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
            }
            case 'completion': {
                return `${calcCompletion().completionRate}%`;
            }
            case 'focus': {
                return `${calcFocusRate(elapsed)}%`;
            }
            case 'regression': {
                return `${calcRegressions(elapsed).regRate}%`;
            }
            case 'wpm': {
                const wc = document.querySelector('.reading-text').innerText
                    .trim().split(/\s+/).filter(w => w.length > 0).length;
                return `${elapsed > 0 ? Math.round(wc / (elapsed / 60)) : 0}`;
            }
            case 'pattern': {
                if (!patternData.length) return '--';
                const t = patternData[patternData.length - 1].type;
                const map = { forward: '▶ 전진', wrap: '↩ 줄변경', regress: '◀ 역행', still: '⏸ 정지', oob: '⊗ 이탈' };
                return map[t] || t;
            }
            default: return '--';
        }
    }

    const panel = document.createElement('div');
    panel.id = 'dev-panel';
    panel.innerHTML =
        '<div class="dev-panel-title">📊 분석 항목 모니터</div>' +
        devFeatures.map(f =>
            `<div class="dev-feature-row">
                <span class="dev-feature-label">${f.label}</span>
                <span class="dev-feature-val" style="color:#4ade80">--</span>
            </div>`
        ).join('') +
        `<div style="border-top:1px solid rgba(139,92,246,0.25);margin:8px 0 6px;"></div>
        <div class="dev-feature-row" id="dev-status-regression">
            <span class="dev-feature-label">⏪ 역행</span>
            <span class="dev-feature-val" style="color:#6b7280">정상</span>
        </div>
        <div class="dev-feature-row" id="dev-status-focus">
            <span class="dev-feature-label">🧠 집중</span>
            <span class="dev-feature-val" style="color:#4ade80">집중 중</span>
        </div>
        <div style="border-top:1px solid rgba(139,92,246,0.25);margin:8px 0 6px;"></div>
        <div class="dev-feature-row">
            <span class="dev-feature-label" style="font-size:0.75rem;color:#9ca3af">최근패턴</span>
            <span id="dev-pattern-hist" style="font-size:1.05rem;letter-spacing:3px;color:#9ca3af;min-width:80px;text-align:right">--</span>
        </div>`;
    document.body.appendChild(panel);

    const PATTERN_COLORS = { forward: '#4ade80', wrap: '#60a5fa', regress: '#f87171', still: '#facc15', oob: '#f97316' };
    const PATTERN_ICONS  = { forward: '▶', wrap: '↩', regress: '◀', still: '⏸', oob: '⊗' };

    setInterval(() => {
        panel.querySelectorAll('.dev-feature-row').forEach((row, i) => {
            if (i < devFeatures.length) {
                const valEl = row.querySelector('.dev-feature-val');
                valEl.textContent = getFeatureValue(devFeatures[i].key);
                // ⑥ 현재패턴 행: 패턴 유형에 맞는 색상
                if (devFeatures[i].key === 'pattern' && patternData.length) {
                    valEl.style.color = PATTERN_COLORS[patternData[patternData.length - 1].type] || '#9ca3af';
                }
            }
        });

        // 역행 상태: 최근 40패턴(~4초) 안에 역행 감지 여부
        const regEl = document.getElementById('dev-status-regression').querySelector('.dev-feature-val');
        const isReg = startTime && countRegressions(patternData.slice(-40)) > 0;
        regEl.textContent = isReg ? '⚠ 역행 감지' : '정상';
        regEl.style.color = isReg ? '#f87171' : '#6b7280';

        // 집중 상태
        const focusEl = document.getElementById('dev-status-focus').querySelector('.dev-feature-val');
        const isLost = startTime && isLostFocus();
        focusEl.textContent = isLost ? '⚠ 집중 이탈' : '집중 중';
        focusEl.style.color = isLost ? '#f87171' : '#4ade80';

        // 최근 10 패턴 기록 (아이콘 나열, 가장 오래된 → 최신 순)
        const histEl = document.getElementById('dev-pattern-hist');
        if (patternData.length) {
            const recent = patternData.slice(-10);
            histEl.innerHTML = recent.map(p =>
                `<span style="color:${PATTERN_COLORS[p.type] || '#9ca3af'}">${PATTERN_ICONS[p.type] || '?'}</span>`
            ).join('');
        }
    }, 1000);

} else {
    document.getElementById('reading-status').textContent = '👁 시선 추적 중';
}

// ── 첫 단어 감지 (읽기 시작 트리거) ──────────────────────
function isNearFirstWord(y) {
    const firstWord = document.querySelector('.word');
    if (!firstWord) return false;
    const r = firstWord.getBoundingClientRect();
    return y >= r.top - 10 && y <= r.bottom + 10;
}

// ── 시선 이벤트 수집 ──────────────────────────────────────
window.addEventListener('gaze:tracking', ({ detail: { x, y } }) => {
    if (!startTime && isNearFirstWord(y)) {
        startTime = Date.now();
    }

    updateCurrentLineHighlight(y);
    const line = getLineIndex(y);

    if (!startTime) return;

    const now = Date.now();
    if (gazeData.length === 0 || now - gazeData[gazeData.length - 1].t >= 100) {
        const curr = { x, line, t: now };
        if (gazeData.length > 0) {
            const type = classifyTransition(gazeData[gazeData.length - 1], curr);
            patternData.push({ type, t: now, line, x });
        }
        gazeData.push(curr);
        if (line >= 0) {
            lastValidLine = line;
            oobSince = null;
        } else {
            if (oobSince === null) oobSince = now;
        }
    }
});

// ── 다 읽었어요 버튼 ──────────────────────────────────────
document.getElementById('done-btn').addEventListener('click', () => {
    const result = analyzeReading();
    const params = new URLSearchParams({
        time:        result.totalSec,
        completion:  result.completionRate  ?? -1,
        focus:       result.focusRate       ?? -1,
        regressions: result.regressionCount ?? -1,
        regrate:     result.regRate         ?? -1,
        wpm:         result.wpm             ?? 0,
        linesdone:   result.visitedLines    ?? 0,
        totallines:  result.totalLines      ?? 0,
        error:       result.error ? '1' : '0',
    });
    window.location.href = `/result.html?${params}`;
});

document.getElementById('recal-btn').addEventListener('click', () => {
    window.location.href = '/calibration.html';
});

// ── 역행 블러 ─────────────────────────────────────────────
// 트리거: regRate > 20% / 해제: regRate < 15% (히스테리시스)
// 효과: 처음(line 0)부터 blurAnchorLine - 3 까지 blur
// blurAnchorLine: 활성 중 앞(아래)으로만 갱신 — 시선이 위로 올라가도 유지
function applyRegressionBlur() {
    const boundary = blurAnchorLine - 3;
    document.querySelectorAll('.word[data-line]').forEach(w => {
        const ln = +w.dataset.line;
        if (ln >= 0 && ln <= boundary) w.classList.add('word-blur');
        else                           w.classList.remove('word-blur');
    });
}

function clearRegressionBlur() {
    document.querySelectorAll('.word-blur').forEach(w => w.classList.remove('word-blur'));
}

const ivBlurCheck = document.getElementById('iv-blur-check');

setInterval(() => {
    if (!startTime || !ivBlurCheck.checked) {
        if (blurActive) { blurActive = false; blurAnchorLine = -1; clearRegressionBlur(); }
        return;
    }
    const regRate = getRealtimeRegRate(10);
    if (!blurActive && regRate > 20) {
        blurActive = true;
        blurAnchorLine = lastValidLine;   // 활성화 시점의 줄로 고정
    } else if (blurActive && regRate < 15) {
        blurActive = false;
        blurAnchorLine = -1;
        clearRegressionBlur();
        return;
    }
    if (blurActive) {
        // 앞으로 읽어 내려갈 때만 블러 경계 갱신 (위로 올라가도 유지)
        if (lastValidLine > blurAnchorLine) blurAnchorLine = lastValidLine;
        applyRegressionBlur();
    }
}, 500);

// ── 세션 전체 분석 ────────────────────────────────────────
function analyzeReading() {
    const totalSec = startTime ? (Date.now() - startTime) / 1000 : 0;
    if (gazeData.length < 10) return { error: true, totalSec };

    const { visitedLines, totalLines, completionRate } = calcCompletion();
    const focusRate = calcFocusRate(totalSec);
    const { regressionCount, regRate } = calcRegressions(totalSec);

    const wordCount = document.querySelector('.reading-text').innerText
        .trim().split(/\s+/).filter(w => w.length > 0).length;
    const wpm = totalSec > 0 ? Math.round(wordCount / (totalSec / 60)) : 0;

    return { totalSec, completionRate, focusRate, regressionCount, regRate, wpm, visitedLines, totalLines, error: false };
}

// ── 완독률 ────────────────────────────────────────────────
// 각 줄을 5개 등구간으로 분할, 4개 이상 통과한 줄을 방문 처리
function calcCompletion() {
    const totalLines = lineList.length;
    if (!totalLines) return { visitedLines: 0, totalLines: 0, completionRate: 0 };

    let visited = 0;
    lineList.forEach((line, idx) => {
        const segW   = (line.xMax - line.xMin) / 5;
        const passed = [0, 1, 2, 3, 4].filter(k => {
            const xs = line.xMin + k * segW;
            const xe = xs + segW;
            return gazeData.some(p => p.line === idx && p.x >= xs && p.x <= xe);
        }).length;
        if (passed >= 4) visited++;
    });

    return {
        visitedLines:   visited,
        totalLines,
        completionRate: Math.round(visited / totalLines * 100),
    };
}

// ── 역행 / 집중도 공통 분석 ──────────────────────────────
// regress 후 forward가 나오면 역행(재독) 1회
// regress 후 forward가 안 나오면 집중 이탈 구간으로 표시
// 반환: { regressionCount, distractedByRegress[] }
function analyzePatterns(patterns) {
    let regressionCount = 0;
    const distractedByRegress = new Array(patterns.length).fill(false);

    let i = 0;
    while (i < patterns.length) {
        if (patterns[i].type !== 'regress') { i++; continue; }

        // regress + still 구간 범위 탐색
        const start = i;
        while (i < patterns.length && (patterns[i].type === 'regress' || patterns[i].type === 'still')) i++;

        if (i < patterns.length && patterns[i].type === 'forward') {
            // 역행 후 재독 확인 → 역행(재독) 1회
            regressionCount++;
        } else {
            // 역행 후 재독 없음 → 집중 이탈
            for (let k = start; k < i; k++) distractedByRegress[k] = true;
        }
    }

    return { regressionCount, distractedByRegress };
}

// ── 집중도 ────────────────────────────────────────────────
// 집중 못한 시간:
//   Case 1) oob 연속 ≥ 100ms
//   Case 2) still 연속 ≥ 1500ms (장기 멍때리기)
//   Case 3) regress 후 forward 없음 (집중 이탈 재독)
function calcFocusRate(totalSec) {
    if (!patternData.length || totalSec <= 0) return 0;

    const distracted = new Array(patternData.length).fill(false);

    // Case 1, 2: oob/still 연속 구간
    function markRun(type, minMs) {
        let runStart = null;
        for (let i = 0; i < patternData.length; i++) {
            if (patternData[i].type === type) {
                if (runStart === null) runStart = i;
            } else {
                if (runStart !== null) {
                    const dur = patternData[i].t - patternData[runStart].t;
                    if (dur >= minMs)
                        for (let k = runStart; k < i; k++) distracted[k] = true;
                    runStart = null;
                }
            }
        }
        if (runStart !== null) {
            const dur = patternData[patternData.length - 1].t - patternData[runStart].t;
            if (dur >= minMs)
                for (let k = runStart; k < patternData.length; k++) distracted[k] = true;
        }
    }
    markRun('oob',   100);
    markRun('still', 1500);

    // Case 3: regress 후 forward 없는 구간
    const { distractedByRegress } = analyzePatterns(patternData);
    distractedByRegress.forEach((v, i) => { if (v) distracted[i] = true; });

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

// ── 역행 분석 ─────────────────────────────────────────────
function countRegressions(patterns) {
    return analyzePatterns(patterns).regressionCount;
}

function calcRegressions(totalSec = 0) {
    const regressionCount = countRegressions(patternData);

    // regRate: 최근 20초 윈도우 — 결과 페이지용 안정적 수치
    const cutoff = Date.now() - 20000;
    const window = patternData.filter(p => p.t >= cutoff);
    const regRate = window.length > 0
        ? Math.round(countRegressions(window) / window.length * 100)
        : 0;

    return { regressionCount, regRate };
}

// 블러 트리거 전용: 최근 N 패턴 기반 역행비율
function getRealtimeRegRate(windowPoints = 10) {
    const recent = patternData.slice(-windowPoints);
    return recent.length > 0
        ? Math.round(countRegressions(recent) / recent.length * 100)
        : 0;
}

// ── 집중 이탈 판정 (실시간) ──────────────────────────────
// 최근 2초 기준:
//   1) 전부 oob/still → 멍때리기
//   2) regress가 있는데 forward가 없음 → 재독 없는 역행
function isLostFocus() {
    if (!startTime || patternData.length < 3) return false;
    const cutoff = Date.now() - 2000;
    const recent = patternData.filter(p => p.t >= cutoff);
    if (recent.length < 3) return false;

    const allPassive = recent.every(p => p.type === 'oob' || p.type === 'still');
    const hasRegress = recent.some(p => p.type === 'regress');
    const hasForward = recent.some(p => p.type === 'forward');

    return allPassive || (hasRegress && !hasForward);
}

// 오버레이 페이드 인/아웃 헬퍼
function showOverlay(el) {
    el.style.display = 'block';
    requestAnimationFrame(() => { el.style.opacity = '1'; });
}
function hideOverlay(el) {
    el.style.opacity = '0';
    setTimeout(() => { if (el.style.opacity === '0') el.style.display = 'none'; }, 450);
}

// Y가 줄 top~bottom 안에 정확히 있을 때만 인덱스 반환 (하이라이트 전용)
function getLineIndexStrict(y) {
    if (!lineList.length) return -1;
    const docY = y + window.scrollY;
    for (let i = 0; i < lineList.length; i++) {
        if (docY >= lineList[i].top && docY <= lineList[i].bottom) return i;
    }
    return -1;
}

// 현재 읽는 줄 가벼운 하이라이트
function updateCurrentLineHighlight(y) {
    const bar = document.getElementById('current-line-highlight');
    const lineIdx = getLineIndexStrict(y);
    if (lineIdx < 0) { bar.style.display = 'none'; return; }
    const areaTop = document.querySelector('.reading-area').getBoundingClientRect().top + window.scrollY;
    const ln = lineList[lineIdx];
    bar.style.top    = (ln.top - areaTop) + 'px';
    bar.style.height = (ln.bottom - ln.top + 4) + 'px';
    bar.style.display = 'block';
}

// lineIdx 줄에 하이라이트 바 위치 지정
function updateHighlightBar(lineIdx) {
    const bar = document.getElementById('line-highlight-bar');
    if (lineIdx < 0 || lineIdx >= lineList.length) { hideOverlay(bar); return; }
    const areaTop = document.querySelector('.reading-area').getBoundingClientRect().top + window.scrollY;
    const ln = lineList[lineIdx];
    bar.style.top    = (ln.top - areaTop) + 'px';
    bar.style.height = (ln.bottom - ln.top + 4) + 'px';
    showOverlay(bar);
}

// lineIdx 줄에 박스 오버레이 위치 지정
function updateLineBox(lineIdx) {
    const box = document.getElementById('line-box');
    if (lineIdx < 0 || lineIdx >= lineList.length) { hideOverlay(box); return; }
    const areaTop = document.querySelector('.reading-area').getBoundingClientRect().top + window.scrollY;
    const ln = lineList[lineIdx];
    box.style.top    = (ln.top - areaTop - 2) + 'px';
    box.style.height = (ln.bottom - ln.top + 4) + 'px';
    showOverlay(box);
}

// ── 하이라이트 개입 ───────────────────────────────────────
// 트리거: 멍때리기 2초+ 또는 시선 이탈 2초+ / 시선 복귀 시 페이드 아웃
const ivHighlightCheck = document.getElementById('iv-highlight-check');
setInterval(() => {
    const bar = document.getElementById('line-highlight-bar');
    if (!startTime || !ivHighlightCheck.checked) { hideOverlay(bar); return; }
    if (isLostFocus()) updateHighlightBar(lastValidLine);
    else               hideOverlay(bar);
}, 500);

// ── 줄 박스 개입 ─────────────────────────────────────────
// 트리거: 멍때리기 2초+ 또는 시선 이탈 2초+ / 시선 복귀 시 페이드 아웃
const ivBoxCheck = document.getElementById('iv-box-check');
setInterval(() => {
    const box = document.getElementById('line-box');
    if (!startTime || !ivBoxCheck.checked) { hideOverlay(box); return; }
    if (isLostFocus()) updateLineBox(lastValidLine);
    else               hideOverlay(box);
}, 500);
