const userId = localStorage.getItem('user_id') || sessionStorage.getItem('user_id');
const nick   = localStorage.getItem('user_nick') || sessionStorage.getItem('user_nick') || '';

if (nick) document.getElementById('navbar-user').innerHTML = `<span class="avatar">${nick[0]}</span>${nick}님`;
if (nick) document.getElementById('growth-title').textContent = `${nick}의 성장일지`;
if (userId === '100') document.getElementById('back-to-list').href = '/reading-list-admin.html';

async function loadAttendance() {
    let data = { streak: 0, total_days: 0, recent_dates: [] };
    try {
        const res = await fetch(`/api/db/users/${userId}/attendance/streak`);
        if (res.ok) data = await res.json();
    } catch {}

    document.getElementById('streak-num').textContent = data.streak;
    document.getElementById('total-days').textContent = data.total_days;

    const today = new Date();
    const dots  = document.getElementById('attendance-dots');
    dots.innerHTML = '';
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const checked = data.recent_dates.includes(dateStr);
        const label   = `${d.getMonth() + 1}/${d.getDate()}`;
        dots.innerHTML += `
            <div class="attendance-dot-wrap">
                <div class="attendance-dot ${checked ? 'checked' : ''}"></div>
                <span class="dot-label">${label}</span>
            </div>`;
    }
}

async function loadSessions() {
    let sessions = [];
    try {
        const res = await fetch(`/api/db/users/${userId}/growth`);
        if (res.ok) sessions = await res.json();
    } catch {}

    if (!sessions.length) {
        document.getElementById('no-data').style.display = 'block';
        document.getElementById('growth-content').style.display = 'none';
        return;
    }

    renderGrowthSummary(sessions);
    renderSessionList(sessions);
    renderCharts(sessions);
}

// ── 직전 세션 대비 변화 표시 ──────────────────────────────
function deltaHtml(curr, prev, lowerIsBetter = false, unit = '') {
    if (prev == null || curr == null) return '';
    const diff = curr - prev;
    if (Math.abs(diff) < 0.5) return '';
    const up    = diff > 0;
    const good  = lowerIsBetter ? !up : up;
    const sign  = up ? '+' : '';
    const arrow = up ? '↑' : '↓';
    const color = good ? '#27ae60' : '#e74c3c';
    return `<span class="stat-delta" style="color:${color};">${sign}${Math.round(Math.abs(diff))}${unit}${arrow}</span>`;
}

// ── 성장 요약 텍스트 카드 ─────────────────────────────────
function renderGrowthSummary(sessions) {
    const el = document.getElementById('growth-summary');
    if (!el || sessions.length < 2) return;

    const valid = sessions.filter(s => s.score != null && s.score > 0);
    if (valid.length < 2) return;

    const first = valid[0];
    const last  = valid[valid.length - 1];
    const insights = [];

    const scoreDiff = last.score - first.score;
    if (scoreDiff >= 5)       insights.push({ type: 'good',    icon: '🎉', text: `종합 점수가 ${Math.round(scoreDiff)}점 향상됐어요!` });
    else if (scoreDiff <= -5) insights.push({ type: 'bad',     icon: '💪', text: `종합 점수가 다소 낮아졌어요. 다음엔 더 잘할 수 있어요.` });
    else                      insights.push({ type: 'neutral', icon: '📊', text: `종합 점수가 안정적으로 유지되고 있어요.` });

    const focusDiff = (last.summary.concentration_score ?? 0) - (first.summary.concentration_score ?? 0);
    if (focusDiff >= 5)       insights.push({ type: 'good', icon: '🧠', text: `집중도가 ${Math.round(focusDiff)}% 향상됐어요!` });
    else if (focusDiff <= -5) insights.push({ type: 'bad',  icon: '👁', text: `집중도가 떨어졌어요. 독서 환경을 점검해보세요.` });

    const regDiff = (first.summary.regression_ratio ?? 0) - (last.summary.regression_ratio ?? 0);
    if (regDiff >= 3)       insights.push({ type: 'good', icon: '↩', text: `역행 비율이 ${Math.round(regDiff)}% 줄었어요. 읽기 흐름이 좋아지고 있어요!` });
    else if (regDiff <= -3) insights.push({ type: 'bad',  icon: '↩', text: `역행 비율이 늘었어요. 한 번에 집중해서 읽는 연습을 해보세요.` });

    const compDiff = ((last.summary.completion_rate ?? 0) - (first.summary.completion_rate ?? 0)) * 100;
    if (compDiff >= 10)       insights.push({ type: 'good', icon: '✅', text: `완독률이 ${Math.round(compDiff)}% 올랐어요. 끝까지 읽는 습관이 생기고 있어요!` });
    else if (compDiff <= -10) insights.push({ type: 'bad',  icon: '📖', text: `완독률이 줄었어요. 뒷부분까지 집중해서 읽어보세요.` });

    if (!insights.length) return;

    el.innerHTML = `
        <div class="growth-summary-card">
            <div class="summary-title">나의 성장 분석</div>
            <div class="summary-list">
                ${insights.map(ins => `
                    <div class="summary-item summary-${ins.type}">
                        <span class="summary-icon">${ins.icon}</span>
                        <span class="summary-text">${ins.text}</span>
                    </div>`).join('')}
            </div>
        </div>`;
}

