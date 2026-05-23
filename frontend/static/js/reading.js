// ── 책 로드 ──────────────────────────────────────────────
let lineList    = []; // [{top, bottom, xMin, xMax}] — document y, viewport x
let readingAreaRect = null; // reading-area 경계 캐시 (좌우 이탈 판정용)

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
    readingAreaRect = document.querySelector('.reading-area')?.getBoundingClientRect() ?? null;

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
// 연속 두 포인트 간 이동 방향만 판단
// right : x 오른쪽 이동 (줄너비 2% 이상)
// left  : x 왼쪽 이동 (줄너비 2% 이상)
// down  : 줄 인덱스 증가 (아래로 이동)
// up    : 줄 인덱스 감소 (위로 이동)
// still : 거의 안 움직임
// oob   : 텍스트 범위 이탈 (줄 인덱스 < 0)
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
const gazeData        = [];
const patternData     = []; // [{type, t, line, x}] — gazeData 전환별 패턴
const rereadingEvents = []; // 재독 확정 타임스탬프 배열

const REREAD_WINDOW_MS  = 30_000; // 슬라이딩 윈도우 30초
const REREAD_BLUR_ON    = 3;      // 발동 임계값: 30초 안에 3회 (한번 발동 시 자동 해제 없음)
const ADVANCE_DWELL     = 2;      // 전진 확정 샘플 수 (200ms)
const REGRESS_DWELL     = 4;      // 역행 확정 샘플 수 (400ms) — 떨림/깜박임 노이즈 방어
let   startTime         = null;
let   lastValidLine          = -1;   // line >= 0 인 최신 줄 인덱스
let   lastValidLineTime      = 0;    // lastValidLine 갱신 시각 (깜박임 필터용)
let   blurActive        = false;
let   blurLine          = -1;   // 블러 경계 줄 — 재독 ≥3일 때만 전진, 미만이면 동결
let   oobSince          = null;

// ── 줄 기반 역행 추적 ─────────────────────────────────────
let   currentReadingLine  = -1; // 현재 독서 헤드 — 재독 시 뒤로 이동 가능
let   maxReadingLine      = -1; // 지금까지 도달한 최고 줄 — 절대 감소하지 않음 (블러 경계)
let   lineDwellLine         = -1; // 줄 확정 버퍼
let   lineDwellCount        = 0;  // 연속 샘플 수
let   lineDwellMinX         = 0;  // 이 줄 방문 중 가장 왼쪽 x (귀환 시선 반영용)
let   lineDwellHasRight        = false; // 이 줄 방문 중 right 패턴 발생 여부
let   baselineLastChangedTime  = 0;     // currentReadingLine 마지막 변경 시각
let   skimAlertActive          = false; // 줄박스 경고 활성 — 완독 전진 시에만 해제
const lineSegmentsVisited = new Map(); // lineIndex → Set<segIndex>

const gazeDot = document.getElementById('gaze-dot');

