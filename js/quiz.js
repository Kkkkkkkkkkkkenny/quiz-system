/* ====== Quiz Mode ====== */
(function() {
  'use strict';

  var U = QuizUtils;

  var state = {
    questions: [],
    currentIndex: 0,
    isAnswered: false,
    answeredCount: 0,
    datasets: [],
    currentDataset: null,
    title: '408 考研刷题',
    bookmarkedIds: []
  };

  /* ====== Init ====== */

  function init() {
    U.initTheme();
    U.initMenu();
    loadSidebarState();
    loadBookmarks();
    loadDatasets().then(function() {
      var params = new URLSearchParams(window.location.search);
      var setId = params.get('set');
      if (setId) {
        var ds = findDataset(setId);
        if (ds) return loadFile(ds.file);
      }
      return loadDefault();
    }).then(function() {
      populateSelector();
    });

    bindEvents();
  }

  function findDataset(id) {
    for (var i = 0; i < state.datasets.length; i++) {
      if (state.datasets[i].id === id) return state.datasets[i];
    }
    return null;
  }

  function loadDatasets() {
    return U.fetchJSON('datasets.json').then(function(data) {
      state.datasets = data || [];
    }).catch(function() {
      state.datasets = [];
    });
  }

  function loadDefault() {
    var saved = null;
    try { saved = localStorage.getItem('quizDataset'); } catch(e) {}
    if (saved) {
      var ds = findDataset(saved);
      if (ds) return loadFile(ds.file);
    }
    if (state.datasets.length > 0) {
      return loadFile(state.datasets[0].file);
    }
    return loadFile('data.json');
  }

  function loadFile(path) {
    return U.fetchJSON(path).then(function(data) {
      if (Array.isArray(data)) {
        state.questions = data;
        state.currentDataset = null;
      } else if (data.questions) {
        state.questions = data.questions;
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
      renderQuestion();
      buildSidebar();
    }).catch(function(err) {
      U.$('#questionText').textContent = '加载失败：' + err.message;
      U.$('#topicBadge').textContent = '错误';
      U.$('#counter').textContent = '- / -';
    });
  }

  /* ====== Bookmarks ====== */

  function loadBookmarks() {
    try {
      var saved = localStorage.getItem('quizBookmarks');
      if (saved) state.bookmarkedIds = JSON.parse(saved);
      if (!Array.isArray(state.bookmarkedIds)) state.bookmarkedIds = [];
    } catch(e) { state.bookmarkedIds = []; }

    fetch('/api/data/bookmarks').then(function(res) {
      if (!res.ok) throw new Error('API unavailable');
      return res.json();
    }).then(function(result) {
      var ids = result && result.data;
      if (Array.isArray(ids)) {
        state.bookmarkedIds = ids;
        try { localStorage.setItem('quizBookmarks', JSON.stringify(ids)); } catch(e) {}
      }
      if (state.questions.length) updateBookmarkBtn();
    }).catch(function() {});
  }

  function saveBookmarks() {
    try { localStorage.setItem('quizBookmarks', JSON.stringify(state.bookmarkedIds)); } catch(e) {}
    fetch('/api/data/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: state.bookmarkedIds })
    }).catch(function() {});
  }

  function isBookmarked(id) {
    return state.bookmarkedIds.indexOf(id) !== -1;
  }

  function toggleBookmark() {
    var q = state.questions[state.currentIndex];
    if (!q || q.id == null) return;
    var id = q.id;
    var idx = state.bookmarkedIds.indexOf(id);
    if (idx === -1) state.bookmarkedIds.push(id);
    else state.bookmarkedIds.splice(idx, 1);
    saveBookmarks();
    updateBookmarkBtn();
    // Rebuild sidebar if open to update bookmark section
    if (U.$('#sidebar').classList.contains('open')) buildSidebar();
  }

  function updateBookmarkBtn() {
    var btn = U.$('#bookmarkBtn');
    if (!btn) return;
    var q = state.questions[state.currentIndex];
    if (!q || q.id == null) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    if (isBookmarked(q.id)) {
      btn.innerHTML = '&#9733;';
      btn.classList.add('active');
    } else {
      btn.innerHTML = '&#9734;';
      btn.classList.remove('active');
    }
  }

  /* ====== Dataset selector ====== */

  function populateSelector() {
    var sel = U.$('#datasetSelect');
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
      var og = document.createElement('optgroup');
      og.label = keys[k];
      var items = groups[keys[k]];
      for (var j = 0; j < items.length; j++) {
        var opt = document.createElement('option');
        opt.value = items[j].id;
        opt.textContent = items[j].title;
        og.appendChild(opt);
      }
      sel.appendChild(og);
    }
    if (state.currentDataset && findDataset(state.currentDataset)) {
      sel.value = state.currentDataset;
    }
    sel.addEventListener('change', function() {
      var id = sel.value;
      var ds = findDataset(id);
      if (!ds) return;
      try { localStorage.setItem('quizDataset', id); } catch(e) {}
      loadFile(ds.file);
    });
  }

  /* ====== Rendering ====== */

  function renderQuestion() {
    if (!state.questions.length) return;
    var q = state.questions[state.currentIndex];
    U.$('#topicBadge').textContent = (q.chapter ? q.chapter + '  ·  ' : '') + (q.topic || '通用');
    U.$('#questionText').innerHTML = renderLatex(q.question);
    U.$('#answerText').innerHTML = formatAnswer(q.answer);
    U.$('#answerArea').classList.remove('visible');
    U.$('#revealBtn').style.display = 'block';
    U.$('#revealBtn').textContent = '显示答案';
    state.isAnswered = false;
    updateCounter();
    updateProgress();
    updateProgressText();
    updateBookmarkBtn();
  }

  function revealAnswer() {
    if (state.isAnswered) return;
    U.$('#answerArea').classList.add('visible');
    U.$('#revealBtn').style.display = 'none';
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
    U.$('#counter').textContent = (state.currentIndex + 1) + ' / ' + state.questions.length;
  }

  function updateProgress() {
    var pct = state.questions.length ? (state.answeredCount / state.questions.length) * 100 : 0;
    U.$('#progressFill').style.width = pct + '%';
  }

  function updateProgressText() {
    var remaining = state.questions.length - state.answeredCount;
    U.$('#progressText').textContent = '已掌握 ' + state.answeredCount + ' 题，还剩 ' + remaining + ' 题待复习';
  }

  /* ====== LaTeX ====== */

  var GREEK = {
    'alpha':'α','beta':'β','gamma':'γ','delta':'δ','epsilon':'ε',
    'zeta':'ζ','eta':'η','theta':'θ','iota':'ι','kappa':'κ',
    'lambda':'λ','mu':'μ','nu':'ν','xi':'ξ','pi':'π','rho':'ρ',
    'sigma':'σ','tau':'τ','upsilon':'υ','phi':'φ','chi':'χ',
    'psi':'ψ','omega':'ω',
    'Alpha':'Α','Beta':'Β','Gamma':'Γ','Delta':'Δ',
    'Theta':'Θ','Lambda':'Λ','Pi':'Π','Sigma':'Σ','Omega':'Ω'
  };

  var SYMBOLS = {
    'leq':'≤','ge':'≥','geq':'≥','ne':'≠','neq':'≠',
    'times':'×','cdot':'·','div':'÷','pm':'±',
    'infty':'∞','to':'→','rightarrow':'→','leftarrow':'←','Rightarrow':'⇒',
    'approx':'≈','equiv':'≡','sim':'∼',
    'sum':'∑','prod':'∏','int':'∫','oint':'∮',
    'forall':'∀','exists':'∃','in':'∈','notin':'∉',
    'subset':'⊂','subseteq':'⊆','supset':'⊃',
    'cup':'∪','cap':'∩','emptyset':'∅',
    'log':'log','ln':'ln','lg':'lg','max':'max','min':'min'
  };

  function renderLatex(text) {
    if (!text) return text;
    return text.replace(/\$\$([^$]+)\$\$/g, function(m, expr) {
      return '<div class="math math-display">' + renderMathExpr(expr.trim()) + '</div>';
    }).replace(/\$(?!\$)([^$]+?)\$(?!\$)/g, function(m, expr) {
      return '<span class="math math-inline">' + renderMathExpr(expr.trim()) + '</span>';
    });
  }

  function renderMathExpr(expr) {
    var i = 0, len = expr.length;
    function peek() { return i < len ? expr.charAt(i) : ''; }
    function next() { return expr.charAt(i++); }

    function parseGroup() {
      while (peek() === ' ') next();
      if (peek() === '{') {
        next();
        var depth = 1, start = i;
        while (i < len && depth > 0) {
          var ch = expr.charAt(i++);
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        }
        return expr.substring(start, i - 1);
      }
      if (peek() === '\\') {
        next();
        var cmd = '';
        while (i < len && /[a-zA-Z]/.test(peek())) cmd += next();
        if (GREEK.hasOwnProperty(cmd)) return GREEK[cmd];
        if (SYMBOLS.hasOwnProperty(cmd)) return SYMBOLS[cmd];
        return '\\' + cmd;
      }
      return next();
    }

    function parseExpr() {
      var result = '';
      while (i < len) {
        var ch = peek();
        if (ch === ' ') { result += ' '; next(); continue; }
        if (ch === '\\') {
          next();
          var cmd = '';
          while (i < len && /[a-zA-Z]/.test(peek())) cmd += next();
          if (cmd === 'frac') {
            var num = parseGroup(), den = parseGroup();
            result += '<span class="math-frac"><span class="math-frac-top">' + renderMathExpr(num) + '</span><span class="math-frac-bot">' + renderMathExpr(den) + '</span></span>';
          } else if (cmd === 'sqrt') {
            var arg = parseGroup();
            result += '<span class="math-sqrt">√<span class="math-sqrt-inner">' + renderMathExpr(arg) + '</span></span>';
          } else if (cmd === 'sum' || cmd === 'prod' || cmd === 'int' || cmd === 'oint') {
            var sym = SYMBOLS[cmd] || cmd;
            var sub = '', sup = '';
            if (peek() === '_') { next(); sub = parseGroup(); }
            if (peek() === '^') { next(); sup = parseGroup(); }
            result += '<span class="math-op">' + sym + '</span>';
            if (sub) result += '<sub>' + renderMathExpr(sub) + '</sub>';
            if (sup) result += '<sup>' + renderMathExpr(sup) + '</sup>';
          } else if (GREEK.hasOwnProperty(cmd)) {
            result += GREEK[cmd];
          } else if (SYMBOLS.hasOwnProperty(cmd)) {
            result += SYMBOLS[cmd];
          } else {
            result += cmd;
          }
          continue;
        }
        if (ch === '_') { next(); result += '<sub>' + renderMathExpr(parseGroup()) + '</sub>'; continue; }
        if (ch === '^') { next(); result += '<sup>' + renderMathExpr(parseGroup()) + '</sup>'; continue; }
        if (ch === '{') { result += parseGroup(); continue; }
        if (ch === '}') break;
        result += next();
      }
      return result;
    }
    return parseExpr();
  }

  /* ====== Answer formatting ====== */

  function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatAnswer(text) {
    try {
      var parts = [], buf = '', inCode = false;
      var lines = text.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (t.indexOf('```') === 0) {
          if (inCode) { parts.push({ t: 'code', c: buf }); buf = ''; inCode = false; }
          else { if (buf) parts.push({ t: 'text', c: buf }); buf = ''; inCode = true; }
          continue;
        }
        buf += lines[i] + '\n';
      }
      if (inCode) parts.push({ t: 'code', c: buf });
      else if (buf) parts.push({ t: 'text', c: buf });

      var out = [];
      for (var j = 0; j < parts.length; j++) {
        if (parts[j].t === 'code') {
          out.push('<pre><code>' + escHtml(parts[j].c.replace(/\n$/, '')) + '</code></pre>');
        } else {
          out.push(renderBlocks(parts[j].c));
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
      inTable = false; tableRows = [];
    }

    function flushList() {
      if (!inList) return;
      out.push('<' + listTag + '>' + listItems.join('') + '</' + listTag + '>');
      inList = false; listItems = [];
    }

    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (trimmed === '') { flushTable(); flushList(); continue; }

      if (trimmed.indexOf('|') === 0 && trimmed.charAt(trimmed.length - 1) === '|') {
        flushList();
        tableRows.push(trimmed);
        if (!inTable) inTable = true;
        continue;
      }

      var ulMatch = trimmed.match(/^[-*+]\s(.+)/);
      if (ulMatch) {
        flushTable();
        if (!inList || listTag !== 'ul') { flushList(); inList = true; listTag = 'ul'; }
        listItems.push('<li>' + renderInline(ulMatch[1]) + '</li>');
        continue;
      }

      var olMatch = trimmed.match(/^\d+\.\s(.+)/);
      if (olMatch) {
        flushTable();
        if (!inList || listTag !== 'ol') { flushList(); inList = true; listTag = 'ol'; }
        listItems.push('<li>' + renderInline(olMatch[1]) + '</li>');
        continue;
      }

      flushTable(); flushList();
      out.push('<p>' + renderInline(lines[i]) + '</p>');
    }

    flushTable(); flushList();
    return out.join('\n');
  }

  function renderInline(text) {
    var s = escHtml(text);
    s = renderLatex(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  /* ====== Sidebar ====== */

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
    var list = U.$('#navTree');
    if (!list || !state.questions.length) return;

    var datasetKey = state.currentDataset || '__default__';

    // Group by chapter
    var chapters = {};
    for (var i = 0; i < state.questions.length; i++) {
      var q = state.questions[i];
      var ch = q.chapter || '其他';
      if (!chapters[ch]) chapters[ch] = [];
      chapters[ch].push({ index: i, q: q });
    }

    var html = '';

    // Bookmark section (top)
    var bookmarkItems = [];
    for (var i = 0; i < state.questions.length; i++) {
      var q = state.questions[i];
      if (q.id != null && isBookmarked(q.id)) bookmarkItems.push({ index: i, q: q });
    }

    if (bookmarkItems.length > 0) {
      html += '<div class="sidebar__section">';
      html += '<div class="sidebar__section-title">&#9733; 收藏 (' + bookmarkItems.length + ')</div>';
      for (var k = 0; k < bookmarkItems.length; k++) {
        var idx = bookmarkItems[k].index;
        var question = bookmarkItems[k].q;
        var currentClass = idx === state.currentIndex ? ' active' : '';
        html += '<a class="sidebar__item' + currentClass + '" data-index="' + idx + '" style="display:flex;gap:8px;align-items:baseline;">';
        html += '<span style="font-size:11px;color:var(--color-text-muted);min-width:24px;text-align:right;flex-shrink:0;">' + (idx + 1) + '.</span>';
        html += '<span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + U.escapeHTML(question.question.substring(0, 45)) + '</span>';
        html += '<span style="color:#f0c040;font-size:11px;">&#9733;</span>';
        html += '</a>';
      }
      html += '</div>';
    }

    // Chapters
    var chKeys = Object.keys(chapters);
    for (var c = 0; c < chKeys.length; c++) {
      var chapter = chKeys[c];
      var items = chapters[chapter];
      var groupKey = datasetKey + '_' + chapter;
      var isOpen = sidebarCollapsed[groupKey] === false;
      var openAttr = isOpen ? '' : '';

      // Auto-open chapter containing current question
      for (var j = 0; j < items.length; j++) {
        if (items[j].index === state.currentIndex) { var openAttr = ' open'; break; }
      }

      html += '<details' + openAttr + ' data-group="' + U.escapeHTML(groupKey) + '">';
      html += '<summary style="font-weight:600;padding:8px 16px;font-size:13px;cursor:pointer;user-select:none;">';
      html += U.escapeHTML(chapter);
      html += ' <span style="color:var(--color-text-muted);font-weight:400;font-size:11px;">(' + items.length + ')</span>';
      html += '</summary>';

      for (var j = 0; j < items.length; j++) {
        var idx = items[j].index;
        var question = items[j].q;
        var currentClass = idx === state.currentIndex ? ' active' : '';
        var doneStyle = question._answered ? 'color:var(--color-text-muted);' : '';
        var bm = question.id != null && isBookmarked(question.id);

        html += '<a class="sidebar__item' + currentClass + '" data-index="' + idx + '" style="display:flex;gap:8px;align-items:baseline;' + doneStyle + '">';
        html += '<span style="font-size:11px;color:var(--color-text-muted);min-width:24px;text-align:right;flex-shrink:0;">' + (idx + 1) + '.</span>';
        html += '<span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + U.escapeHTML(question.question.substring(0, 45)) + '</span>';
        if (bm) html += '<span style="color:#f0c040;font-size:11px;">&#9733;</span>';
        if (question._answered) html += '<span style="color:var(--color-success);font-size:12px;">&#10003;</span>';
        html += '</a>';
      }

      html += '</details>';
    }

    list.innerHTML = html;

    // Bind clicks
    var clickItems = list.querySelectorAll('.sidebar__item');
    for (var k = 0; k < clickItems.length; k++) {
      clickItems[k].addEventListener('click', function(e) {
        e.preventDefault();
        var idx = parseInt(this.getAttribute('data-index'), 10);
        if (!isNaN(idx) && idx >= 0 && idx < state.questions.length) {
          state.currentIndex = idx;
          renderQuestion();
          U.closeSidebar();
        }
      });
    }

    // Bind details toggle to save state
    var details = list.querySelectorAll('details[data-group]');
    for (var d = 0; d < details.length; d++) {
      details[d].addEventListener('toggle', function() {
        var groupKey = this.getAttribute('data-group');
        if (groupKey) {
          sidebarCollapsed[groupKey] = !this.open;
          saveSidebarState();
        }
      });
    }
  }

  /* ====== Events ====== */

  function bindEvents() {
    U.$('#revealBtn').addEventListener('click', revealAnswer);
    U.$('#nextBtn').addEventListener('click', nextQuestion);
    U.$('#prevBtn').addEventListener('click', prevQuestion);
    U.$('#randomBtn').addEventListener('click', randomQuestion);
    U.$('#bookmarkBtn').addEventListener('click', toggleBookmark);

    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (!state.isAnswered) { e.preventDefault(); revealAnswer(); }
        else if (e.key === ' ') { e.preventDefault(); nextQuestion(); }
      }
      if (e.key === 'ArrowRight') nextQuestion();
      if (e.key === 'ArrowLeft') prevQuestion();
    });

    // Build sidebar when menu opens
    var observer = new MutationObserver(function() {
      if (U.$('#sidebar').classList.contains('open')) buildSidebar();
    });
    observer.observe(U.$('#sidebar'), { attributes: true, attributeFilter: ['class'] });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
