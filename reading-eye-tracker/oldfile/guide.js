// =====================================================
// guide.js - 사용 안내 페이지 스크립트
// 역할: 이 페이지에 머무는 동안 WebGazer가 백그라운드에서
//       마우스 움직임을 통해 보정 데이터를 추가로 쌓는다.
//
// 핵심 아이디어:
//   WebGazer는 기본적으로 마우스 커서 위치를 "지금 이 곳을
//   보고 있다"고 간주하여 자동으로 학습한다.
//   calibration.html에서 명시적 보정을 했다면, 이 페이지에서
//   자연스러운 마우스 이동으로 보정 품질을 더 높일 수 있다.
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('status');

    try {
        // 이전 페이지(calibration.html)와 동일한 설정으로 WebGazer를 재시작
        webgazer.setRegression('ridge');

        // true: localStorage에 저장된 보정 데이터를 불러와서 이어서 사용
        // → calibration.html에서 쌓은 데이터가 여기서도 유지된다
        webgazer.saveDataAcrossSessions(true);

        await webgazer.begin();

        // 비디오 미리보기와 기본 시선 점은 숨김 (사용자에게 방해가 되므로)
        webgazer.showVideoPreview(false)
                .showPredictionPoints(false);

        // ※ removeMouseEventListeners()를 호출하지 않음 ※
        // → 마우스 이동/클릭 시 WebGazer가 자동으로 보정 데이터를 추가 수집
        // → 사용자가 이 페이지를 읽는 동안 자연스럽게 보정 품질이 향상됨

        status.textContent = '✅ 시선 보정 데이터 수집 중 (마우스를 자유롭게 움직여 주세요)';

    } catch (err) {
        status.textContent = '⚠ WebGazer 연결 실패: ' + err.message;
    }

    // "독서 시작하기" 버튼 클릭 시 독서 페이지로 이동
    document.getElementById('reading-btn').addEventListener('click', () => {
        window.location.href = 'reading.html';
    });
});
