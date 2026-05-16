const listEl      = document.getElementById('camera-list');
const previewImg  = document.getElementById('preview-img');
const previewPh   = document.getElementById('preview-placeholder');
const previewHint = document.getElementById('preview-hint');
const nextBtn     = document.getElementById('next-btn');
const statusMsg   = document.getElementById('status-msg');

let selectedIndex = null;

loadCameras();
document.getElementById('refresh-btn').addEventListener('click', loadCameras);

async function loadCameras() {
    listEl.innerHTML = '<p class="loading-text">불러오는 중...</p>';
    selectedIndex    = null;
    nextBtn.disabled = true;
    previewImg.style.display = 'none';
    previewPh.style.display  = 'flex';
    previewHint.textContent  = '';

    try {
        // [TODO] 실제 API 연결
        // const res     = await fetch('/api/webcam/scan');
        // const cameras = await res.json();

        const cameras = [
            { index: 0, name: '기본 웹캠 (0번)' },
            { index: 1, name: '외장 카메라 (1번)' },
        ];

        renderList(cameras);
    } catch {
        listEl.innerHTML = '<p class="error-text">카메라 목록을 불러올 수 없습니다.</p>';
    }
}

function renderList(cameras) {
    if (!cameras.length) {
        listEl.innerHTML = '<p class="error-text">연결된 카메라가 없습니다.</p>';
        return;
    }

    listEl.innerHTML = cameras.map(cam => `
        <label class="camera-item" data-index="${cam.index}">
            <input type="radio" name="camera" value="${cam.index}" />
            <span class="camera-name">${cam.name}</span>
        </label>
    `).join('');

    listEl.querySelectorAll('input[name="camera"]').forEach(radio => {
        radio.addEventListener('change', () => selectCamera(parseInt(radio.value)));
    });
}

async function selectCamera(index) {
    selectedIndex = index;

    document.querySelectorAll('.camera-item').forEach(el => {
        el.classList.toggle('selected', parseInt(el.dataset.index) === index);
    });

    previewPh.style.display  = 'none';
    previewImg.style.display = 'block';
    previewHint.textContent  = '웹캠 시작 중...';

    try {
        // [TODO] 실제 API 연결
        // await fetch('/api/webcam/start', {
        //     method:  'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body:    JSON.stringify({ camera_index: index }),
        // });
        // previewImg.src = '/api/webcam/preview';

        previewHint.textContent = '✅ 카메라가 선택되었습니다.';
        nextBtn.disabled        = false;
    } catch {
        previewHint.textContent = '❌ 카메라를 시작할 수 없습니다.';
        showMsg(statusMsg, 'error', '웹캠 연결에 실패했습니다. 다른 카메라를 선택해보세요.');
    }
}

nextBtn.addEventListener('click', () => {
    if (selectedIndex === null) return;
    location.href = 'calibration.html';
});

function showMsg(el, type, text) {
    el.className    = `status-msg ${type}`;
    el.textContent  = text;
}
