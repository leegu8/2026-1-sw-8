let gazeDot;
let isRunning = false;

// 페이지 요소가 모두 로드된 후 실행
document.addEventListener('DOMContentLoaded', () => {
    // 변수 선언 확인!
    gazeDot = document.getElementById('gaze-dot');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const status = document.getElementById('status');

    // 시작 버튼 클릭 이벤트
    startBtn.addEventListener('click', async () => {
        if (isRunning) return;
        
        status.textContent = "웹캠 초기화 중... 잠시만 기다려주세요.";
        
        try {
            await webgazer.begin();
            
webgazer.showVideoPreview(true)
        .showPredictionPoints(true)
        .removeMouseEventListeners();

            gazeDot.style.display = 'block';
            isRunning = true;
            status.textContent = "✅ 작동 중! 화면 곳곳을 클릭하며 보정하세요.";
            
            webgazer.setGazeListener((data) => {
                if (!data) return;
                gazeDot.style.left = `${data.x - 10}px`;
                gazeDot.style.top = `${data.y - 10}px`;
            });
            
        } catch (err) {
            console.error("WebGazer Error:", err);
            status.textContent = "❌ 에러 발생: " + err.message;
        }
    });

    // 멈춤 버튼 클릭 이벤트
    stopBtn.addEventListener('click', () => {
        if (webgazer) webgazer.pause();
        gazeDot.style.display = 'none';
        isRunning = false;
        status.textContent = "⏹️ 멈췄습니다.";
    });

    // 캘리브레이션 (클릭 시 학습)
    document.addEventListener('click', (event) => {
        if (isRunning && webgazer.isReady()) {
            webgazer.recordScreenPosition(event.clientX, event.clientY, 'click');
        }
    });
});