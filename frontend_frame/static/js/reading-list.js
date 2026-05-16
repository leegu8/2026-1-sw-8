/* ── 목업 도서 데이터 ── */
// [TODO] 실제 API: GET /api/db/texts
const BOOKS = [
    {
        id: 1, level: '초등',
        title: '토끼와 거북이',
        desc: '느리지만 꾸준히 나아가는 거북이의 이야기. 짧고 명확한 문장으로 구성되어 있습니다.',
        time: '약 5분', sentences: 32,
    },
    {
        id: 2, level: '초등',
        title: '혹부리 영감',
        desc: '착한 혹부리 영감과 욕심쟁이 영감의 대비를 통해 정직의 가치를 배웁니다.',
        time: '약 7분', sentences: 45,
    },
    {
        id: 3, level: '중등',
        title: '운수 좋은 날',
        desc: '현진건의 단편소설. 가난한 인력거꾼의 하루를 통해 일제강점기 서민의 삶을 그립니다.',
        time: '약 15분', sentences: 120,
    },
    {
        id: 4, level: '중등',
        title: '소나기',
        desc: '황순원의 단편소설. 소년과 소녀의 순수한 만남과 이별을 서정적으로 담아냈습니다.',
        time: '약 18분', sentences: 145,
    },
    {
        id: 5, level: '고등',
        title: '날개',
        desc: '이상의 단편소설. 식민지 시대 지식인의 자아 상실과 내면 갈등을 실험적 문체로 표현합니다.',
        time: '약 25분', sentences: 200,
    },
    {
        id: 6, level: '고등',
        title: '광장',
        desc: '최인훈의 장편소설 발췌. 분단 시대 지식인의 이념적 방황과 실존적 고뇌를 다룹니다.',
        time: '약 30분', sentences: 240,
    },
];

/* ── 사용자 레벨 (로그인 후 응답값) ── */
// [TODO] 실제 로그인 응답에서 level 가져오기
const USER_LEVEL = '중등';

/* ── 초기화 ── */
setupBanner();
renderCurriculum();
renderAllBooks('all');
setupTabs();
setupFilters();

function setupBanner() {
    document.getElementById('banner-greeting').textContent = `안녕하세요!`;
    document.getElementById('banner-level-desc').textContent =
        `현재 레벨: ${USER_LEVEL} | 레벨에 맞는 커리큘럼을 확인하세요`;

    const badge = document.getElementById('level-badge');
    badge.textContent = USER_LEVEL;
    badge.classList.add(`lv-${USER_LEVEL}`);
}

/* ── 탭 전환 ── */
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

/* ── 레벨 필터 ── */
function setupFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderAllBooks(btn.dataset.level);
        });
    });
}

/* ── 커리큘럼: 현재 레벨 도서만 순서대로 ── */
function renderCurriculum() {
    const grid  = document.getElementById('curriculum-grid');
    const books = BOOKS.filter(b => b.level === USER_LEVEL);

    grid.innerHTML = books.length
        ? books.map((b, i) => bookCardHTML(b, i + 1, true)).join('')
        : '<div class="empty-state">커리큘럼 도서가 없습니다.<br>전체 도서 목록에서 직접 선택하세요.</div>';

    bindStartButtons(grid);
}

/* ── 전체 목록: 레벨 필터 적용 ── */
function renderAllBooks(level) {
    const grid  = document.getElementById('all-grid');
    const books = level === 'all' ? BOOKS : BOOKS.filter(b => b.level === level);

    grid.innerHTML = books.length
        ? books.map(b => bookCardHTML(b, null, false)).join('')
        : '<div class="empty-state">해당 레벨의 도서가 없습니다.</div>';

    bindStartButtons(grid);
}

/* ── 카드 HTML 생성 ── */
function bookCardHTML(book, num, isCurriculum) {
    const numTag = num
        ? `<span class="book-num">${num}번째</span>`
        : '';
    return `
        <div class="book-card ${isCurriculum ? 'curriculum' : ''}">
            <div class="book-card-top">
                ${numTag}
                <span class="book-level lv-${book.level}">${book.level}</span>
            </div>
            <div class="book-title">${book.title}</div>
            <div class="book-desc">${book.desc}</div>
            <div class="book-meta">
                <span>⏱ ${book.time}</span>
                <span>📝 ${book.sentences}문장</span>
            </div>
            <button class="book-card-btn" data-id="${book.id}">독서 시작 →</button>
        </div>
    `;
}

/* ── "독서 시작" 버튼 이벤트 ── */
function bindStartButtons(container) {
    container.querySelectorAll('.book-card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const bookId = btn.dataset.id;
            // [TODO] 세션 생성 API: POST /api/db/sessions { user_id, text_id, calibration_id }
            // location.href = `reading.html?book_id=${bookId}`;
            location.href = `reading.html`;
        });
    });
}
