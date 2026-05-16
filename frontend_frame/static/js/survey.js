/* ── 설문 문항 ──
   각 옵션의 score: 0(낮음) ~ 2(높음)
   총점 0~3 → 초등 / 4~7 → 중등 / 8~10 → 고등
*/
const QUESTIONS = [
    {
        text: '평소에 책이나 긴 글을 얼마나 자주 읽나요?',
        options: [
            { label: '거의 읽지 않는다',       score: 0 },
            { label: '한 달에 1~2번 정도',      score: 1 },
            { label: '일주일에 1번 이상',        score: 2 },
        ],
    },
    {
        text: '긴 글을 읽을 때 집중하기가 얼마나 어려운가요?',
        options: [
            { label: '매우 어렵다 — 금방 딴 생각이 난다', score: 0 },
            { label: '가끔 어렵다 — 중간에 집중이 풀린다', score: 1 },
            { label: '잘 집중할 수 있다',                  score: 2 },
        ],
    },
    {
        text: '읽은 내용을 얼마나 잘 이해하고 기억하나요?',
        options: [
            { label: '이해가 잘 안 되고 기억도 잘 못한다', score: 0 },
            { label: '대략적인 내용은 파악한다',            score: 1 },
            { label: '세부 내용까지 파악하고 기억한다',     score: 2 },
        ],
    },
    {
        text: '같은 문장이나 단락을 다시 읽는 일이 얼마나 자주 있나요?',
        options: [
            { label: '자주 그렇다 — 대부분의 문장을 다시 읽는다', score: 0 },
            { label: '가끔 그렇다 — 어려운 부분만 다시 읽는다',   score: 1 },
            { label: '거의 없다 — 한 번에 이해하며 읽는다',        score: 2 },
        ],
    },
    {
        text: '한 번에 집중해서 읽을 수 있는 분량은 어느 정도인가요?',
        options: [
            { label: '한 페이지 이하 (짧은 문단 수준)',  score: 0 },
            { label: '5~10페이지 (짧은 단편 수준)',       score: 1 },
            { label: '20페이지 이상 (여러 챕터 수준)',    score: 2 },
        ],
    },
];

const LEVELS = [
    { name: '초등', min: 0,  max: 3,  icon: '🌱', desc: '짧고 쉬운 글부터 차근차근 시작해요. 간단한 문장으로 독서 습관을 길러나가겠습니다.' },
    { name: '중등', min: 4,  max: 7,  icon: '📖', desc: '기본기는 갖춰져 있어요. 중간 길이의 글을 통해 집중력과 독해력을 키워나가겠습니다.' },
    { name: '고등', min: 8,  max: 10, icon: '🏆', desc: '독서 습관이 잘 잡혀 있어요. 긴 글과 복잡한 구조의 텍스트에 도전해보겠습니다.' },
];

/* ── 상태 ── */
let current  = 0;
const answers = new Array(QUESTIONS.length).fill(null);

const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const qNum         = document.getElementById('q-num');
const questionText = document.getElementById('question-text');
const optionsWrap  = document.getElementById('options-wrap');
const prevBtn      = document.getElementById('prev-btn');
const nextBtn      = document.getElementById('next-btn');

/* ── 초기 렌더 ── */
renderQuestion(0);

/* ── 이전 / 다음 버튼 ── */
prevBtn.addEventListener('click', () => { if (current > 0) renderQuestion(current - 1); });
nextBtn.addEventListener('click', () => {
    if (current < QUESTIONS.length - 1) {
        renderQuestion(current + 1);
    } else {
        showResult();
    }
});

/* ── 질문 렌더링 ── */
function renderQuestion(index) {
    current = index;
    const q = QUESTIONS[index];
    const isLast = index === QUESTIONS.length - 1;

    qNum.textContent         = `질문 ${index + 1}`;
    questionText.textContent = q.text;
    progressText.textContent = `${index + 1} / ${QUESTIONS.length}`;
    progressFill.style.width = `${((index + 1) / QUESTIONS.length) * 100}%`;

    optionsWrap.innerHTML = q.options.map((opt, i) => `
        <button class="survey-option ${answers[index] === i ? 'selected' : ''}"
                data-idx="${i}">
            <span class="option-circle"><span class="option-check">✓</span></span>
            ${opt.label}
        </button>
    `).join('');

    optionsWrap.querySelectorAll('.survey-option').forEach(btn => {
        btn.addEventListener('click', () => {
            answers[index] = parseInt(btn.dataset.idx);
            optionsWrap.querySelectorAll('.survey-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            nextBtn.disabled = false;
        });
    });

    prevBtn.disabled = index === 0;
    nextBtn.disabled = answers[index] === null;
    nextBtn.textContent = isLast ? '결과 보기 →' : '다음 →';

    /* 카드 재애니메이션 */
    const card = document.getElementById('survey-card');
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = '';
}

/* ── 결과 계산 및 표시 ── */
function showResult() {
    const totalScore = answers.reduce((sum, ansIdx, qIdx) => {
        return sum + (ansIdx !== null ? QUESTIONS[qIdx].options[ansIdx].score : 0);
    }, 0);

    const level = LEVELS.find(l => totalScore >= l.min && totalScore <= l.max);

    document.getElementById('survey-screen').style.display = 'none';
    document.getElementById('result-screen').style.display = 'flex';

    document.getElementById('result-icon').textContent    = level.icon;
    document.getElementById('result-desc').textContent    = level.desc;
    document.getElementById('result-score').textContent   = `총점 ${totalScore}점 / 10점`;

    const badge = document.getElementById('result-badge');
    badge.textContent = `${level.name} 레벨`;
    badge.className   = `result-level-badge lv-${level.name}`;

    const bar = document.getElementById('result-bar-fill');
    bar.className = `result-bar-fill lv-${level.name}`;
    setTimeout(() => { bar.style.width = `${(totalScore / 10) * 100}%`; }, 100);

    // [TODO] 실제 API 연결
    // await fetch('/api/db/users/{id}', {
    //     method:  'PATCH',
    //     headers: { 'Content-Type': 'application/json' },
    //     body:    JSON.stringify({ level: level.name }),
    // });
}
