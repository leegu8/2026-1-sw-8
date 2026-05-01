// =====================================================
// app.js - 통합 단일 페이지 스크립트
//
// 구조: calibration → guide → reading 순서로
//       뷰(화면)만 전환하며, WebGazer는 처음 한 번만 시작된다.
//       페이지 이동이 없으므로 보정 데이터가 메모리에 유지된다.
// =====================================================


// ───────────────── 상수 ─────────────────
const CLICKS_NEEDED    = 5;     // 보정 점 하나당 필요한 클릭 수
const SACCADE_SETTLE   = 100;   // 눈 안착 시간 (ms)
const SMOOTH_ALPHA     = 0.25;  // 시선 스무딩 강도 (낮을수록 부드러움)
const SAMPLE_INTERVAL  = 100;   // 독서 중 시선 데이터 수집 간격 (ms)

// 보정 점 9개의 화면 위치 [가로%, 세로%]
const CAL_POSITIONS = [
    [10, 10], [50, 10], [90, 10],
    [10, 50], [50, 50], [90, 50],
    [10, 90], [50, 90], [90, 90],
];


// ───────────────── 상태 변수 ─────────────────
let recordDelay    = 180;   // 보정 클릭 딜레이 (카메라 FPS 감지 후 자동 계산)
let calCounts      = [];    // 각 보정 점의 클릭 횟수
let smoothX        = null;  // 스무딩된 시선 X 좌표
let smoothY        = null;  // 스무딩된 시선 Y 좌표

// 독서 분석용
let gazeData       = [];    // 독서 중 수집한 시선 좌표 [{x, y, t}, ...]
let isCollecting   = false; // 현재 독서 중 수집 여부
let lastSampleTime = 0;     // 마지막 샘플 시각
let readingStartTime = null;// 독서 시작 시각


// ───────────────── 시선 스무딩 ─────────────────
// 프레임마다 흔들리는 raw 시선 좌표를 부드럽게 만든다
function applySmoothing(x, y) {
    if (smoothX === null) {
        smoothX = x;
        smoothY = y;
    } else {
        smoothX = SMOOTH_ALPHA * x + (1 - SMOOTH_ALPHA) * smoothX;
        smoothY = SMOOTH_ALPHA * y + (1 - SMOOTH_ALPHA) * smoothY;
    }
    return { x: smoothX, y: smoothY };
}


// ───────────────── 뷰 전환 ─────────────────
// 세 개의 뷰(calibration / guide / reading) 중 하나만 표시한다
function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(`view-${name}`).style.display = 'block';
    updateProgressBar(name);
}

// 헤더의 진행 단계 표시를 현재 뷰에 맞게 업데이트
function updateProgressBar(name) {
    const order = ['calibration', 'guide', 'reading'];
    const current = order.indexOf(name);

    order.forEach((step, i) => {
        const el     = document.getElementById(`step-${step}`);
        const circle = el.querySelector('.circle');

        if (i < current) {
            // 이미 완료된 단계
            el.className    = 'progress-step done';
            circle.textContent = '✓';
        } else if (i === current) {
            // 현재 단계
            el.className    = 'progress-step active';
            circle.textContent = i + 1;
        } else {
            // 아직 진행 전 단계
            el.className    = 'progress-step';
            circle.textContent = i + 1;
        }
    });
}


// ───────────────── 카메라 딜레이 감지 ─────────────────
// WebGazer 시작 후 카메라 FPS를 읽어 최적 기록 딜레이를 계산한다
function detectOptimalDelay() {
    const video = document.getElementById('webgazerVideoFeed');
    const track = video?.srcObject?.getVideoTracks?.()[0];
    const fps   = track?.getSettings?.().frameRate;

    if (!fps) return 180;
    return Math.round(1000 / fps * 2 + SACCADE_SETTLE);
}