// ── 세션 카드 (직전 대비 델타 포함) ──────────────────────
function renderSessionList(sessions) {
    const list      = [...sessions].reverse();
    const container = document.getElementById('session-list');
    container.innerHTML = list.map((s, i) => {
        const prev          = i < list.length - 1 ? list[i + 1] : null;
        const min           = Math.floor((s.total_duration_sec || 0) / 60);
        const sec           = (s.total_duration_sec || 0) % 60;
        const completionPct = Math.round((s.summary.completion_rate ?? 0) * 100);
        const prevCompPct   = prev ? Math.round((prev.summary.completion_rate ?? 0) * 100) : null;
        return `
        <div class="session-card">
            <div class="session-card-left">
                <div class="session-num">${i + 1}</div>
                <div class="session-info">
                    <h5>${s.book_title}</h5>
                    <p>${s.started_at} · ${min}분 ${sec}초</p>
                </div>
            </div>
            <div class="session-stats">
                <div class="stat-item">
                    <div class="val">${s.score != null ? Math.round(s.score) : '--'}${prev ? deltaHtml(s.score, prev.score) : ''}</div>
                    <div class="lbl">종합점수</div>
                </div>
                <div class="stat-item">
                    <div class="val">${Math.round(s.summary.wpm ?? 0)}${prev ? deltaHtml(s.summary.wpm ?? 0, prev.summary.wpm ?? 0) : ''}</div>
                    <div class="lbl">WPM</div>
                </div>
                <div class="stat-item">
                    <div class="val">${Math.round(s.summary.concentration_score ?? 0)}${prev ? deltaHtml(s.summary.concentration_score ?? 0, prev.summary.concentration_score ?? 0) : ''}</div>
                    <div class="lbl">집중도</div>
                </div>
                <div class="stat-item">
                    <div class="val">${completionPct}%${prev ? deltaHtml(completionPct, prevCompPct, false, '%') : ''}</div>
                    <div class="lbl">완독률</div>
                </div>
                <div class="stat-item">
                    <div class="val">${Math.round(s.summary.regression_ratio ?? 0)}%${prev ? deltaHtml(s.summary.regression_ratio ?? 0, prev.summary.regression_ratio ?? 0, true, '%') : ''}</div>
                    <div class="lbl">역행비율</div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ── 차트 ──────────────────────────────────────────────────
const METRICS = [
    {
        key: 'wpm', label: '독서 속도', color: '#3498db',
        extract: s => Math.round(s.summary.wpm ?? 0),
        optimalMin: 270, optimalMax: 400,
        desc: '적정 구간 270–400 어절/분',
    },
    {
        key: 'concentration', label: '집중도', color: '#2ecc71',
        extract: s => Math.round(s.summary.concentration_score ?? 0),
        optimalMin: 80, optimalMax: 100,
        desc: '80% 이상이면 우수',
    },
    {
        key: 'completion', label: '완독률', color: '#9b59b6',
        extract: s => Math.round((s.summary.completion_rate ?? 0) * 100),
        optimalMin: 90, optimalMax: 100,
        desc: '90% 이상이면 우수 · 높을수록 좋아요',
    },
    {
        key: 'regression', label: '역행 비율', color: '#e74c3c',
        extract: s => Math.round(s.summary.regression_ratio ?? 0),
        optimalMin: 0, optimalMax: 15,
        desc: '15% 이하가 적정 · 낮을수록 읽기 흐름이 좋아요',
    },
];

let metricChart = null;

function renderCharts(sessions) {
    const labels = sessions.map(s => s.started_at);
    makeChart('chart-score', labels, sessions.map(s => s.score != null ? Math.round(s.score) : null), '종합점수', '#f39c12');
    renderMetricSelector(sessions);
}

function renderMetricSelector(sessions) {
    const selector = document.getElementById('metric-selector');
    selector.innerHTML = METRICS.map((m, i) =>
        `<button class="metric-btn${i === 0 ? ' active' : ''}" data-key="${m.key}">${m.label}</button>`
    ).join('');

    selector.querySelectorAll('.metric-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selector.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateMetricChart(sessions, METRICS.find(m => m.key === btn.dataset.key));
        });
    });

    updateMetricChart(sessions, METRICS[0]);
}

function updateMetricChart(sessions, metric) {
    const labels   = sessions.map(s => s.started_at);
    const data     = sessions.map(metric.extract);
    const n        = labels.length;
    const bandLow  = Array(n).fill(metric.optimalMin);
    const bandHigh = Array(n).fill(metric.optimalMax);

    const descEl = document.getElementById('metric-desc');
    if (descEl) descEl.textContent = metric.desc;

    if (metricChart) {
        metricChart.data.labels              = labels;
        metricChart.data.datasets[0].data    = bandLow;
        metricChart.data.datasets[1].data    = bandHigh;
        metricChart.data.datasets[2].data    = data;
        metricChart.data.datasets[2].label              = metric.label;
        metricChart.data.datasets[2].borderColor        = metric.color;
        metricChart.data.datasets[2].backgroundColor    = metric.color + '22';
        metricChart.data.datasets[2].pointBackgroundColor = metric.color;
        metricChart.update();
    } else {
        metricChart = makeMetricChart('chart-metric', labels, data, bandLow, bandHigh, metric);
    }
}

function makeMetricChart(canvasId, labels, data, bandLow, bandHigh, metric) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    return new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    data: bandLow,
                    borderColor: 'rgba(39,174,96,0.30)',
                    borderWidth: 1.5,
                    borderDash: [5, 4],
                    backgroundColor: 'rgba(39,174,96,0.10)',
                    fill: '+1',
                    pointRadius: 0,
                    tension: 0,
                },
                {
                    data: bandHigh,
                    borderColor: 'rgba(39,174,96,0.30)',
                    borderWidth: 1.5,
                    borderDash: [5, 4],
                    backgroundColor: 'transparent',
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                },
                {
                    label: metric.label,
                    data,
                    borderColor:          metric.color,
                    backgroundColor:      metric.color + '22',
                    borderWidth:          2.5,
                    pointRadius:          5,
                    pointBackgroundColor: metric.color,
                    tension:              0.3,
                    fill:                 false,
                    spanGaps:             true,
                },
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, grid: { color: 'rgba(255,255,255,0.07)' }, ticks: { color: 'rgba(232,238,255,0.5)' } },
                x: { grid: { display: false }, ticks: { color: 'rgba(232,238,255,0.5)' } }
            }
        }
    });
}

function makeChart(canvasId, labels, data, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    return new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label,
                data,
                borderColor:          color,
                backgroundColor:      color + '22',
                borderWidth:          2.5,
                pointRadius:          5,
                pointBackgroundColor: color,
                tension:              0.3,
                fill:                 true,
                spanGaps:             true,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, grid: { color: 'rgba(255,255,255,0.07)' }, ticks: { color: 'rgba(232,238,255,0.5)' } },
                x: { grid: { display: false }, ticks: { color: 'rgba(232,238,255,0.5)' } }
            }
        }
    });
}

loadAttendance();
loadSessions();
