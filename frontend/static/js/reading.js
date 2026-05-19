// ── 책 로드 ──────────────────────────────────────────────
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
})();

// ── gaze.js 조건부 로드 ───────────────────────────────────
if (!new URLSearchParams(location.search).has('dev')) {
    import('/static/js/gaze.js');
}

// ── 상태 변수 ────────────────────────────────────────────
const DEV_MODE  = new URLSearchParams(location.search).has('dev');
const gazeData  = [];
const startTime = Date.now();
let   maxReadY  = 0;

let realtimeRegressions = 0;
let regressionCooldown  = false;
let baselineVelocity    = null;
let fatigueToastCount   = 0;

const gazeDot = document.getElementById('gaze-dot');

// ── 개발자 모드 설정 ──────────────────────────────────────
if (DEV_MODE) {
    document.getElementById('dev-mode-badge').style.display = 'block';
    document.getElementById('recal-btn').style.display      = 'none';
    document.body.style.cursor = 'none';
    document.getElementById('reading-status').textContent   = '🖱 개발자 모드 (마우스 = 시선)';

    document.addEventListener('mousemove', (e) => {
        gazeDot.style.display = 'block';
        gazeDot.style.left    = e.clientX + 'px';
        gazeDot.style.top     = e.clientY + 'px';
        window.dispatchEvent(new CustomEvent('gaze:tracking', {
            detail: { x: e.clientX, y: e.clientY }
        }));
    });
} else {
    document.getElementById('reading-status').textContent = '👁 시선 추적 중';
}

// ── 시선 이벤트 수집 ──────────────────────────────────────
window.addEventListener('gaze:tracking', ({ detail: { x, y } }) => {
    const now = Date.now();
    if (gazeData.length === 0 || now - gazeData[gazeData.length - 1].t >= 100) {
        gazeData.push({ x, y, t: now });
    }
    updateReadingFeedback(x, y);
    detectRegression(x, y);
});

// ── 줄 하이라이트 & 역행 블러 ─────────────────────────────
function updateReadingFeedback(x, y) {
    const words = Array.from(document.querySelectorAll('.word'));
    if (!words.length) return;

    if (y > maxReadY) maxReadY = y;

    let bestWord = null, bestDist = Infinity;
    words.forEach(w => {
        const r   = w.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const d   = Math.abs(y - mid);
        if (d < bestDist) { bestDist = d; bestWord = w; }
    });

    const bar = document.getElementById('line-highlight-bar');
    if (bestWord && bestDist < 60) {
        const wr = bestWord.getBoundingClientRect();
        const ar = document.querySelector('.reading-area').getBoundingClientRect();
        bar.style.display = 'block';
        bar.style.top     = (wr.top - ar.top) + 'px';
        bar.style.height  = wr.height + 'px';

        const isRegressing = y < maxReadY - 120;
        words.forEach(w => {
            const r = w.getBoundingClientRect();
            if (isRegressing && r.bottom < y - 10) {
                w.classList.add('word-blur');
            } else {
                w.classList.remove('word-blur');
            }
        });
    } else {
        bar.style.display = 'none';
    }
}

// ── 다 읽었어요 버튼 ──────────────────────────────────────
document.getElementById('done-btn').addEventListener('click', () => {
    document.getElementById('line-highlight-bar').style.display = 'none';
    document.querySelectorAll('.word').forEach(w => w.classList.remove('word-blur'));
    const result = analyzeReading();

    const wordCount = document.querySelector('.reading-text').innerText
        .trim().split(/\s+/).filter(w => w.length > 0).length;
    const wpm = result.totalSec > 0
        ? Math.round(wordCount / (result.totalSec / 60)) : 0;

    const regPerMin = result.totalSec > 0
        ? +(realtimeRegressions / (result.totalSec / 60)).toFixed(2) : 0;

    const lineMap = {};
    document.querySelectorAll('.word').forEach(w => {
        const r   = w.getBoundingClientRect();
        const key = Math.round(r.top);
        if (!lineMap[key]) lineMap[key] = { top: r.top, bottom: r.bottom };
        else lineMap[key].bottom = Math.max(lineMap[key].bottom, r.bottom);
    });
    const visualLines  = Object.values(lineMap);
    const totalLines   = visualLines.length;
    const visitedLines = visualLines.filter(line =>
        gazeData.some(p => p.y >= line.top - 10 && p.y <= line.bottom + 10)
    ).length;

    const endVel  = calcRecentVelocity(30000) ?? 0;
    const baseVel = baselineVelocity ?? 0;

    const params = new URLSearchParams({
        time:        result.totalSec,
        focus:       result.focusRate   ?? -1,
        regressions: result.regressions ?? -1,
        error:       result.error ? '1' : '0',
        wpm,
        regpermin:   regPerMin,
        linesdone:   visitedLines,
        totallines:  totalLines,
        endvel:      endVel.toFixed(4),
        basevel:     baseVel.toFixed(4),
    });
    window.location.href = `/result.html?${params}`;
});