// ── 개발자 모드 설정 ──────────────────────────────────────
if (DEV_MODE) {
    document.getElementById('dev-mode-badge').style.display = 'block';
    document.getElementById('recal-btn').style.display      = 'none';
    document.body.style.cursor = 'none';
    document.getElementById('reading-status').textContent   = '🖱 개발자 모드 (마우스 = 시선)';

    gazeDot.style.display = 'block';

    let lastMouseX = 0, lastMouseY = 0;

    document.addEventListener('mousemove', e => {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        gazeDot.style.left = e.clientX + 'px';
        gazeDot.style.top  = e.clientY + 'px';
    });

    // 실제 WebSocket처럼 30fps로 마지막 위치를 계속 스트리밍
    setInterval(() => {
        window.dispatchEvent(new CustomEvent('gaze:tracking', {
            detail: { x: lastMouseX, y: lastMouseY }
        }));
    }, 33);

    // ── 분석 항목 모니터 패널 ─────────────────────────────
    const devFeatures = [
        { key: 'totalSec',   label: '① 독서시간' },
        { key: 'completion', label: '② 완독률'   },
        { key: 'focus',      label: '③ 집중도'   },
        { key: 'regression',     label: '④ 재독비율'  },
        { key: 'regressionRate', label: '⑤ 역행비율'  },
        { key: 'wpm',            label: '⑥ WPM'       },
        { key: 'behavior',       label: '⑦ 독서상태'  },
        { key: 'baseLine',       label: '⑧ 기준 줄'   },
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
                return `${calcRegressions(elapsed).regRate}회/30초`;
            }
            case 'regressionRate': {
                return `${calcRegressionRate()}%`;
            }
            case 'wpm': {
                const wc = document.querySelector('.reading-text').innerText
                    .trim().split(/\s+/).filter(w => w.length > 0).length;
                return `${elapsed > 0 ? Math.round(wc / (elapsed / 60)) : 0}`;
            }
            case 'baseLine': {
                if (currentReadingLine < 0) return '--';
                const maxSeg = lineSegmentsVisited.get(currentReadingLine) ?? -1;
                const maxStr = maxReadingLine >= 0 ? `↑${maxReadingLine + 1}` : '';
                return `${currentReadingLine + 1}줄 (${maxSeg + 1}/5) ${maxStr}`;
            }
            case 'behavior': {
                const behaviorMap = {
                    reading:    '📖 정상독서',
                    wrap:       '↩ 줄바꿈',
                    rereading:  '🔄 재독',
                    distracted: '😶 집중이탈',
                    oob:        '⊗ 이탈',
                    idle:       '대기중',
                };
                return behaviorMap[getReadingBehavior()] || '--';
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
            <span class="dev-feature-label">📖 재독</span>
            <span class="dev-feature-val" style="color:#6b7280">없음</span>
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

    const PATTERN_COLORS = { right: '#4ade80', down: '#60a5fa', left: '#f87171', up: '#f97316', still: '#facc15', oob: '#9ca3af' };
    const PATTERN_ICONS  = { right: '▶', down: '↓', left: '◀', up: '↑', still: '⏸', oob: '⊗' };

    setInterval(() => {
        panel.querySelectorAll('.dev-feature-row').forEach((row, i) => {
            if (i < devFeatures.length) {
                const valEl = row.querySelector('.dev-feature-val');
                valEl.textContent = getFeatureValue(devFeatures[i].key);
                // ⑥ 독서상태 행: 행동에 맞는 색상
                if (devFeatures[i].key === 'behavior') {
                    const behaviorColors = {
                        reading:    '#4ade80',
                        wrap:       '#60a5fa',
                        rereading:  '#f97316',
                        distracted: '#f87171',
                        oob:        '#9ca3af',
                        idle:       '#6b7280',
                    };
                    valEl.style.color = behaviorColors[getReadingBehavior()] || '#9ca3af';
                }
            }
        });

        // 재독 상태: 30초 윈도우 재독 횟수 표시
        const regEl  = document.getElementById('dev-status-regression').querySelector('.dev-feature-val');
        const rereadCount = startTime ? rereadingsInWindow() : 0;
        regEl.textContent = rereadCount > 0 ? `${rereadCount}회 / 30초` : '없음';
        regEl.style.color = rereadCount >= REREAD_BLUR_ON ? '#f87171'
                          : rereadCount > 0              ? '#f97316'
                          :                                '#6b7280';

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
// 독서 시작 감지 — 1~2번째 줄 + 첫 번째 세그먼트(줄 너비 1/5 이내)
function isReadingStart(x, y) {
    if (!lineList.length) return false;
    const line = getLineIndex(y);
    if (line !== 0) return false;
    const l = lineList[line];
    if (!l) return false;
    return x >= l.xMin && x <= l.xMin + (l.xMax - l.xMin) / 5;
}

// ── 시선 이벤트 수집 ──────────────────────────────────────
window.addEventListener('gaze:tracking', ({ detail: { x, y } }) => {
    if (!startTime && isReadingStart(x, y)) {
        startTime = Date.now();
        gazeData.length        = 0;
        patternData.length     = 0;
        rereadingEvents.length = 0;
        lineSegmentsVisited.clear();
        currentReadingLine  = -1;
        maxReadingLine      = -1;
        lineDwellLine       = -1;
        lineDwellCount      = 0;
        lineDwellMinX           = 0;
        lineDwellHasRight       = false;
        baselineLastChangedTime = Date.now();
        skimAlertActive         = false;
        lastValidLine          = -1;
        lastValidLineTime      = 0;
        oobSince            = null;
        return; // 독서 시작 이벤트는 수집 건너뜀 — 다음 이벤트부터 수집
    }

    updateCurrentLineHighlight(y);

    const now     = Date.now();
    const rawLine = getLineIndex(y);

    // 눈깜박임 필터: 300ms 이내 oob → 마지막 유효 줄 유지
    const rawFiltered = rawLine >= 0 ? rawLine
                      : (lastValidLine >= 0 && now - lastValidLineTime < 300) ? lastValidLine
                      : -1;

    // 블러 활성 상태에서 블러 구간(기준 줄 위)으로 시선 → 이탈로 간주
    // 실제로 블러된 줄(blurLine 위)만 이탈로 처리 — blurLine과 OOB 범위 일치
    const blurOob = blurActive && rawFiltered >= 0 && blurLine >= 0 && rawFiltered < blurLine;

    // reading-area 밖(상하좌우)은 이탈로 간주
    const xOob = readingAreaRect ? (x < readingAreaRect.left || x > readingAreaRect.right) : false;

    const line = (blurOob || xOob) ? -1 : rawFiltered;

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

// ── 다 읽었어요 버튼 ──────────────────────────────────────
document.getElementById('done-btn').addEventListener('click', () => {
    const result = analyzeReading();
    const params = new URLSearchParams({
        time:        result.totalSec,
        completion:  result.completionRate  ?? -1,
        focus:       result.focusRate       ?? -1,
        regressions:  result.regressionCount  ?? -1,
        regrate:      result.regRate          ?? -1,
        regratepct:   result.regressionRate   ?? -1,
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
// 트리거: 30초 안에 재독 3회 이상 (Varao-Sousa et al., 2017 근거)
// 전진: 재독 ≥ 3 유지 중에만 blurLine = currentReadingLine 따라 전진
// 동결: 재독이 3 미만으로 떨어지면 blurLine 그 자리에서 멈춤 (끄지 않음)
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

const ivBlurCheck = document.getElementById('iv-blur-check');

setInterval(() => {
    if (!startTime || !ivBlurCheck.checked) {
        if (blurActive) { blurActive = false; blurLine = -1; clearRegressionBlur(); }
        return;
    }
    const rereadCount = rereadingsInWindow();
    if (!blurActive && rereadCount >= REREAD_BLUR_ON) {
        blurActive = true;
    }
    if (blurActive) {
        // 재독 ≥ 3: blurLine 전진 / 재독 < 3: blurLine 동결
        if (rereadCount >= REREAD_BLUR_ON) {
            blurLine = currentReadingLine;
        }
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
    const regressionRate = calcRegressionRate();

    const wordCount = document.querySelector('.reading-text').innerText
        .trim().split(/\s+/).filter(w => w.length > 0).length;
    const wpm = totalSec > 0 ? Math.round(wordCount / (totalSec / 60)) : 0;

    return { totalSec, completionRate, focusRate, regressionCount, regRate, regressionRate, wpm, visitedLines, totalLines, error: false };
}

// ── 완독률 ────────────────────────────────────────────────
// lineSegmentsVisited 공유 — 4/5 세그먼트 이상 방문한 줄을 완독으로 처리
function calcCompletion() {
    const totalLines = lineList.length;
    if (!totalLines) return { visitedLines: 0, totalLines: 0, completionRate: 0 };

    let visited = 0;
    for (let i = 0; i < totalLines; i++) {
        if ((lineSegmentsVisited.get(i) ?? -1) >= 3) visited++;
    }
    return { visitedLines: visited, totalLines, completionRate: Math.round(visited / totalLines * 100) };
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

// ── 역행 비율 (연구 정의) ─────────────────────────────────
// patternData 중 up + left 비율 — 연구의 regression saccade 비율과 같은 개념
// 정상 범위: 15~25% (Rayner 1978, Taylor 1965)
function calcRegressionRate() {
    const saccades = patternData.filter(p => p.type === 'right' || p.type === 'left' || p.type === 'up' || p.type === 'down');
    if (!saccades.length) return 0;
    const regCount = saccades.filter(p => p.type === 'up' || p.type === 'left').length;
    return Math.round(regCount / saccades.length * 100);
}

// ── 재독 분석 (본 시스템 정의) ────────────────────────────
function calcRegressions(totalSec = 0) {
    const regressionCount = rereadingEvents.length;
    // regRate: 30초당 재독 횟수 (연구 기준 단위 — Varao-Sousa et al., 2017)
    const regRate = totalSec > 0
        ? Math.round(regressionCount / (totalSec / 30) * 10) / 10
        : 0;
    return { regressionCount, regRate };
}

// ── 줄 기반 역행 감지 ────────────────────────────────────
// 재독 판정: currentReadingLine이 줄어들 때마다 이벤트 등록
//   (200ms 머물면서 right 패턴 → 실제로 읽고 있는 것이 확인된 시점)
function updateLineTracking(x, line, type = 'still') {
    if (line < 0) { lineDwellCount = 0; return; }

    // 기준 줄 초기화
    if (currentReadingLine < 0) {
        currentReadingLine = line;
        if (line > maxReadingLine) maxReadingLine = line;
    }

    // 세그먼트 방문 기록 — 현재 기준 줄만, 오른쪽으로만 증가
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

    // 줄 확정 (dwell 카운트)
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
            // 새 구간 전진 — 4/5 완독 + 왼쪽 절반 착지 확인
            const maxSeg = lineSegmentsVisited.get(currentReadingLine) ?? -1;
            if (maxSeg >= 3) {
                const nextL      = lineList[line];
                const lineWidth  = nextL ? nextL.xMax - nextL.xMin : 0;
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

// 슬라이딩 윈도우 안의 재독 횟수
function rereadingsInWindow(windowMs = REREAD_WINDOW_MS) {
    const cutoff = Date.now() - windowMs;
    return rereadingEvents.filter(t => t >= cutoff).length;
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

    return recent.every(p => p.type === 'oob' || p.type === 'still');
}

// ── 현재 독서 행동 판단 ──────────────────────────────────
// 최근 패턴 + 재독 이벤트로 현재 독서 행동을 해석
function getReadingBehavior() {
    if (!startTime || patternData.length === 0) return 'idle';
    const w     = patternData.slice(-10);
    const types = w.map(p => p.type);

    if (types.slice(-3).every(t => t === 'oob'))                  return 'oob';
    if (types.slice(-5).every(t => t === 'still' || t === 'oob')) return 'distracted';

    // 재독: 최근 2초 안에 줄 기반 역행 이벤트 발생
    if (rereadingEvents.some(t => t >= Date.now() - 2000))         return 'rereading';

    if (types.slice(-3).includes('down')) return 'wrap';
    if (types.includes('right'))          return 'reading';
    return 'idle';
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

// ── 라인 콜아웃 말풍선 ───────────────────────────────────
const _calloutFocus = document.getElementById('callout-focus');
const _calloutSkim  = document.getElementById('callout-skim');

function _positionCallout(el, lineIdx, side) {
    if (lineIdx < 0 || lineIdx >= lineList.length) return;
    const ln      = lineList[lineIdx];
    const centerY = (ln.top + ln.bottom) / 2 - window.scrollY;
    if (side === 'left') {
        el.style.left  = '';
        el.style.right = (window.innerWidth - (readingAreaRect?.left ?? 0) + 6) + 'px';
    } else {
        el.style.right = '';
        el.style.left  = ((readingAreaRect?.right ?? window.innerWidth * 0.75) + 6) + 'px';
    }
    el.style.top = (centerY - el.offsetHeight / 2) + 'px';
}

function showFocusCallout(lineIdx) {
    if (lineIdx < 0 || lineIdx >= lineList.length) { hideFocusCallout(); return; }
    _calloutFocus.querySelector('.callout-box').textContent = '👁 집중하세요';
    _calloutFocus.classList.add('show');
    _positionCallout(_calloutFocus, lineIdx, 'left');
}
function hideFocusCallout() { _calloutFocus.classList.remove('show'); }

function showSkimCallout(lineIdx) {
    if (lineIdx < 0 || lineIdx >= lineList.length) { hideSkimCallout(); return; }
    _calloutSkim.querySelector('.callout-box').textContent = '↩ 이곳부터 다시 읽으세요';
    _calloutSkim.classList.add('show');
    _positionCallout(_calloutSkim, lineIdx, 'right');
}
function hideSkimCallout() { _calloutSkim.classList.remove('show'); }

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
// 트리거: 집중 이탈 2초+ → 읽던 줄에 하이라이트 + 오른쪽 콜아웃 "집중하세요"
const ivHighlightCheck = document.getElementById('iv-highlight-check');
setInterval(() => {
    const bar = document.getElementById('line-highlight-bar');
    if (!startTime || !ivHighlightCheck.checked) { hideOverlay(bar); hideCallout(); return; }
    if (isLostFocus()) {
        updateHighlightBar(currentReadingLine);
        showFocusCallout(currentReadingLine);
    } else {
        hideOverlay(bar);
        hideFocusCallout();
    }
}, 500);

// ── 줄 박스 개입 ─────────────────────────────────────────
// 트리거: 기준 줄이 5초 이상 고정 + 시선이 기준 줄 위에서 정상독서 중
//         → 현재 기준 줄 끝까지 안 읽고 넘어간 것 → 오른쪽 콜아웃 "이곳부터 다시 읽으세요"
// 소거: 기준 줄이 정상 완독 규칙으로 전진하면 사라짐
const SKIM_ALERT_MS = 5000;
const ivBoxCheck = document.getElementById('iv-box-check');
setInterval(() => {
    const box = document.getElementById('line-box');
    if (!startTime || !ivBoxCheck.checked) { hideOverlay(box); skimAlertActive = false; hideSkimCallout(); return; }
    const skimDetected =
        currentReadingLine >= 0 &&
        lastValidLine > currentReadingLine &&
        getReadingBehavior() === 'reading' &&
        Date.now() - baselineLastChangedTime > SKIM_ALERT_MS;
    if (skimDetected) skimAlertActive = true;
    if (skimAlertActive) {
        updateLineBox(currentReadingLine);
        showSkimCallout(currentReadingLine);
    } else {
        hideOverlay(box);
        hideSkimCallout();
    }
}, 500);
