var state = {
  questions: [],
  currentIndex: 0,
  isAnswered: false,
  answeredCount: 0,
  datasets: [],
  currentDataset: null,
  title: '知识点问答',
  subtitle: '',
  bookmarkedIds: []
};

function init() {
  loadBookmarks();
  loadDatasets().then(function() {
    var params = new URLSearchParams(window.location.search);
    var file = params.get('file');
    var setId = params.get('set');

    if (file) {
      loadFile(file);
    } else if (setId) {
      var ds = findDataset(setId);
      if (ds) loadFile(ds.file);
      else loadDefault();
    } else {
      loadDefault();
    }
  }).then(function() {
    populateSelector();
  });
}

function findDataset(id) {
  for (var i = 0; i < state.datasets.length; i++) {
    if (state.datasets[i].id === id) return state.datasets[i];
  }
  return null;
}

function loadDatasets() {
  return fetch('datasets.json').then(function(res) {
    return res.json();
  }).then(function(data) {
    state.datasets = data;
  }).catch(function() {
    state.datasets = [];
  });
}

function loadDefault() {
  var saved = null;
  try { saved = localStorage.getItem('quizDataset'); } catch(e) {}
  if (saved) {
    var ds = findDataset(saved);
    if (ds) {
      return loadFile(ds.file);
    }
  }
  if (state.datasets.length > 0) {
    return loadFile(state.datasets[0].file);
  } else {
    return loadFile('data.json');
  }
}

function getById(id) {
  return document.getElementById(id);
}

/* ====== 收藏功能 ====== */

function loadBookmarks() {
  try {
    var saved = localStorage.getItem('quizBookmarks');
    if (saved) state.bookmarkedIds = JSON.parse(saved);
    if (!Array.isArray(state.bookmarkedIds)) state.bookmarkedIds = [];
  } catch(e) { state.bookmarkedIds = []; }
}

function saveBookmarks() {
  try { localStorage.setItem('quizBookmarks', JSON.stringify(state.bookmarkedIds)); } catch(e) {}
}

function isBookmarked(id) {
  return state.bookmarkedIds.indexOf(id) !== -1;
}

function toggleBookmark() {
  var q = state.questions[state.currentIndex];
  if (!q || q.id == null) return;
  var id = q.id;
  var idx = state.bookmarkedIds.indexOf(id);
  if (idx === -1) {
    state.bookmarkedIds.push(id);
  } else {
    state.bookmarkedIds.splice(idx, 1);
  }
  saveBookmarks();
  updateBookmarkBtn();
  var sidebar = getById('sidebar');
  if (sidebar.classList.contains('open')) buildSidebar();
}

function updateBookmarkBtn() {
  var btn = getById('bookmarkBtn');
  if (!btn) return;
  var q = state.questions[state.currentIndex];
  if (!q || q.id == null) { btn.style.display = 'none'; return; }
  btn.style.display = '';
  if (isBookmarked(q.id)) {
    btn.textContent = '★';
    btn.classList.add('active');
  } else {
    btn.textContent = '☆';
    btn.classList.remove('active');
  }
}

function loadFile(path) {
  loadBookmarks();
  return fetch(path).then(function(res) {
    return res.json();
  }).then(function(data) {
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
    for (var i = 0; i < state.questions.length; i++) {
      delete state.questions[i]._answered;
    }

    updateHeader();
    renderQuestion();
  }).catch(function(err) {
    getById('questionText').textContent = '加载失败：' + err.message + '，请检查文件路径是否正确。';
    getById('topicBadge').textContent = '错误';
    getById('counter').textContent = '- / -';
  });
}

function populateSelector() {
  var sel = getById('datasetSelect');
  if (!sel) return;
  sel.innerHTML = '';

  var groups = {};
  for (var i = 0; i < state.datasets.length; i++) {
    var ds = state.datasets[i];
    var key = ds.subject || '其他';
    if (!groups[key]) groups[key] = [];
    groups[key].push(ds);
  }

  var keys = Object.keys(groups);
  for (var k = 0; k < keys.length; k++) {
    var subject = keys[k];
    var items = groups[subject];
    var optgroup = document.createElement('optgroup');
    optgroup.label = subject;
    for (var j = 0; j < items.length; j++) {
      var opt = document.createElement('option');
      opt.value = items[j].id;
      opt.textContent = items[j].title;
      optgroup.appendChild(opt);
    }
    sel.appendChild(optgroup);
  }

  var id = state.currentDataset;
  if (id && findDataset(id)) {
    sel.value = id;
  }

  sel.addEventListener('change', onDatasetChange);
}

function onDatasetChange() {
  var id = getById('datasetSelect').value;
  var ds = findDataset(id);
  if (!ds) return;
  try { localStorage.setItem('quizDataset', id); } catch(e) {}
  loadFile(ds.file);
}

function updateHeader() {
  var titleEl = getById('mainTitle');
  var subtitleEl = getById('mainSubtitle');

  if (titleEl) titleEl.textContent = state.title;
  if (subtitleEl) {
    subtitleEl.textContent = state.subtitle;
    subtitleEl.style.display = state.subtitle ? '' : 'none';
  }

  document.title = state.title;
}

