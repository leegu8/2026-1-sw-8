// =====================================================
// calibration.js - 시선 보정 페이지 스크립트
// 역할: WebGazer를 시작하고, 화면 9개 지점을 클릭하게
//       해서 시선 추적 모델을 학습시킨다.
// =====================================================

// 각 보정 점마다 몇 번 클릭해야 완료로 처리할지
const CLICKS_NEEDED = 5;

// 눈동자가 목표 지점으로 이동한 후 완전히 안착하는 데 걸리는 평균 시간 (ms)
// 너무 짧으면 눈이 아직 이동 중인 프레임이 기록됨
const SACCADE_SETTLE_MS = 100;

// 보정 데이터를 기록하기 전 대기 시간 (카메라 초기화 후 자동으로 계산됨)
let recordDelay = 180; // 카메라 감지 전까지 사용할 기본값 (ms)

// 시선 점 스무딩용 변수 (reading.js와 동일한 방식)
const SMOOTH_ALPHA = 0.25;
let smoothX = null, smoothY = null;

function applySmoothing(x, y) {
    if (smoothX === null) { smoothX = x; smoothY = y; }
    else {
        smoothX = SMOOTH_ALPHA * x + (1 - SMOOTH_ALPHA) * smoothX;
        smoothY = SMOOTH_ALPHA * y + (1 - SMOOTH_ALPHA) * smoothY;
    }
    return { x: smoothX, y: smoothY };
}


// -------------------------------------------------------
// detectOptimalDelay()
// 현재 연결된 카메라의 실제 FPS를 읽어서
// 최적의 딜레이 값을 자동으로 계산한다.
//
// 원리:
//   카메라는 초당 fps 장의 사진(프레임)을 찍는다.
//   예) 30fps → 1프레임 = 33ms
//   클릭 직후에는 눈이 아직 이동 중일 수 있으므로,
//   2프레임 분량을 기다린 뒤 + 눈 안착 시간을 더한다.
//   → delay = (1000 / fps × 2) + 100ms
// -------------------------------------------------------
function detectOptimalDelay() {
    // WebGazer가 시작되면 'webgazerVideoFeed'라는 id의 video 요소를 자동 생성한다
    const video = document.getElementById('webgazerVideoFeed');

    // video 요소 → 미디어 스트림 → 비디오 트랙 → 설정값 순서로 접근
    // ?. 는 중간에 값이 없으면 에러 없이 undefined를 반환하는 안전한 접근법
    const track = video?.srcObject?.getVideoTracks?.()[0];
    const fps = track?.getSettings?.().frameRate;

    // fps를 읽지 못하면 기본값 반환
    if (!fps) return 180;

    // 2프레임 대기 시간 + 눈 안착 시간
    return Math.round(1000 / fps * 2 + SACCADE_SETTLE_MS);
}


// -------------------------------------------------------
// 보정 점 9개의 화면 위치 (단위: %)
// [가로%, 세로%] 형태로, 화면을 3×3 격자로 나눈 위치
// -------------------------------------------------------
const CAL_POSITIONS = [
    [10, 10], [50, 10], [90, 10],  // 상단 좌 / 중 / 우
    [10, 50], [50, 50], [90, 50],  // 중단 좌 / 중 / 우
    [10, 90], [50, 90], [90, 90],  // 하단 좌 / 중 / 우
];

// 각 보정 점마다 클릭 횟수를 기록하는 배열 (총 9개, 초기값 0)
let calCounts = new Array(9).fill(0);