// ───────────────── 보정 오버레이 ─────────────────
function createCalPoints() {
    const overlay = document.getElementById('calibration-overlay');
    overlay.querySelectorAll('.cal-point').forEach(el => el.remove());
    calCounts = new Array(9).fill(0);

    CAL_POSITIONS.forEach(([px, py], i) => {
        const div = document.createElement('div');
        div.className = 'cal-point';
        div.style.left = `${px}%`;
        div.style.top  = `${py}%`;
        div.innerHTML  = `<span>${CLICKS_NEEDED}</span>`;

        div.addEventListener('click', e => {
            e.stopPropagation();
            if (calCounts[i] >= CLICKS_NEEDED) return;

            // 카메라 딜레이 보상: 눈이 목표에 완전히 안착한 후 기록
            const cx = e.clientX, cy = e.clientY;
            setTimeout(() => webgazer.recordScreenPosition(cx, cy, 'click'), recordDelay);

            calCounts[i]++;
            const remaining = CLICKS_NEEDED - calCounts[i];
            div.querySelector('span').textContent = remaining === 0 ? '✓' : remaining;
            if (remaining === 0) div.classList.add('done');

            const completed = calCounts.filter(c => c >= CLICKS_NEEDED).length;
            document.getElementById('cal-progress').textContent = `${completed} / 9 완료`;

            if (completed === 9) onCalComplete();
        });

        overlay.appendChild(div);
    });
}

// 보정 완료 → 안내 뷰로 전환
function onCalComplete() {
    document.getElementById('cal-instruction').textContent = '보정 완료!';
    document.getElementById('cal-progress').textContent   = '잠시 후 다음 단계로 이동합니다...';

    setTimeout(() => {
        // 오버레이 숨기고 안내 뷰로 전환
        document.getElementById('calibration-overlay').style.display = 'none';
        showView('guide');

        // 안내 페이지에서 마우스 움직임으로 추가 보정 누적
        startPassiveCalibration();
    }, 1000);
}


// ───────────────── 수동 보정 (안내 페이지) ─────────────────
// WebGazer의 기본 마우스 리스너 대신 직접 이벤트를 달아서
// 안내 페이지에서의 마우스 이동을 보정 데이터로 활용한다
function passiveHandler(e) {
    webgazer.recordScreenPosition(e.clientX, e.clientY, e.type);
}

function startPassiveCalibration() {
    document.addEventListener('mousemove', passiveHandler);
    document.addEventListener('click',     passiveHandler);
}

function stopPassiveCalibration() {
    document.removeEventListener('mousemove', passiveHandler);
    document.removeEventListener('click',     passiveHandler);
}


// ───────────────── 독서 분석 ─────────────────

// 독서 시작: 데이터 수집 시작
function startReadingTracking() {
    gazeData         = [];
    isCollecting     = true;
    lastSampleTime   = 0;
    readingStartTime = Date.now();
}

// 독서 완료: 데이터 수집 중단 후 분석
function analyzeReading() {
    isCollecting = false;

    const totalSec = ((Date.now() - readingStartTime) / 1000).toFixed(0);
    const textEl   = document.querySelector('.reading-text');
    const rect     = textEl.getBoundingClientRect();

    if (gazeData.length < 10) {
        return { error: true, totalSec };
    }

    // ── 1. 집중도: 텍스트 영역 안에 있던 시선 비율 ──
    const inArea = gazeData.filter(p =>
        p.x >= rect.left - 20 && p.x <= rect.right  + 20 &&
        p.y >= rect.top  - 20 && p.y <= rect.bottom + 20
    ).length;
    const focusRate = Math.round(inArea / gazeData.length * 100);

    // ── 2. 역행 횟수: 오른→왼으로 크게 이동한 횟수 ──
    // 연속한 두 점 사이에서 x가 200px 이상 줄고, y 차이는 120px 미만이면 역행
    const REGRESSION_X = 200;  // 역행으로 판단할 최소 좌향 이동 거리 (px)
    const SAME_LINE_Y  = 120;  // 같은 줄로 볼 최대 y 차이 (px)
    let regressions = 0;

    for (let i = 1; i < gazeData.length; i++) {
        const dx = gazeData[i].x - gazeData[i - 1].x;
        const dy = Math.abs(gazeData[i].y - gazeData[i - 1].y);
        if (dx < -REGRESSION_X && dy < SAME_LINE_Y) regressions++;
    }

    return { totalSec, focusRate, regressions };
}

