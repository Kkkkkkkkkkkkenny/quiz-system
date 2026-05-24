const state = {
  questions: [],
  currentIndex: 0,
  isAnswered: false,
  answeredCount: 0,
  datasets: [],
  currentDataset: null,
  title: '知识点问答',
  subtitle: ''
};

async function init() {
  await loadDatasets();

  const params = new URLSearchParams(window.location.search);

  let file = params.get('file');
  const setId = params.get('set');

  if (file) {
    await loadFile(file);
  } else if (setId) {
    const ds = state.datasets.find(d => d.id === setId);
    if (ds) await loadFile(ds.file);
    else await loadDefault();
  } else {
    await loadDefault();
  }

  populateSelector();
}

async function loadDatasets() {
  try {
    const res = await fetch('datasets.json');
    state.datasets = await res.json();
  } catch {
    state.datasets = [];
  }
}

async function loadDefault() {
  const saved = localStorage.getItem('quizDataset');
  if (saved) {
    const ds = state.datasets.find(d => d.id === saved);
    if (ds) {
      await loadFile(ds.file);
      return;
    }
  }

  if (state.datasets.length > 0) {
    await loadFile(state.datasets[0].file);
  } else {
    await loadFile('data.json');
  }
}

async function loadFile(path) {
  try {
    const res = await fetch(path);
    const data = await res.json();

    if (Array.isArray(data)) {
      state.questions = data;
      state.title = '知识点问答';
      state.subtitle = '';
      state.currentDataset = null;
    } else if (data.questions) {
      state.questions = data.questions;
      state.title = data.title || '知识点问答';
      state.subtitle = data.subtitle || '';
      state.currentDataset = data.id || null;
    } else {
      throw new Error('无效的数据格式');
    }

    state.currentIndex = 0;
    state.isAnswered = false;
    state.answeredCount = 0;
    state.questions.forEach(q => delete q._answered);

    updateHeader();
    renderQuestion();
  } catch (err) {
    document.getElementById('questionText').textContent =
      `加载失败：${err.message}，请检查文件路径是否正确。`;
    document.getElementById('topicBadge').textContent = '错误';
    document.getElementById('counter').textContent = '- / -';
  }
}

function populateSelector() {
  const sel = document.getElementById('datasetSelect');
  if (!sel) return;

  sel.innerHTML = '';

  // group by subject
  const groups = {};
  for (const ds of state.datasets) {
    const key = ds.subject || '其他';
    if (!groups[key]) groups[key] = [];
    groups[key].push(ds);
  }

  for (const [subject, items] of Object.entries(groups)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = subject;
    for (const ds of items) {
      const opt = document.createElement('option');
      opt.value = ds.id;
      opt.textContent = ds.title;
      optgroup.appendChild(opt);
    }
    sel.appendChild(optgroup);
  }

  // select current
  const id = state.currentDataset;
  if (id && state.datasets.some(d => d.id === id)) {
    sel.value = id;
  }

  sel.addEventListener('change', onDatasetChange);
}

function onDatasetChange() {
  const id = document.getElementById('datasetSelect').value;
  const ds = state.datasets.find(d => d.id === id);
  if (!ds) return;
  localStorage.setItem('quizDataset', id);
  loadFile(ds.file);
}

function updateHeader() {
  const titleEl = document.getElementById('mainTitle');
  const subtitleEl = document.getElementById('mainSubtitle');

  if (titleEl) titleEl.textContent = state.title;
  if (subtitleEl) {
    subtitleEl.textContent = state.subtitle;
    subtitleEl.style.display = state.subtitle ? '' : 'none';
  }

  document.title = state.title;
}

function renderQuestion() {
  if (!state.questions.length) return;

  const q = state.questions[state.currentIndex];
  document.getElementById('topicBadge').textContent = q.topic || '通用';
  document.getElementById('questionText').textContent = q.question;

  const answerDiv = document.getElementById('answerText');
  answerDiv.innerHTML = formatAnswer(q.answer);

  document.getElementById('answerArea').classList.remove('visible');
  document.getElementById('revealBtn').style.display = 'block';
  document.getElementById('revealBtn').textContent = '显示答案';
  state.isAnswered = false;

  updateCounter();
  updateProgress();
  updateProgressText();
}

