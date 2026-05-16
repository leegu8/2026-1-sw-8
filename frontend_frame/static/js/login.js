document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const msg      = document.getElementById('status-msg');
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        showMsg(msg, 'error', '이메일과 비밀번호를 모두 입력해주세요.');
        return;
    }

    // [TODO] 실제 API 연결
    // const res = await fetch('/api/auth/login', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ email, password }),
    // });
    // if (!res.ok) {
    //     showMsg(msg, 'error', '이메일 또는 비밀번호가 올바르지 않습니다.');
    //     return;
    // }

    showMsg(msg, 'success', '✅ 로그인 성공! 메인 페이지로 이동합니다...');
    // [TODO] setTimeout(() => location.href = 'start.html', 800);
});

function showMsg(el, type, text) {
    el.className = `status-msg ${type}`;
    el.textContent = text;
}