function renderQuestion() {
  if (!state.questions.length) return;

  var q = state.questions[state.currentIndex];
  getById('topicBadge').textContent = q.topic || '通用';
  getById('questionText').textContent = q.question;

  var answerDiv = getById('answerText');
  answerDiv.innerHTML = formatAnswer(q.answer);

  getById('answerArea').classList.remove('visible');
  getById('revealBtn').style.display = 'block';
  getById('revealBtn').textContent = '显示答案';
  state.isAnswered = false;

  updateCounter();
  updateProgress();
  updateProgressText();
  updateBookmarkBtn();
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatAnswer(text) {
  try {
    var parts = [], buf = '', inCode = false;
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var t = line.trim();
      if (t.indexOf('```') === 0) {
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
  } catch (e) {
    return '<p style="color:red">渲染错误: ' + e.message + '</p><p>' + escHtml(text) + '</p>';
  }
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
      if (cells.length > 0 && cells[0].trim() === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
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
    if (trimmed.indexOf('|') === 0 && trimmed.charAt(trimmed.length - 1) === '|') {
      flushList();
      tableRows.push(trimmed);
      if (!inTable) {
        inTable = true;
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
  var s = escHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

function revealAnswer() {
  if (state.isAnswered) return;
  getById('answerArea').classList.add('visible');
  getById('revealBtn').style.display = 'none';
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
  var newIndex;
  do {
    newIndex = Math.floor(Math.random() * state.questions.length);
  } while (newIndex === state.currentIndex && state.questions.length > 1);
  state.currentIndex = newIndex;
  renderQuestion();
}

function updateCounter() {
  getById('counter').textContent = (state.currentIndex + 1) + ' / ' + state.questions.length;
}

function updateProgress() {
  var pct = state.questions.length ? (state.answeredCount / state.questions.length) * 100 : 0;
  getById('progressFill').style.width = pct + '%';
}

function updateProgressText() {
  var remaining = state.questions.length - state.answeredCount;
  getById('progressText').textContent = '已掌握 ' + state.answeredCount + ' 题，还剩 ' + remaining + ' 题待复习';
}

/* ====== 侧边栏目录（可折叠章节） ====== */

var sidebarCollapsed = {};

function loadSidebarState() {
  try {
    var saved = localStorage.getItem('quizSidebarCollapsed');
    if (saved) sidebarCollapsed = JSON.parse(saved);
  } catch(e) {}
}

function saveSidebarState() {
  try { localStorage.setItem('quizSidebarCollapsed', JSON.stringify(sidebarCollapsed)); } catch(e) {}
}

function buildSidebar() {
  var list = getById('sidebarList');
  if (!list || !state.questions.length) return;

  var query = (getById('sidebarSearch').value || '').trim().toLowerCase();
  var hasQuery = query.length > 0;
  var html = '';
  var topics = {};
  var matched = 0;
  var datasetKey = state.currentDataset || '__default__';

  for (var i = 0; i < state.questions.length; i++) {
    var q = state.questions[i];
    var topic = q.topic || '通用';
    if (!topics[topic]) topics[topic] = [];
    topics[topic].push({ index: i, q: q });
  }

  // 收藏分组（置顶）
  var bookmarkItems = [];
  if (!hasQuery) {
    for (var i = 0; i < state.questions.length; i++) {
      var q = state.questions[i];
      if (q.id != null && isBookmarked(q.id)) {
        bookmarkItems.push({ index: i, q: q });
      }
    }
  }

  if (bookmarkItems.length > 0) {
    html += '<div class="sidebar-group">';
    html += '<div class="sidebar-group-header">';
    html += '<span class="sidebar-group-arrow">&#9660;</span>';
    html += '<span class="sidebar-group-title">⭐ 收藏</span>';
    html += '<span class="sidebar-group-count">' + bookmarkItems.length + '</span>';
    html += '</div>';
    html += '<div class="sidebar-group-body">';

    for (var k = 0; k < bookmarkItems.length; k++) {
      var idx = bookmarkItems[k].index;
      var question = bookmarkItems[k].q;
      var doneClass = question._answered ? ' done' : '';
      var currentClass = idx === state.currentIndex ? ' current' : '';

      html += '<div class="sidebar-item' + doneClass + currentClass + '" data-index="' + idx + '">';
      html += '<span class="sidebar-item-num">' + (idx + 1) + '.</span>';
      html += '<span class="sidebar-item-text">' + escHtml(truncate(question.question, 50)) + '</span>';
      html += '<span class="sidebar-item-star">★</span>';
      if (question._answered) html += '<span class="sidebar-item-check">&#10003;</span>';
      html += '</div>';
    }

    html += '</div></div>';
    matched += bookmarkItems.length;
  }

  var topicKeys = Object.keys(topics);
  for (var t = 0; t < topicKeys.length; t++) {
    var topic = topicKeys[t];
    var items = topics[topic];
    var filtered = [];

    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var text = (item.q.question + ' ' + (item.q.topic || '')).toLowerCase();
      if (!hasQuery || text.indexOf(query) !== -1) {
        filtered.push(item);
      }
    }

    if (filtered.length === 0) continue;
    matched += filtered.length;

    var groupKey = datasetKey + '_' + topic;
    var isCollapsed = hasQuery ? false : sidebarCollapsed[groupKey] !== false;
    var collapsedClass = isCollapsed ? ' collapsed' : '';

    html += '<div class="sidebar-group' + collapsedClass + '" data-group="' + escHtml(groupKey) + '">';
    html += '<div class="sidebar-group-header">';
    html += '<span class="sidebar-group-arrow">&#9660;</span>';
    html += '<span class="sidebar-group-title">' + escHtml(topic) + '</span>';
    html += '<span class="sidebar-group-count">' + filtered.length + '</span>';
    html += '</div>';
    html += '<div class="sidebar-group-body">';

    for (var k = 0; k < filtered.length; k++) {
      var idx = filtered[k].index;
      var question = filtered[k].q;
      var isCurrent = idx === state.currentIndex;
      var doneClass = question._answered ? ' done' : '';
      var currentClass = isCurrent ? ' current' : '';
      var bm = question.id != null && isBookmarked(question.id);

      html += '<div class="sidebar-item' + doneClass + currentClass + '" data-index="' + idx + '">';
      html += '<span class="sidebar-item-num">' + (idx + 1) + '.</span>';
      html += '<span class="sidebar-item-text">' + escHtml(truncate(question.question, 50)) + '</span>';
      if (bm) html += '<span class="sidebar-item-star">★</span>';
      if (question._answered) html += '<span class="sidebar-item-check">&#10003;</span>';
      html += '</div>';
    }

    html += '</div></div>';
  }

  list.innerHTML = html;
  getById('sidebarCount').textContent = matched + ' / ' + state.questions.length;

  // Bind group header click
  var headers = list.querySelectorAll('.sidebar-group-header');
  for (var i = 0; i < headers.length; i++) {
    headers[i].addEventListener('click', onGroupHeaderClick);
  }

  // Bind item click
  var items = list.querySelectorAll('.sidebar-item');
  for (var i = 0; i < items.length; i++) {
    items[i].addEventListener('click', onSidebarItemClick);
  }

  if (hasQuery) {
    list.classList.add('sidebar-search-active');
  } else {
    list.classList.remove('sidebar-search-active');
  }
}

function truncate(str, max) {
  return str.length > max ? str.substring(0, max) + '...' : str;
}

function onGroupHeaderClick(e) {
  var header = e.currentTarget;
  var group = header.parentNode;
  var groupKey = group.getAttribute('data-group');
  group.classList.toggle('collapsed');
  if (groupKey) {
    sidebarCollapsed[groupKey] = group.classList.contains('collapsed');
    saveSidebarState();
  }
}

function onSidebarItemClick(e) {
  var el = e.currentTarget;
  var idx = parseInt(el.getAttribute('data-index'), 10);
  if (!isNaN(idx) && idx >= 0 && idx < state.questions.length) {
    state.currentIndex = idx;
    renderQuestion();
    closeSidebar();
  }
}

function openSidebar() {
  var sidebar = getById('sidebar');
  getById('sidebarBackdrop').classList.add('visible');
  sidebar.classList.add('open');
  getById('sidebarToggle').classList.add('open');
  document.body.classList.add('sidebar-open');
  buildSidebar();
  getById('sidebarSearch').value = '';
}

function closeSidebar() {
  var sidebar = getById('sidebar');
  getById('sidebarBackdrop').classList.remove('visible');
  sidebar.classList.remove('open');
  getById('sidebarToggle').classList.remove('open');
  document.body.classList.remove('sidebar-open');
}

function toggleSidebar() {
  var sidebar = getById('sidebar');
  if (sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

function updateSidebarCurrent() {
  var items = getById('sidebarList').querySelectorAll('.sidebar-item');
  for (var i = 0; i < items.length; i++) {
    var idx = parseInt(items[i].getAttribute('data-index'), 10);
    items[i].classList.toggle('current', idx === state.currentIndex);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  init();
  loadSidebarState();

  getById('revealBtn').addEventListener('click', revealAnswer);
  getById('nextBtn').addEventListener('click', nextQuestion);
  getById('prevBtn').addEventListener('click', prevQuestion);
  getById('randomBtn').addEventListener('click', randomQuestion);
  getById('sidebarToggle').addEventListener('click', toggleSidebar);
  getById('sidebarClose').addEventListener('click', closeSidebar);
  getById('bookmarkBtn').addEventListener('click', toggleBookmark);
  getById('sidebarBackdrop').addEventListener('click', closeSidebar);
  getById('sidebarSearch').addEventListener('input', buildSidebar);
  getById('sidebarSearch').addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeSidebar();
    if (e.key === 'Enter') {
      e.preventDefault();
      var first = getById('sidebarList').querySelector('.sidebar-item');
      if (first) first.click();
    }
  });

  document.addEventListener('keydown', function(e) {
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
    if (e.key === 'Escape') closeSidebar();
  });
});