function formatAnswer(text) {
  var parts = [], buf = '', inCode = false;
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.trim().startsWith('```')) {
      if (inCode) {
        parts.push({ t: 'code', c: buf });
        buf = '';
        inCode = false;
      } else {
        if (buf) parts.push({ t: 'text', c: buf });
        buf = '';
        inCode = true;
      }
      continue;
    }
    buf += line + '\n';
  }
  if (inCode) parts.push({ t: 'code', c: buf });
  else if (buf) parts.push({ t: 'text', c: buf });

  var out = [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].t === 'code') {
      out.push('<pre><code>' + escHtml(parts[i].c.replace(/\n$/, '')) + '</code></pre>');
    } else {
      out.push(renderBlocks(parts[i].c));
    }
  }
  return out.join('\n');
}

function renderBlocks(text) {
  var lines = text.split('\n');
  var out = [];
  var inTable = false, tableRows = [];
  var inList = false, listTag = '', listItems = [];

  function flushTable() {
    if (!inTable) return;
    out.push('<table>');
    for (var r = 0; r < tableRows.length; r++) {
      var cells = tableRows[r].split('|');
      // 去掉首尾空单元格
      if (cells.length > 0 && cells[0].trim() === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
      // 跳过分隔行 (|---|)
      if (r === 1 && /^[-:\s]+$/.test(cells[0].trim())) continue;
      var tag = r === 0 ? 'th' : 'td';
      out.push('<tr>');
      for (var c = 0; c < cells.length; c++) {
        out.push('<' + tag + '>' + renderInline(cells[c].trim()) + '</' + tag + '>');
      }
      out.push('</tr>');
    }
    out.push('</table>');
    inTable = false;
    tableRows = [];
  }

  function flushList() {
    if (!inList) return;
    out.push('<' + listTag + '>' + listItems.join('') + '</' + listTag + '>');
    inList = false;
    listItems = [];
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();

    if (trimmed === '') {
      flushTable();
      flushList();
      continue;
    }

    // Table
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList();
      // 如果是分隔行，标记但保留
      tableRows.push(trimmed);
      if (!inTable) {
        inTable = true;
        // 检查下一行是否是分隔行
        if (i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1].trim())) {
          // 表头行，不用特殊处理
        }
      }
      continue;
    }

    // Unordered list
    var ulMatch = trimmed.match(/^[-*+]\s(.+)/);
    if (ulMatch) {
      flushTable();
      if (!inList || listTag !== 'ul') { flushList(); inList = true; listTag = 'ul'; }
      listItems.push('<li>' + renderInline(ulMatch[1]) + '</li>');
      continue;
    }

    // Ordered list
    var olMatch = trimmed.match(/^\d+\.\s(.+)/);
    if (olMatch) {
      flushTable();
      if (!inList || listTag !== 'ol') { flushList(); inList = true; listTag = 'ol'; }
      listItems.push('<li>' + renderInline(olMatch[1]) + '</li>');
      continue;
    }

    // Paragraph
    flushTable();
    flushList();
    out.push('<p>' + renderInline(line) + '</p>');
  }

  flushTable();
  flushList();
  return out.join('\n');
}

function renderInline(text) {
  // 必须优先转义 HTML
  var s = escHtml(text);
  // 行内代码
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 粗体 **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 换行
  s = s.replace(/\n/g, '<br>');
  return s;
}

function revealAnswer() {
  if (state.isAnswered) return;
  document.getElementById('answerArea').classList.add('visible');
  document.getElementById('revealBtn').style.display = 'none';
  state.isAnswered = true;
  if (!state.questions[state.currentIndex]._answered) {
    state.questions[state.currentIndex]._answered = true;
    state.answeredCount++;
  }
  updateProgress();
  updateProgressText();
}

function nextQuestion() {
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex++;
    renderQuestion();
  }
}

function prevQuestion() {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    renderQuestion();
  }
}

function randomQuestion() {
  let newIndex;
  do {
    newIndex = Math.floor(Math.random() * state.questions.length);
  } while (newIndex === state.currentIndex && state.questions.length > 1);
  state.currentIndex = newIndex;
  renderQuestion();
}

function updateCounter() {
  document.getElementById('counter').textContent =
    `${state.currentIndex + 1} / ${state.questions.length}`;
}

function updateProgress() {
  const pct = state.questions.length
    ? (state.answeredCount / state.questions.length) * 100
    : 0;
  document.getElementById('progressFill').style.width = `${pct}%`;
}

function updateProgressText() {
  const remaining = state.questions.length - state.answeredCount;
  document.getElementById('progressText').textContent =
    `已掌握 ${state.answeredCount} 题，还剩 ${remaining} 题待复习`;
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('revealBtn').addEventListener('click', revealAnswer);
  document.getElementById('nextBtn').addEventListener('click', nextQuestion);
  document.getElementById('prevBtn').addEventListener('click', prevQuestion);
  document.getElementById('randomBtn').addEventListener('click', randomQuestion);

  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      if (!state.isAnswered) {
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
