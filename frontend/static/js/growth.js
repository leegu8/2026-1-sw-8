const userId = localStorage.getItem('user_id');
const nick   = localStorage.getItem('user_nick') || '';

document.getElementById('navbar-user').textContent = nick;
if (nick) document.getElementById('growth-title').textContent = `${nick}의 성장일지`;

// ── 임시 목 데이터 (백엔드 연동 전) ──────────────────────────
const MOCK_ATTENDANCE = {
    streak: 3,
    totalDays: 15,
    recentDates: ['2026-05-16', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22'],
};

const MOCK_SESSIONS = [
    {
        sessionId: 1, bookTitle: '빛의 굴절과 렌즈의 원리', startedAt: '2026-05-10',
        totalDurationSec: 312,
        summary: { wpm: 142, completionRate: 88, concentrationScore: 74, regressionRatio: 12, blurEventCount: 3, highlightEventCount: 45 }
    },
    {
        sessionId: 2, bookTitle: '조선의 신분제도와 사회 구조', startedAt: '2026-05-13',
        totalDurationSec: 284,
        summary: { wpm: 155, completionRate: 92, concentrationScore: 80, regressionRatio: 9,  blurEventCount: 2, highlightEventCount: 51 }
    },
    {
        sessionId: 3, bookTitle: '인터넷의 작동 원리', startedAt: '2026-05-16',
        totalDurationSec: 260,
        summary: { wpm: 161, completionRate: 95, concentrationScore: 83, regressionRatio: 7,  blurEventCount: 1, highlightEventCount: 58 }
    },
];

async function loadAttendance() {
    const data = MOCK_ATTENDANCE; // TODO: fetch(`/api/db/attendance/${userId}`)
    document.getElementById('streak-num').textContent = data.streak;
    document.getElementById('total-days').textContent = data.totalDays;

    const today  = new Date();
    const dots   = document.getElementById('attendance-dots');
    dots.innerHTML = '';
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const checked = data.recentDates.includes(dateStr);
        const label   = `${d.getMonth() + 1}/${d.getDate()}`;
        dots.innerHTML += `
            <div class="attendance-dot-wrap">
                <div class="attendance-dot ${checked ? 'checked' : ''}"></div>
                <span class="dot-label">${label}</span>
            </div>`;
    }
}

async function loadSessions() {
    let sessions = MOCK_SESSIONS; // TODO: fetch(`/api/db/users/${userId}/sessions?limit=5`)

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
        const min = Math.floor(s.totalDurationSec / 60);
        const sec = s.totalDurationSec % 60;
        return `
        <div class="session-card">
            <div class="session-card-left">
                <div class="session-num">${i + 1}</div>
                <div class="session-info">
                    <h5>${s.bookTitle}</h5>
                    <p>${s.startedAt} · ${min}분 ${sec}초</p>
                </div>
            </div>
            <div class="session-stats">
                <div class="stat-item"><div class="val">${s.summary.wpm}</div><div class="lbl">WPM</div></div>
                <div class="stat-item"><div class="val">${s.summary.concentrationScore}</div><div class="lbl">집중도</div></div>
                <div class="stat-item"><div class="val">${s.summary.completionRate}%</div><div class="lbl">완독률</div></div>
                <div class="stat-item"><div class="val">${s.summary.regressionRatio}%</div><div class="lbl">역행비율</div></div>
            </div>
        </div>`;
    }).join('');
}

function renderCharts(sessions) {
    const labels = sessions.map(s => s.startedAt);

    makeChart('chart-wpm',           labels, sessions.map(s => s.summary.wpm),                '독서 속도',   '#3498db');
    makeChart('chart-concentration', labels, sessions.map(s => s.summary.concentrationScore), '집중도',      '#2ecc71');
    makeChart('chart-completion',    labels, sessions.map(s => s.summary.completionRate),      '완독률',      '#9b59b6');
    makeChart('chart-regression',    labels, sessions.map(s => s.summary.regressionRatio),     '역행 비율',   '#e74c3c');
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
