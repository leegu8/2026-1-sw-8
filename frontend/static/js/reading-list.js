const USER_LEVEL = localStorage.getItem('user_level') || '중등';

let BOOKS = [];

async function loadBooks() {
    const res = await fetch('/static/textdate/books.json');
    BOOKS = await res.json();
    setupBanner();
    renderCurriculum();
    renderAllBooks('all');
    setupTabs();
    setupFilters();
}

function setupBanner() {
    document.getElementById('banner-greeting').textContent = '안녕하세요!';
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
    const books = BOOKS.filter(b => b.difficulty === USER_LEVEL);
    grid.innerHTML = books.length
        ? books.map((b, i) => bookCardHTML(b, i + 1, true)).join('')
        : '<div class="empty-state">커리큘럼 도서가 없습니다.<br>전체 도서 목록에서 직접 선택하세요.</div>';
    bindStartButtons(grid);
}

function renderAllBooks(level) {
    const grid  = document.getElementById('all-grid');
    const books = level === 'all' ? BOOKS : BOOKS.filter(b => b.difficulty === level);
    grid.innerHTML = books.length
        ? books.map(b => bookCardHTML(b, null, false)).join('')
        : '<div class="empty-state">해당 레벨의 도서가 없습니다.</div>';
    bindStartButtons(grid);
}

function bookCardHTML(book, num, isCurriculum) {
    const numTag = num ? `<span class="book-num">${num}번째</span>` : '';
    return `
        <div class="book-card ${isCurriculum ? 'curriculum' : ''}">
            <div class="book-card-top">
                ${numTag}
                <span class="book-level lv-${book.difficulty}">${book.difficulty}</span>
            </div>
            <div class="book-title">${book.title}</div>
            <div class="book-genre">${book.genre || ''}</div>
            <button class="book-card-btn" data-id="${book.id}">독서 시작 →</button>
            <button class="book-card-btn-dev" data-id="${book.id}">🖱 개발자 모드로 시작</button>
        </div>
    `;
}

function bindStartButtons(container) {
    container.querySelectorAll('.book-card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            location.href = `/reading.html?book_id=${btn.dataset.id}`;
        });
    });
    container.querySelectorAll('.book-card-btn-dev').forEach(btn => {
        btn.addEventListener('click', () => {
            location.href = `/reading.html?book_id=${btn.dataset.id}&dev=true`;
        });
    });
}

loadBooks();
