const USER_NICK = localStorage.getItem('user_nick') || sessionStorage.getItem('user_nick') || '사용자';
const USER_ID   = localStorage.getItem('user_id')   || sessionStorage.getItem('user_id');

let BOOKS         = [];
let READ_BOOK_IDS = new Set();

async function loadBooks() {
    const [booksRes, completedRes] = await Promise.all([
        fetch('/api/db/books'),
        USER_ID ? fetch(`/api/db/users/${USER_ID}/completed-books`) : Promise.resolve(null),
    ]);
    BOOKS = await booksRes.json();
    if (completedRes?.ok) {
        const completed = await completedRes.json();
        READ_BOOK_IDS = new Set(completed.map(c => c.book_id));
    }
    document.getElementById('navbar-user').textContent = USER_NICK;
    document.getElementById('banner-greeting').textContent = `안녕하세요, ${USER_NICK}님!`;
    renderAllBooks();
    renderReadBooks();
    setupTabs();
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

function renderAllBooks() {
    const grid  = document.getElementById('all-grid');
    const books = BOOKS.filter(b => !READ_BOOK_IDS.has(b.id));
    grid.innerHTML = books.length
        ? books.map(b => bookCardHTML(b)).join('')
        : '<div class="empty-state">도서가 없습니다.</div>';
    bindStartButtons(grid);
}

function renderReadBooks() {
    const grid  = document.getElementById('read-grid');
    const books = BOOKS.filter(b => READ_BOOK_IDS.has(b.id));
    grid.innerHTML = books.length
        ? books.map(b => bookCardHTML(b, true)).join('')
        : '<div class="empty-state">아직 완독한 도서가 없습니다.</div>';
    bindStartButtons(grid);
}

function bookCardHTML(book, isRead = false) {
    const readTag = isRead ? `<span class="book-read-badge">✅ 완독</span>` : '';
    return `
        <div class="book-card ${isRead ? 'read' : ''}">
            <div class="book-card-top">${readTag}</div>
            <div class="book-title">${book.title}</div>
            <div class="book-genre">${book.genre || ''}</div>
            <button class="book-card-btn" data-id="${book.id}">독서 시작 →</button>
        </div>
    `;
}

function bindStartButtons(container) {
    container.querySelectorAll('.book-card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            location.href = `/reading.html?book_id=${btn.dataset.id}`;
        });
    });
}

loadBooks();
