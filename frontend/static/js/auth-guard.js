(function () {
    const path    = location.pathname;
    const userId  = localStorage.getItem('user_id') || sessionStorage.getItem('user_id');
    const isDev   = userId === '100';

    // 공개 페이지 — 인증 불필요
    const PUBLIC = ['/', '/index.html', '/login.html', '/signup.html'];
    if (PUBLIC.some(p => path === p || path.endsWith(p))) return;

    // 로그인 안 됨 → 로그인 페이지
    if (!userId) {
        location.replace('/login.html');
        return;
    }

    // 개발자 전용 페이지 — 일반 사용자 접근 시 사용자용으로 이동
    const DEV_ONLY = {
        '/reading-admin.html':      '/reading.html',
        '/reading-list-admin.html': '/reading-list.html',
        '/book-write-admin.html':   '/reading-list.html',
    };
    for (const [devPage, redirect] of Object.entries(DEV_ONLY)) {
        if (path.endsWith(devPage) && !isDev) {
            location.replace(redirect);
            return;
        }
    }
})();
