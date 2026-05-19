const form       = document.getElementById('book-form');
const contentEl  = document.getElementById('content');
const wordCount  = document.getElementById('word-count');
const msgEl      = document.getElementById('msg');
const submitBtn  = document.getElementById('submit-btn');

// 글자 수 실시간 표시
contentEl.addEventListener('input', () => {
    wordCount.textContent = contentEl.value.length + '자';
});

function showMsg(text, type) {
    msgEl.textContent = text;
    msgEl.className   = 'msg ' + type;
    msgEl.style.display = 'block';
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title      = document.getElementById('title').value.trim();
    const difficulty = document.getElementById('difficulty').value;
    const genre      = document.getElementById('genre').value;
    const content    = contentEl.value.trim();

    if (!title || !difficulty || !content) {
        showMsg('제목, 난이도, 본문은 필수 항목입니다.', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '등록 중...';

    try {
        const res = await fetch('/api/db/texts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, difficulty, genre, body: content }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || `오류 ${res.status}`);
        }

        showMsg('도서가 등록되었습니다.', 'success');
        form.reset();
        wordCount.textContent = '0자';

    } catch (err) {
        showMsg(err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '등록하기';
    }
});
