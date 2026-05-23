let questions = [];
let currentIndex = 0;
let isAnswered = false;
let answeredCount = 0;

async function loadQuestions() {
  try {
    const res = await fetch('data.json');
    questions = await res.json();
    renderQuestion();
  } catch (err) {
    document.getElementById('questionText').textContent = '数据加载失败，请检查 data.json 文件是否存在。';
  }
}

function renderQuestion() {
  if (!questions.length) return;

  const q = questions[currentIndex];
  document.getElementById('topicBadge').textContent = q.topic;
  document.getElementById('questionText').textContent = q.question;

  const answerDiv = document.getElementById('answerText');
  answerDiv.innerHTML = formatAnswer(q.answer);

  document.getElementById('answerArea').classList.remove('visible');
  document.getElementById('revealBtn').style.display = 'block';
  document.getElementById('revealBtn').textContent = '显示答案';
  isAnswered = false;

  updateCounter();
  updateProgress();
  updateProgressText();
}

function formatAnswer(text) {
  const lines = text.split('\n');
  let inCode = false;
  let result = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      result.push(inCode ? '</code>' : '<code>');
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      result.push(line + '\n');
      continue;
    }

    if (trimmed === '') {
      result.push('');
      continue;
    }

    if (trimmed.startsWith('- ')) {
      result.push(`<li>${escHtml(trimmed.slice(2))}</li>`);
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      result.push(`<li>${escHtml(trimmed.replace(/^\d+\.\s/, ''))}</li>`);
      continue;
    }

    result.push(`<p>${escHtml(line)}</p>`);
  }

  if (inCode) result.push('</code>');
  return result.join('\n');
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function revealAnswer() {
  if (isAnswered) return;
  document.getElementById('answerArea').classList.add('visible');
  document.getElementById('revealBtn').style.display = 'none';
  isAnswered = true;
  if (!questions[currentIndex]._answered) {
    questions[currentIndex]._answered = true;
    answeredCount++;
  }
  updateProgress();
  updateProgressText();
}

function nextQuestion() {
  if (currentIndex < questions.length - 1) {
    currentIndex++;
    renderQuestion();
  }
}

function prevQuestion() {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion();
  }
}

function randomQuestion() {
  let newIndex;
  do {
    newIndex = Math.floor(Math.random() * questions.length);
  } while (newIndex === currentIndex && questions.length > 1);
  currentIndex = newIndex;
  renderQuestion();
}

function updateCounter() {
  document.getElementById('counter').textContent = `${currentIndex + 1} / ${questions.length}`;
}

function updateProgress() {
  const pct = (answeredCount / questions.length) * 100;
  document.getElementById('progressFill').style.width = `${pct}%`;
}

function updateProgressText() {
  const remaining = questions.length - answeredCount;
  document.getElementById('progressText').textContent = `已掌握 ${answeredCount} 题，还剩 ${remaining} 题待复习`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadQuestions();

  document.getElementById('revealBtn').addEventListener('click', revealAnswer);
  document.getElementById('nextBtn').addEventListener('click', nextQuestion);
  document.getElementById('prevBtn').addEventListener('click', prevQuestion);
  document.getElementById('randomBtn').addEventListener('click', randomQuestion);

  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      if (!isAnswered) {
        e.preventDefault();
        revealAnswer();
      } else if (e.key === ' ') {
        e.preventDefault();
        nextQuestion();
      }
    }
    if (e.key === 'ArrowRight') nextQuestion();
    if (e.key === 'ArrowLeft') prevQuestion();
  });
});