// -------------------------------------------------------
// createCalPoints()
// 보정 오버레이 위에 9개의 클릭 가능한 점을 생성한다.
// 점을 클릭할 때마다 WebGazer에 "지금 이 좌표를 보고 있다"고 알려준다.
// -------------------------------------------------------
function createCalPoints() {
    const overlay = document.getElementById('calibration-overlay');

    // 재보정 시 기존 점이 남아있을 수 있으므로 먼저 제거
    overlay.querySelectorAll('.cal-point').forEach(el => el.remove());

    // 클릭 카운트 초기화
    calCounts = new Array(9).fill(0);

    // 9개 위치를 순서대로 돌며 점(div)을 생성
    CAL_POSITIONS.forEach(([px, py], i) => {
        const div = document.createElement('div');
        div.className = 'cal-point';

        // % 단위로 위치 지정 → 화면 크기가 달라도 비율 유지
        div.style.left = `${px}%`;
        div.style.top  = `${py}%`;

        // 남은 클릭 수를 점 안에 숫자로 표시
        div.innerHTML = `<span>${CLICKS_NEEDED}</span>`;

        div.addEventListener('click', e => {
            // 오버레이 클릭 이벤트가 부모로 전파되지 않도록 막음
            e.stopPropagation();

            // 이미 이 점의 클릭이 완료됐으면 무시
            if (calCounts[i] >= CLICKS_NEEDED) return;

            // --- 핵심: 딜레이 후 보정 데이터 기록 ---
            // 클릭 순간 눈이 아직 이동 중일 수 있으므로,
            // recordDelay(ms) 후에 WebGazer에 좌표를 전달한다.
            // 클릭 위치는 미리 저장해두어야 한다 (setTimeout 콜백은 나중에 실행되므로)
            const cx = e.clientX, cy = e.clientY;
            setTimeout(() => webgazer.recordScreenPosition(cx, cy, 'click'), recordDelay);

            // 클릭 카운트 증가 및 UI 업데이트 (즉시 반응)
            calCounts[i]++;
            const remaining = CLICKS_NEEDED - calCounts[i];
            div.querySelector('span').textContent = remaining === 0 ? '✓' : remaining;
            if (remaining === 0) div.classList.add('done'); // 초록색으로 변경

            // 전체 완료 진행률 업데이트
            const completed = calCounts.filter(c => c >= CLICKS_NEEDED).length;
            document.getElementById('cal-progress').textContent = `${completed} / 9 완료`;

            // 9개 전부 완료됐으면 다음 단계로
            if (completed === 9) onComplete();
        });

        overlay.appendChild(div);
    });
}


// -------------------------------------------------------
// onComplete()
// 9개 점 보정이 모두 끝났을 때 호출된다.
// 완료 메시지를 잠깐 보여준 뒤 guide.html로 이동한다.
// -------------------------------------------------------
function onComplete() {
    document.getElementById('cal-instruction').textContent = '보정 완료!';
    document.getElementById('cal-progress').textContent = '다음 단계로 이동합니다...';
    setTimeout(() => {
        window.location.href = 'guide.html';
    }, 1200);
}


// -------------------------------------------------------
// 페이지 로드 완료 후 실행
// -------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('start-btn').addEventListener('click', async () => {
        const btn    = document.getElementById('start-btn');
        const status = document.getElementById('status');

        btn.disabled = true; // 중복 클릭 방지
        status.textContent = '웹캠 초기화 중...';

        try {
            // 회귀 모델을 'ridge'로 설정 → 기본 linear보다 정확도 높음
            webgazer.setRegression('ridge');

            // 보정 데이터를 브라우저 localStorage에 저장 → 페이지 이동 후에도 유지
            webgazer.saveDataAcrossSessions(true);

            // 이전 세션의 오래된 보정 데이터를 지우고 새로 시작
            webgazer.clearData();

            // WebGazer 시작 (웹캠 권한 요청 포함)
            await webgazer.begin();

            webgazer
                .showVideoPreview(true)       // 좌측 상단에 웹캠 미리보기 표시 (얼굴 위치 확인용)
                .showPredictionPoints(false)  // WebGazer 기본 시선 점은 숨김 (우리가 직접 그림)
                .removeMouseEventListeners(); // 보정 중엔 마우스 자동 학습 끔 (명시적 클릭만 사용)

            // 카메라 스트림이 완전히 초기화될 때까지 0.5초 대기
            await new Promise(r => setTimeout(r, 500));

            // 카메라 FPS를 읽어 최적 딜레이 계산
            recordDelay = detectOptimalDelay();

            // 감지된 FPS와 적용된 딜레이를 화면에 표시
            const video = document.getElementById('webgazerVideoFeed');
            const fps   = video?.srcObject?.getVideoTracks?.()[0]?.getSettings?.().frameRate;
            status.textContent = fps
                ? `카메라 감지: ${Math.round(fps)}fps → 딜레이 ${recordDelay}ms 적용`
                : `딜레이 ${recordDelay}ms 적용 (fps 감지 실패, 기본값 사용)`;

            // 보정 중에도 시선 점을 띄워서 추적 상태 확인 가능하게
            const gazeDot = document.getElementById('gaze-dot');
            gazeDot.style.display = 'block';
            webgazer.setGazeListener(data => {
                if (!data) return;
                const { x, y } = applySmoothing(data.x, data.y);
                gazeDot.style.left = `${x}px`;
                gazeDot.style.top  = `${y}px`;
            });

            // 보정 오버레이를 화면에 표시하고 점 생성
            document.getElementById('calibration-overlay').style.display = 'block';
            createCalPoints();

        } catch (err) {
            // 웹캠 권한 거부 등 에러 처리
            btn.disabled = false;
            status.textContent = '❌ 에러: ' + err.message;
        }
    });
});
