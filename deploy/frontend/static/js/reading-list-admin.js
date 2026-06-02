const USER_NICK   = localStorage.getItem('user_nick')  || '개발자';
let   USER_LEVEL  = localStorage.getItem('user_level') || '중등';
const USER_ID     = localStorage.getItem('user_id');
let BOOKS         = [];
let READ_BOOK_IDS = new Set();

async function syncLevel() {
    if (!USER_ID) return;
    try {
        const res = await fetch(`/api/db/users/${USER_ID}/level-history`);
        if (!res.ok) return;
        const history = await res.json();
        if (!history.length) return;
        const latest = history.reduce((a, b) =>
            new Date(a.tested_at) > new Date(b.tested_at) ? a : b
        );
        localStorage.setItem('user_level', latest.level_result);
        USER_LEVEL = latest.level_result;
    } catch {}
}

async function loadBooks() {
    await syncLevel();
    const [booksRes, completedRes] = await Promise.all([
        fetch('/api/db/books'),
        USER_ID ? fetch(`/api/db/users/${USER_ID}/completed-books`) : Promise.resolve(null),
    ]);
    BOOKS = await booksRes.json();
    if (completedRes?.ok) {
        const completed = await completedRes.json();
        READ_BOOK_IDS = new Set(completed.map(c => c.book_id));
    }
    setupBanner();
    renderCurriculum();
    renderAllBooks('all');
    renderReadBooks();
    setupTabs();
    setupFilters();
}

function setupBanner() {
    document.getElementById('banner-greeting').textContent = `안녕하세요, ${USER_NICK}님!`;
    document.getElementById('banner-level-desc').textContent =
        `현재 레벨: ${USER_LEVEL} | 레벨에 맞는 커리큘럼을 확인하세요`;
    const badge = document.getElementById('level-badge');
    badge.textContent = USER_LEVEL;
    badge.classList.add(`lv-${USER_LEVEL}`);
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
        });
    });
}

function setupFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderAllBooks(btn.dataset.level);
        });
    });
}

function renderCurriculum() {
    const grid  = document.getElementById('curriculum-grid');
    const books = BOOKS.filter(b => b.difficulty === USER_LEVEL && !READ_BOOK_IDS.has(b.id));
    grid.innerHTML = books.length
        ? books.map((b, i) => bookCardHTML(b, i + 1, true)).join('')
        : '<div class="empty-state">커리큘럼 도서가 없습니다.<br>전체 도서 목록에서 직접 선택하세요.</div>';
    bindStartButtons(grid);
}

function renderAllBooks(level) {
    const grid  = document.getElementById('all-grid');
    const filtered = level === 'all' ? BOOKS : BOOKS.filter(b => b.difficulty === level);
    const books = filtered.filter(b => !READ_BOOK_IDS.has(b.id));
    grid.innerHTML = books.length
        ? books.map(b => bookCardHTML(b, null, false)).join('')
        : '<div class="empty-state">해당 레벨의 도서가 없습니다.</div>';
    bindStartButtons(grid);
}

function renderReadBooks() {
    const grid  = document.getElementById('read-grid');
    const books = BOOKS.filter(b => READ_BOOK_IDS.has(b.id));
    grid.innerHTML = books.length
        ? books.map(b => bookCardHTML(b, null, false, true)).join('')
        : '<div class="empty-state">아직 완독한 도서가 없습니다.</div>';
    bindStartButtons(grid);
}

function bookCardHTML(book, num, isCurriculum, isRead = false) {
    const numTag  = num    ? `<span class="book-num">${num}번째</span>` : '';
    const readTag = isRead ? `<span class="book-read-badge">✅ 완독</span>` : '';
    return `
        <div class="book-card ${isCurriculum ? 'curriculum' : ''} ${isRead ? 'read' : ''}">
            <div class="book-card-top">
                ${numTag}
                ${readTag}
                <span class="book-level lv-${book.difficulty}">${book.difficulty}</span>
            </div>
            <div class="book-title">${book.title}</div>
            <div class="book-genre">${book.genre || ''}</div>
            <button class="book-card-btn" data-id="${book.id}">독서 시작 →</button>
            <button class="book-card-btn-dev" data-id="${book.id}">개발자 모드로 시작</button>
            <button class="book-card-btn-del" data-id="${book.id}">삭제</button>
        </div>
    `;
}

function bindStartButtons(container) {
    container.querySelectorAll('.book-card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            location.href = `/reading-admin.html?book_id=${btn.dataset.id}`;
        });
    });
    container.querySelectorAll('.book-card-btn-dev').forEach(btn => {
        btn.addEventListener('click', () => {
            location.href = `/reading-admin.html?book_id=${btn.dataset.id}&dev=true`;
        });
    });
    container.querySelectorAll('.book-card-btn-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('정말 삭제하시겠습니까?')) return;
            try {
                const res = await fetch(`/api/db/books/${btn.dataset.id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error();
                await loadBooks();
            } catch {
                alert('삭제 중 오류가 발생했습니다.');
            }
        });
    });
}

loadBooks();
