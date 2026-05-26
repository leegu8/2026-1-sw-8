const userId = localStorage.getItem('user_id');
const nick   = localStorage.getItem('user_nick') || '';

document.getElementById('navbar-user').textContent = nick;
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

    renderSessionList(sessions);
    renderCharts(sessions);
}

function renderSessionList(sessions) {
    const container = document.getElementById('session-list');
    container.innerHTML = sessions.map((s, i) => {
        const min          = Math.floor(s.total_duration_sec / 60);
        const sec          = s.total_duration_sec % 60;
        const completionPct = Math.round((s.summary.completion_rate ?? 0) * 100);
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
                <div class="stat-item"><div class="val">${s.score != null ? Math.round(s.score) : '--'}</div><div class="lbl">종합점수</div></div>
                <div class="stat-item"><div class="val">${Math.round(s.summary.wpm ?? 0)}</div><div class="lbl">WPM</div></div>
                <div class="stat-item"><div class="val">${Math.round(s.summary.concentration_score ?? 0)}</div><div class="lbl">집중도</div></div>
                <div class="stat-item"><div class="val">${completionPct}%</div><div class="lbl">완독률</div></div>
                <div class="stat-item"><div class="val">${Math.round(s.summary.regression_ratio ?? 0)}%</div><div class="lbl">역행비율</div></div>
            </div>
        </div>`;
    }).join('');
}

function renderCharts(sessions) {
    const labels = sessions.map(s => s.started_at);

    makeChart('chart-wpm',           labels, sessions.map(s => Math.round(s.summary.wpm ?? 0)),                          '독서 속도', '#3498db');
    makeChart('chart-concentration', labels, sessions.map(s => Math.round(s.summary.concentration_score ?? 0)),           '집중도',    '#2ecc71');
    makeChart('chart-completion',    labels, sessions.map(s => Math.round((s.summary.completion_rate ?? 0) * 100)),       '완독률',    '#9b59b6');
    makeChart('chart-regression',    labels, sessions.map(s => Math.round(s.summary.regression_ratio ?? 0)),              '역행 비율', '#e74c3c');
}

function makeChart(canvasId, labels, data, label, color) {
    new Chart(document.getElementById(canvasId), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label,
                data,
                borderColor:     color,
                backgroundColor: color + '22',
                borderWidth: 2.5,
                pointRadius: 5,
                pointBackgroundColor: color,
                tension: 0.3,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: false, grid: { color: '#f0f0f0' } },
                x: { grid: { display: false } }
            }
        }
    });
}

loadAttendance();
loadSessions();
