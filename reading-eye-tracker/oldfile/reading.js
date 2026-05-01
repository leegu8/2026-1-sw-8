// =====================================================
// reading.js - 독서 페이지 스크립트
// 역할: 지금까지 쌓인 보정 데이터를 바탕으로 실시간
//       시선 추적을 시작하고, 화면에 시선 점을 표시한다.
//       이 페이지부터는 마우스 보정을 비활성화한다.
// =====================================================


// -------------------------------------------------------
// 시선 스무딩(Smoothing) 설정
//
// WebGazer가 반환하는 좌표는 프레임마다 조금씩 흔들린다.
// 이를 그대로 사용하면 시선 점이 심하게 떨린다.
// 지수이동평균(EMA)으로 이전 값과 새 값을 혼합해 부드럽게 만든다.
//
// 공식: 새 위치 = α × 새값 + (1-α) × 이전값
//   α(알파)가 낮을수록: 더 부드럽지만 반응이 느려짐
//   α(알파)가 높을수록: 더 빠르지만 떨림이 심해짐
// -------------------------------------------------------
const SMOOTH_ALPHA = 0.25; // 25% 새 값 + 75% 이전 값

// 이전 프레임의 스무딩된 좌표 (처음엔 null → 첫 프레임 그대로 사용)
let smoothX = null;
let smoothY = null;


// -------------------------------------------------------
// applySmoothing(x, y)
// 새로운 시선 좌표(x, y)를 받아 스무딩된 좌표를 반환한다.
// -------------------------------------------------------
function applySmoothing(x, y) {
    if (smoothX === null) {
        // 첫 번째 프레임: 이전 값이 없으므로 그대로 사용
        smoothX = x;
        smoothY = y;
    } else {
        // 이후 프레임: 이전 값과 새 값을 비율로 혼합
        smoothX = SMOOTH_ALPHA * x + (1 - SMOOTH_ALPHA) * smoothX;
        smoothY = SMOOTH_ALPHA * y + (1 - SMOOTH_ALPHA) * smoothY;
    }
    return { x: smoothX, y: smoothY };
}


// -------------------------------------------------------
// 페이지 로드 완료 후 실행
// -------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    const gazeDot = document.getElementById('gaze-dot'); // 화면에 표시되는 빨간 시선 점
    const status  = document.getElementById('status');

    // ── 진단 1: localStorage 전체 키 출력 (WebGazer가 어떤 키를 쓰는지 확인용) ──
    const allKeys = Object.keys(localStorage);
    console.log('[reading.js] localStorage 전체 키:', allKeys);

    const hasCalibrationData = allKeys.some(k => k.includes('webgazer') || k.includes('ridge') || k.includes('svr'));
    if (!hasCalibrationData) {
        // 경고만 표시하고 계속 진행 (데이터 없어도 WebGazer는 시작)
        console.warn('[reading.js] 보정 데이터를 찾지 못함. 키 목록:', allKeys);
        status.textContent = '⚠ 보정 데이터 없음 — 정확도가 낮을 수 있습니다';
        status.style.color = 'orange';
    } else {
        console.log('[reading.js] 보정 데이터 발견');
    }
    status.textContent = '⏳ WebGazer 시작 중...';

    try {
        webgazer.setRegression('ridge');

        // true: 이전 페이지들에서 쌓인 보정 데이터를 불러와 사용
        webgazer.saveDataAcrossSessions(true);

        // ── 진단 2: begin() 호출 ──
        await webgazer.begin();
        console.log('[reading.js] webgazer.begin() 완료');
        status.textContent = '✅ WebGazer 시작됨 — 얼굴 감지 대기 중...';

        webgazer
            .showVideoPreview(true)       // 진단용: 카메라가 실제로 켜지는지 확인 (정상 확인 후 false로 변경 가능)
            .showPredictionPoints(false)  // WebGazer 기본 점 숨김
            .removeMouseEventListeners(); // ★ 마우스 자동 보정 비활성화

        // 시선 점을 화면에 표시
        gazeDot.style.display = 'block';

        // ── 진단 3: 5초 안에 시선 데이터가 오지 않으면 경고 ──
        let gazeReceived = false;
        const timeoutWarning = setTimeout(() => {
            if (!gazeReceived) {
                status.textContent = '⚠ 시선 데이터 없음 — 얼굴이 카메라에 잘 보이는지 확인하세요';
                status.style.color = 'orange';
                console.warn('[reading.js] No gaze data received after 5 seconds');
            }
        }, 5000);

        // WebGazer가 프레임마다 예측한 시선 좌표를 콜백으로 받는다
        webgazer.setGazeListener(data => {
            // data가 null이면 시선을 감지하지 못한 것 → 건너뜀
            if (!data) return;

            // ── 진단 4: 첫 시선 데이터 수신 확인 ──
            if (!gazeReceived) {
                gazeReceived = true;
                clearTimeout(timeoutWarning);
                status.textContent = '👁 시선 추적 중';
                status.style.color = '';
                console.log('[reading.js] 첫 시선 데이터 수신:', data.x, data.y);
            }

            // 스무딩 적용 후 시선 점 위치 업데이트
            const { x, y } = applySmoothing(data.x, data.y);

            // CSS transform: translate(-50%, -50%) 때문에 좌표를 그대로 넣으면
            // 점의 중심이 시선 위치에 오게 된다
            gazeDot.style.left = `${x}px`;
            gazeDot.style.top  = `${y}px`;
        });

    } catch (err) {
        status.textContent = '❌ 에러: ' + err.message;
        status.style.color = 'red';
        console.error('[reading.js] 오류:', err);
    }

    // "추적 중지" 버튼: WebGazer를 일시정지하고 시선 점을 숨긴다
    document.getElementById('stop-btn').addEventListener('click', () => {
        webgazer.pause();
        gazeDot.style.display = 'none';
        status.textContent = '⏹ 추적 중지됨';
    });

    // "재보정" 버튼: 보정 페이지로 돌아가 처음부터 다시 보정한다
    document.getElementById('recal-btn').addEventListener('click', () => {
        window.location.href = 'calibration.html';
    });
});
