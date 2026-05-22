document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const msg      = document.getElementById('status-msg');
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        showMsg(msg, 'error', '이메일과 비밀번호를 모두 입력해주세요.');
        return;
    }

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            showMsg(msg, 'error', '이메일 또는 비밀번호가 올바르지 않습니다.');
            return;
        }

        const user = await res.json();
        localStorage.setItem('user_id',    user.id);
        localStorage.setItem('user_email', user.email);
        localStorage.setItem('user_nick',  user.nickname);

        fetch('/api/db/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id }),
        }).catch(() => {});

        showMsg(msg, 'success', '✅ 로그인 성공! 이동합니다...');
        setTimeout(() => location.href = '/home.html', 800);

    } catch {
        showMsg(msg, 'error', '서버 연결 오류가 발생했습니다.');
    }
});

function showMsg(el, type, text) {
    el.className = `status-msg ${type}`;
    el.textContent = text;
}
