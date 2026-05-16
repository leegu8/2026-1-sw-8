const passwordInput = document.getElementById('password');
const confirmInput  = document.getElementById('password-confirm');
const emailInput    = document.getElementById('email');

/* 비밀번호 강도 업데이트 */
passwordInput.addEventListener('input', () => {
    const pw   = passwordInput.value;
    const bar1 = document.getElementById('bar1');
    const bar2 = document.getElementById('bar2');
    const bar3 = document.getElementById('bar3');
    const hint = document.getElementById('hint-password');

    [bar1, bar2, bar3].forEach(b => (b.className = 'strength-bar'));

    if (!pw) { hint.textContent = ''; return; }

    let strength = 0;
    if (pw.length >= 8)                         strength++;
    if (/[A-Za-z]/.test(pw) && /\d/.test(pw))  strength++;
    if (/[^A-Za-z0-9]/.test(pw))               strength++;

    if (strength === 1) {
        bar1.classList.add('weak');
        setHint(hint, 'error', '약한 비밀번호입니다. 숫자·영문을 섞어주세요.');
    } else if (strength === 2) {
        bar1.classList.add('medium');
        bar2.classList.add('medium');
        hint.className   = 'field-hint';
        hint.style.color = '#f39c12';
        hint.textContent = '보통 강도입니다.';
    } else {
        [bar1, bar2, bar3].forEach(b => b.classList.add('strong'));
        setHint(hint, 'ok', '강한 비밀번호입니다.');
    }
});

/* 비밀번호 확인 일치 여부 */
confirmInput.addEventListener('input', () => {
    const hint = document.getElementById('hint-confirm');
    if (!confirmInput.value) { hint.textContent = ''; return; }

    if (confirmInput.value === passwordInput.value) {
        setHint(hint, 'ok', '✅ 비밀번호가 일치합니다.');
    } else {
        setHint(hint, 'error', '❌ 비밀번호가 일치하지 않습니다.');
    }
});

/* 이메일 형식 검사 */
emailInput.addEventListener('blur', () => {
    const hint = document.getElementById('hint-email');
    if (!emailInput.value) { hint.textContent = ''; return; }

    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value);
    if (valid) {
        setHint(hint, 'ok', '✅ 올바른 이메일 형식입니다.');
    } else {
        setHint(hint, 'error', '❌ 올바른 이메일 형식이 아닙니다.');
    }
});

/* 폼 제출 */
document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const msg      = document.getElementById('status-msg');
    const nickname = document.getElementById('nickname').value.trim();
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm  = confirmInput.value;
    const terms    = document.getElementById('terms').checked;

    if (!nickname || nickname.length < 2) {
        showMsg(msg, 'error', '닉네임을 2자 이상 입력해주세요.');
        return;
    }
    if (!email) {
        showMsg(msg, 'error', '이메일을 입력해주세요.');
        return;
    }
    if (password.length < 8) {
        showMsg(msg, 'error', '비밀번호를 8자 이상 입력해주세요.');
        return;
    }
    if (password !== confirm) {
        showMsg(msg, 'error', '비밀번호가 일치하지 않습니다.');
        return;
    }
    if (!terms) {
        showMsg(msg, 'error', '이용약관에 동의해주세요.');
        return;
    }

    // [TODO] 실제 API 연결
    // const res = await fetch('/api/auth/register', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ email, password, nickname }),
    // });
    // if (!res.ok) {
    //     showMsg(msg, 'error', '이미 사용 중인 이메일입니다.');
    //     return;
    // }

    showMsg(msg, 'success', '✅ 가입 완료! 로그인 페이지로 이동합니다...');
    // [TODO] setTimeout(() => location.href = 'login.html', 900);
});

function setHint(el, type, text) {
    el.className = `field-hint ${type}`;
    el.style.color = '';
    el.textContent = text;
}

function showMsg(el, type, text) {
    el.className = `status-msg ${type}`;
    el.textContent = text;
}