// 결과를 화면에 렌더링
function showResult(result) {
    showView('result');

    if (result.error) {
        document.getElementById('result-metrics').innerHTML =
            `<p style="text-align:center; color:#e74c3c;">
                수집된 시선 데이터가 부족합니다.<br>
                독서 중 얼굴이 카메라에 잘 보이는지 확인하고 다시 시도하세요.
            </p>`;
        document.getElementById('result-feedback').innerHTML = '';
        return;
    }

    const { totalSec, focusRate, regressions } = result;

    // 각 항목 등급 계산
    const focusGrade = focusRate >= 75 ? 'good' : focusRate >= 50 ? 'avg' : 'bad';
    const regGrade   = regressions <= 4 ? 'good' : regressions <= 12 ? 'avg' : 'bad';

    const gradeLabel = { good: '좋음', avg: '보통', bad: '개선 필요' };
    const gradeColor = { good: '#27ae60', avg: '#f39c12', bad: '#e74c3c' };

    // 결과 카드 렌더링
    document.getElementById('result-metrics').innerHTML = `
        <div class="result-cards">
            <div class="result-card">
                <div class="result-icon">⏱</div>
                <div class="result-label">총 독서 시간</div>
                <div class="result-value">${totalSec}초</div>
            </div>
            <div class="result-card">
                <div class="result-icon">👁</div>
                <div class="result-label">집중도</div>
                <div class="result-value">${focusRate}%</div>
                <div class="result-badge" style="background:${gradeColor[focusGrade]}">${gradeLabel[focusGrade]}</div>
            </div>
            <div class="result-card">
                <div class="result-icon">↩</div>
                <div class="result-label">역행 횟수</div>
                <div class="result-value">${regressions}회</div>
                <div class="result-badge" style="background:${gradeColor[regGrade]}">${gradeLabel[regGrade]}</div>
            </div>
        </div>
    `;

    // 종합 피드백 메시지 생성
    const feedbacks = [];
    if (focusGrade === 'good')      feedbacks.push('텍스트에 잘 집중하며 읽었습니다.');
    else if (focusGrade === 'avg')  feedbacks.push('가끔 시선이 텍스트 밖으로 벗어났습니다. 화면 중앙에 집중해보세요.');
    else                            feedbacks.push('시선이 텍스트 영역을 자주 벗어났습니다. 독서 환경을 조용히 만들어보세요.');

    if (regGrade === 'good')        feedbacks.push('역행이 거의 없어 흐름이 좋습니다.');
    else if (regGrade === 'avg')    feedbacks.push('역행이 다소 있었습니다. 읽기 전에 전체 구조를 파악하면 도움이 됩니다.');
    else                            feedbacks.push('역행이 많았습니다. 한 번에 이해하려 집중하는 연습을 해보세요.');

    document.getElementById('result-feedback').innerHTML = `
        <h3 style="margin-bottom:12px;">💬 피드백</h3>
        ${feedbacks.map(f => `<p>${f}</p>`).join('')}
    `;
}


// ───────────────── 재보정 ─────────────────
function restartCalibration() {
    stopPassiveCalibration();

    // 기존 보정 데이터 초기화 후 보정 오버레이 재시작
    webgazer.clearData();
    smoothX = null;
    smoothY = null;

    document.getElementById('calibration-overlay').style.display = 'block';
    document.getElementById('cal-instruction').textContent = '각 점을 바라보면서 5번씩 클릭하세요';
    document.getElementById('cal-progress').textContent    = '0 / 9 완료';
    showView('calibration');
    createCalPoints();
}


