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

    // 단어별 줄 인덱스 태깅 (data-line 속성)
    const topToIdx = new Map(lineList.map((l, i) => [l.top, i]));
    document.querySelectorAll('.word').forEach(w => {
        const top = Math.round(w.getBoundingClientRect().top + window.scrollY);
        w.dataset.line = topToIdx.get(top) ?? -1;
    });
}

// 뷰포트 y → 줄 인덱스 (전체 텍스트 범위 벗어나면 -1)
function getLineIndex(y) {
    if (!lineList.length) return -1;
    const docY = y + window.scrollY;
    if (docY < lineList[0].top - 20 || docY > lineList[lineList.length - 1].bottom + 20) return -1;
    let closest = 0, minDist = Infinity;
    lineList.forEach((l, i) => {
        const d = Math.abs(docY - l.top);
        if (d < minDist) { minDist = d; closest = i; }
    });
    return closest;
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
const gazeData = [];
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
        { key: 'totalSec',   label: '① 독서시간', enabled: true  },
        { key: 'completion', label: '② 완독률',   enabled: false },
        { key: 'focus',      label: '③ 집중도',   enabled: false },
        { key: 'regression', label: '④ 역행비율', enabled: false },
        { key: 'wpm',        label: '⑤ WPM',      enabled: false },
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
                <button class="dev-toggle ${f.enabled ? 'on' : 'off'}">${f.enabled ? 'ON' : 'OFF'}</button>
                <span class="dev-feature-val" style="color:${f.enabled ? '#4ade80' : '#6b7280'}">--</span>
            </div>`
        ).join('');
    document.body.appendChild(panel);

    panel.querySelectorAll('.dev-toggle').forEach((btn, i) => {
        btn.addEventListener('click', () => {
            devFeatures[i].enabled = !devFeatures[i].enabled;
            btn.textContent = devFeatures[i].enabled ? 'ON' : 'OFF';
            btn.className   = 'dev-toggle ' + (devFeatures[i].enabled ? 'on' : 'off');
            if (!devFeatures[i].enabled) {
                const valEl = btn.closest('.dev-feature-row').querySelector('.dev-feature-val');
                valEl.textContent = '--';
                valEl.style.color = '#6b7280';
            }
        });
    });

    setInterval(() => {
        panel.querySelectorAll('.dev-feature-row').forEach((row, i) => {
            const valEl = row.querySelector('.dev-feature-val');
            if (devFeatures[i].enabled) {
                valEl.textContent = getFeatureValue(devFeatures[i].key);
                valEl.style.color = '#4ade80';
            } else {
                valEl.textContent = '--';
                valEl.style.color = '#6b7280';
            }
        });
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
    if (!startTime) return;

    const now = Date.now();
    if (gazeData.length === 0 || now - gazeData[gazeData.length - 1].t >= 100) {
        const line = getLineIndex(y);
        gazeData.push({ x, line, t: now });
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

// ── 집중도 ────────────────────────────────────────────────
// 집중(%) = (총 독서 시간 - 집중 못한 시간) / 총 독서 시간 × 100
// 집중 못한 시간:
//   Case 1) 시선 정체 ≥ 1500ms — x가 기준점에서 줄 너비 8%(최소 30px) 이상
//           이동하지 않으면 멍때리기로 간주 (정상 독서는 매 초 수십 px 이상 전진)
//   Case 2) 텍스트 범위 이탈 연속 ≥ 100ms
//           - line < 0 (y 범위 이탈)
//           - x < xMin-20 or x > xMax+20 (x 범위 이탈)
function calcFocusRate(totalSec) {
    if (!gazeData.length || totalSec <= 0) return 0;

    let unfocusedMs = 0;

    // Case 1: 시선 정체 ≥ 1500ms
    let frozenStart = 0;
    let frozenRefX  = gazeData[0].x;
    for (let i = 1; i < gazeData.length; i++) {
        const p = gazeData[i];
        const l = p.line >= 0 ? lineList[p.line] : null;
        const threshold = l ? Math.max(30, (l.xMax - l.xMin) * 0.08) : 30;
        if (Math.abs(p.x - frozenRefX) > threshold) {
            const dur = gazeData[i].t - gazeData[frozenStart].t;
            if (getSegIdx(gazeData[frozenStart]) >= 0 && dur >= 1500) unfocusedMs += dur;
            frozenStart = i;
            frozenRefX  = p.x;
        }
    }
    {
        const dur = gazeData[gazeData.length - 1].t - gazeData[frozenStart].t;
        if (getSegIdx(gazeData[frozenStart]) >= 0 && dur >= 1500) unfocusedMs += dur;
    }

    // Case 2: 텍스트 범위 이탈 연속 ≥ 100ms
    function isOOB(i) {
        const p = gazeData[i];
        if (p.line < 0) return true;
        const l = lineList[p.line];
        return p.x < l.xMin - 20 || p.x > l.xMax + 20;
    }

    let oobStart = null;
    for (let i = 0; i < gazeData.length; i++) {
        if (isOOB(i)) {
            if (oobStart === null) oobStart = i;
        } else if (oobStart !== null) {
            const dur = gazeData[i].t - gazeData[oobStart].t;
            if (dur >= 100) unfocusedMs += dur;
            oobStart = null;
        }
    }
    if (oobStart !== null) {
        const dur = gazeData[gazeData.length - 1].t - gazeData[oobStart].t;
        if (dur >= 100) unfocusedMs += dur;
    }

    // 분모를 벽시계(elapsed)가 아닌 gazeData 실측 범위로 사용
    // — 마우스 정지 시 elapsed만 증가해 집중도가 올라가는 허점 차단
    const gazeSpanMs = gazeData[gazeData.length - 1].t - gazeData[0].t;
    if (gazeSpanMs <= 0) return 100;
    return Math.round(Math.max(0, (gazeSpanMs - unfocusedMs) / gazeSpanMs * 100));
}

// ── 역행 비율 ─────────────────────────────────────────────
// 역행: 위 줄로 이동(line 감소) 또는 같은 줄 내 좌측 이동 ≥ 15% 줄 너비
// regRate(%) = 역행 횟수 / 전이 수 × 100  (Rayner 1998: 정상 독자 10-15%)
// regRate는 최근 10포인트 슬라이딩 윈도우 기준 (실시간 민감도)
// regressionCount는 전체 세션 누적 (결과 페이지용)
function countRegressions(data) {
    let count = 0;
    for (let i = 1; i < data.length; i++) {
        const curr  = data[i];
        const prev  = data[i - 1];
        const dLine = curr.line - prev.line;
        const dx    = curr.x - prev.x;
        if (dLine < 0) {
            count++;
        } else if (dLine === 0 && curr.line >= 0) {
            const l = lineList[curr.line];
            const lineWidth = l.xMax - l.xMin;
            if (lineWidth > 0 && -dx > lineWidth * 0.15) {
                const isReturnSweep = data.slice(i + 1, i + 4).some(pt => pt.line > curr.line);
                if (!isReturnSweep) count++;
            }
        }
    }
    return count;
}

function calcRegressions(totalSec = 0) {
    const regressionCount = countRegressions(gazeData);

    // regRate: 최근 20초 시간 기반 윈도우 — 디스플레이·결과 페이지용 (안정적 수치)
    const cutoff     = Date.now() - 20000;
    const windowData = gazeData.filter(p => p.t >= cutoff);
    const windowTrans = windowData.length - 1;
    const regRate    = windowTrans > 0
        ? Math.round(countRegressions(windowData) / windowTrans * 100)
        : 0;

    return { regressionCount, regRate };
}

// 블러 트리거 전용: 최근 N 포인트 기반 역행비율
// 10포인트 = ~1초, 2회 역행 → 20% → 블러 활성 임계치 정확히 도달
function getRealtimeRegRate(windowPoints = 10) {
    const data = gazeData.slice(-windowPoints);
    const transitions = data.length - 1;
    return transitions > 0 ? Math.round(countRegressions(data) / transitions * 100) : 0;
}

// ── 하이라이트 · 줄 박스 헬퍼 ────────────────────────────
// 최근 windowMs 동안 시선이 줄 너비 8%(최소 30px) 이상 이동 안 하면 true
function isRecentlyFrozen(windowMs = 2000) {
    if (gazeData.length < 3) return false;
    const cutoff = Date.now() - windowMs;
    const recent = gazeData.filter(p => p.t >= cutoff && p.line >= 0);
    if (recent.length < 3) return false;
    const xSpan = Math.max(...recent.map(p => p.x)) - Math.min(...recent.map(p => p.x));
    const l = lineList[recent[0].line];
    const threshold = l ? Math.max(30, (l.xMax - l.xMin) * 0.08) : 30;
    return xSpan < threshold;
}

// 집중 이탈 판정 — 멍때리기 2초+ 또는 시선 텍스트 이탈 2초+
function isLostFocus() {
    const frozen    = isRecentlyFrozen(2000);
    const dispersed = oobSince !== null && (Date.now() - oobSince) >= 2000;
    return frozen || dispersed;
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