document.getElementById('recal-btn').addEventListener('click', () => {
    window.location.href = '/calibration.html';
});

// ── 세션 전체 분석 ────────────────────────────────────────
function analyzeReading() {
    const totalSec = Math.round((Date.now() - startTime) / 1000);
    if (gazeData.length < 10) return { error: true, totalSec };

    const rect   = document.querySelector('.reading-text').getBoundingClientRect();
    const inArea = gazeData.filter(p =>
        p.x >= rect.left - 20 && p.x <= rect.right  + 20 &&
        p.y >= rect.top  - 20 && p.y <= rect.bottom + 20
    ).length;
    const focusRate = Math.round(inArea / gazeData.length * 100);

    let regressions = 0;
    for (let i = 1; i < gazeData.length; i++) {
        const dx = gazeData[i].x - gazeData[i - 1].x;
        const dy = Math.abs(gazeData[i].y - gazeData[i - 1].y);
        if (dx < -200 && dy < 120) regressions++;
    }
    return { totalSec, focusRate, regressions, error: false };
}

// ── 실시간 역행 감지 ──────────────────────────────────────
function detectRegression(x, y) {
    if (gazeData.length < 5) return;

    const recent = gazeData.slice(-5);
    const avgX = recent.reduce((sum, p) => sum + p.x, 0) / recent.length;
    const avgY = recent.reduce((sum, p) => sum + p.y, 0) / recent.length;
    const dy   = Math.abs(y - avgY);

    const statusEl = document.getElementById('reading-status');

    if (x < avgX - 150 && dy < 40) {
        if (!regressionCooldown) {
            realtimeRegressions++;
            regressionCooldown = true;

            statusEl.textContent = '↩ 역행 감지! 앞으로 읽어보세요';
            statusEl.style.color = '#e74c3c';

            setTimeout(() => {
                statusEl.textContent = `👁 시선 추적 중 | 역행 ${realtimeRegressions}회`;
                statusEl.style.color = '#666';
            }, 800);

            setTimeout(() => { regressionCooldown = false; }, 1000);
        }
    } else if (!regressionCooldown) {
        statusEl.textContent = `👁 시선 추적 중 | 역행 ${realtimeRegressions}회`;
        statusEl.style.color = '#666';
    }
}

// ── 피로 감지 ─────────────────────────────────────────────
function calcRecentVelocity(windowMs) {
    const cutoff  = Date.now() - windowMs;
    const segment = gazeData.filter(p => p.t >= cutoff);
    if (segment.length < 2) return null;

    let total = 0, count = 0;
    for (let i = 1; i < segment.length; i++) {
        const dx = segment[i].x - segment[i - 1].x;
        const dy = segment[i].y - segment[i - 1].y;
        const dt = segment[i].t - segment[i - 1].t;
        if (dt > 0) {
            total += Math.sqrt(dx * dx + dy * dy) / dt;
            count++;
        }
    }
    return count > 0 ? total / count : null;
}

function showFatigueToast() {
    fatigueToastCount++;
    const toast = document.getElementById('fatigue-toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

setTimeout(() => {
    baselineVelocity = calcRecentVelocity(60000);

    setInterval(() => {
        if (baselineVelocity === null || fatigueToastCount >= 2) return;
        const recent = calcRecentVelocity(30000);
        if (recent !== null && recent <= baselineVelocity * 0.5) {
            showFatigueToast();
        }
    }, 30000);
}, 60000);