// ───────────────── 메인 초기화 ─────────────────
document.addEventListener('DOMContentLoaded', () => {
    const gazeDot = document.getElementById('gaze-dot');
    const status  = document.getElementById('status');

    // ── 보정 시작 버튼 ──
    document.getElementById('start-btn').addEventListener('click', async () => {
        const btn = document.getElementById('start-btn');
        btn.disabled   = true;
        status.textContent = '웹캠 초기화 중...';

        try {
            webgazer.setRegression('ridge');

            // SPA이므로 localStorage 크로스세션 저장 불필요 → false
            // 메모리에만 유지하면 충분하다
            webgazer.saveDataAcrossSessions(false);

            await webgazer.begin();

            webgazer
                .showVideoPreview(true)       // 얼굴 위치 확인용 미리보기
                .showPredictionPoints(false)
                .removeMouseEventListeners(); // 명시적 보정 중엔 마우스 자동학습 끔

            // 카메라 초기화 완료 대기 후 FPS 감지
            await new Promise(r => setTimeout(r, 500));
            recordDelay = detectOptimalDelay();

            const video = document.getElementById('webgazerVideoFeed');
            const fps   = video?.srcObject?.getVideoTracks?.()[0]?.getSettings?.().frameRate;
            status.textContent = fps
                ? `카메라 감지: ${Math.round(fps)}fps → 딜레이 ${recordDelay}ms 적용`
                : `딜레이 ${recordDelay}ms 적용`;

            // 시선 점 표시 시작 (모든 뷰에서 공유)
            gazeDot.style.display = 'block';
            webgazer.setGazeListener(data => {
                if (!data) return;
                const { x, y } = applySmoothing(data.x, data.y);
                gazeDot.style.left = `${x}px`;
                gazeDot.style.top  = `${y}px`;

                // 독서 뷰일 때만 시선 데이터 수집
                if (isCollecting) {
                    const now = Date.now();
                    if (now - lastSampleTime >= SAMPLE_INTERVAL) {
                        gazeData.push({ x, y, t: now });
                        lastSampleTime = now;
                    }
                }
            });

            // 보정 오버레이 표시
            document.getElementById('calibration-overlay').style.display = 'block';
            createCalPoints();

        } catch (err) {
            btn.disabled = false;
            status.textContent = '❌ 에러: ' + err.message;
        }
    });

    // ── 독서 시작 버튼 ──
    document.getElementById('reading-btn').addEventListener('click', () => {
        stopPassiveCalibration(); // 마우스 보정 중단 → 보정 데이터 고정
        showView('reading');
        startReadingTracking();   // 시선 데이터 수집 시작
        document.getElementById('reading-status').textContent = '👁 시선 추적 중';
    });

    // ── 다 읽었어요 버튼 ──
    document.getElementById('done-btn').addEventListener('click', () => {
        const result = analyzeReading();
        showResult(result);
    });

    // ── 추적 중지 버튼 ──
    document.getElementById('stop-btn').addEventListener('click', () => {
        isCollecting = false;
        webgazer.pause();
        gazeDot.style.display = 'none';
        document.getElementById('reading-status').textContent = '⏹ 추적 중지됨';
    });

    // ── 재보정 버튼 (독서 뷰) ──
    document.getElementById('recal-btn').addEventListener('click', () => {
        isCollecting = false;
        webgazer.resume();
        gazeDot.style.display = 'block';
        restartCalibration();
    });

    // ── 다시 읽기 버튼 (결과 뷰) ──
    document.getElementById('retry-btn').addEventListener('click', () => {
        showView('reading');
        startReadingTracking();
        document.getElementById('reading-status').textContent = '👁 시선 추적 중';
    });

    // ── 재보정 후 다시 읽기 버튼 (결과 뷰) ──
    document.getElementById('recal2-btn').addEventListener('click', () => {
        webgazer.resume();
        gazeDot.style.display = 'block';
        restartCalibration();
    });
});
