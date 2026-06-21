/* ====== Notes Mode - Knowledge Browsing ====== */
(function() {
  'use strict';

  var U = QuizUtils;

  var state = {
    subjects: [],
    currentSubject: null,
    currentChapter: null,
    questions: [],
    chapterMap: {}
  };

  /* ====== Init ====== */

  function init() {
    U.initTheme();
    U.initMenu();

    U.fetchJSON('subjects.json').then(function(data) {
      state.subjects = data || [];
      handleRoute();
    });

    window.addEventListener('hashchange', handleRoute);

    var searchInput = U.$('#searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', U.debounce(onSearch, 200));
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          searchInput.value = '';
          hideSearch();
          searchInput.blur();
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          var first = U.$('.search-results__item');
          if (first) first.click();
        }
      });
    }

    var searchClose = U.$('#searchClose');
    if (searchClose) searchClose.addEventListener('click', hideSearch);

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.search') && !e.target.closest('.search-results')) {
        hideSearch();
      }
    });

    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (searchInput) searchInput.focus();
      }
    });

    var backToTop = U.$('#backToTop');
    if (backToTop) {
      window.addEventListener('scroll', U.throttle(function() {
        backToTop.classList.toggle('visible', window.scrollY > 300);
      }, 200));
      backToTop.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  /* ====== Routing ====== */

  function handleRoute() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/');
    var subjectId = parts[0] || null;
    var chapterIdx = parts[1] || null;

    // Update nav active state
    U.$$('.header__nav-item').forEach(function(el) {
      el.classList.remove('active');
    });

    if (!subjectId) {
      renderHome();
      renderSidebar(null);
    } else {
      var subject = findSubject(subjectId);
      if (!subject) { renderHome(); renderSidebar(null); return; }
      state.currentSubject = subject;

      if (chapterIdx !== null) {
        loadAndRenderChapter(subject, parseInt(chapterIdx, 10));
      } else {
        loadAndRenderSubject(subject);
      }
      renderSidebar(subject);
    }
  }

  function findSubject(id) {
    for (var i = 0; i < state.subjects.length; i++) {
      if (state.subjects[i].id === id || state.subjects[i].slug === id) return state.subjects[i];
    }
    return null;
  }

  /* ====== Home ====== */

  function renderHome() {
    var content = U.$('#contentArea');
    var icons = { tree: '🌲', cpu: '💻', monitor: '🖥️', network: '🌐' };

    content.innerHTML = '<div class="home">' +
      '<div class="home__hero">' +
        '<h1 class="home__title">408 考研知识库</h1>' +
        '<p class="home__subtitle">涵盖数据结构、计算机组成原理、操作系统全部大纲知识点，支持问答浏览与搜索</p>' +
      '</div>' +
      '<div class="home__subjects">' +
      state.subjects.map(function(s) {
        return '<a href="#/' + s.id + '" class="home__card">' +
          '<div class="home__card-icon">' + (icons[s.icon] || '📖') + '</div>' +
          '<h2 class="home__card-title">' + U.escapeHTML(s.name) + '</h2>' +
          '<p class="home__card-desc">' + U.escapeHTML(s.description) + '</p>' +
          '<span class="home__card-meta">约 ' + s.points + ' 分</span>' +
        '</a>';
      }).join('') +
      '</div>' +
    '</div>';
  }

  /* ====== Subject page ====== */

  function loadAndRenderSubject(subject) {
    var content = U.$('#contentArea');
    content.innerHTML = '<div class="skeleton skeleton-line" style="width:60%;margin-bottom:12px;"></div><div class="skeleton skeleton-line" style="width:80%;margin-bottom:12px;"></div>';

    U.fetchJSON(subject.file).then(function(data) {
      var questions = Array.isArray(data) ? data : (data.questions || []);
      state.questions = questions;
      state.chapterMap = buildChapterMap(questions);

      var chKeys = Object.keys(state.chapterMap);

      var html = '<div class="breadcrumb"><a href="#/">首页</a><span class="breadcrumb__sep">/</span><span>' + U.escapeHTML(subject.name) + '</span></div>';
      html += '<h1 style="margin-bottom:8px;">' + U.escapeHTML(subject.name) + '</h1>';
      html += '<p style="color:var(--color-text-secondary);margin-bottom:24px;">' + U.escapeHTML(subject.description) + ' · 共 ' + questions.length + ' 个知识点</p>';

      html += '<div class="chapter-overview"><div class="chapter-overview__title">章节目录</div><div class="chapter-overview__text">共 ' + chKeys.length + ' 章，点击章节查看详细知识点</div></div>';

      html += '<div class="chapter-list">';
      for (var i = 0; i < chKeys.length; i++) {
        var ch = chKeys[i];
        var items = state.chapterMap[ch];
        var topics = {};
        for (var j = 0; j < items.length; j++) {
          var t = items[j].topic || '通用';
          if (!topics[t]) topics[t] = 0;
          topics[t]++;
        }
        var topicCount = Object.keys(topics).length;
        html += '<a href="#/' + subject.id + '/' + i + '" class="chapter-list__item">';
        html += '<div class="chapter-list__item-title">' + U.escapeHTML(ch) + '</div>';
        html += '<div class="chapter-list__item-meta">' + items.length + ' 个知识点 · ' + topicCount + ' 个知识点分组</div>';
        html += '</a>';
      }
      html += '</div>';

      content.innerHTML = html;
    }).catch(function(err) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state__icon">⚠️</div><h2 class="empty-state__title">加载失败</h2><p class="empty-state__desc">' + err.message + '</p></div>';
    });
  }

  /* ====== Chapter page ====== */

  function loadAndRenderChapter(subject, chapterIdx) {
    var content = U.$('#contentArea');
    content.innerHTML = '<div class="skeleton skeleton-line" style="width:60%;margin-bottom:12px;"></div><div class="skeleton skeleton-line" style="width:80%;"></div>';

    U.fetchJSON(subject.file).then(function(data) {
      var questions = Array.isArray(data) ? data : (data.questions || []);
      state.questions = questions;
      state.chapterMap = buildChapterMap(questions);

      var chKeys = Object.keys(state.chapterMap);
      if (chapterIdx < 0 || chapterIdx >= chKeys.length) {
        content.innerHTML = '<div class="empty-state"><div class="empty-state__icon">🔍</div><h2 class="empty-state__title">章节未找到</h2></div>';
        return;
      }

      var chapterName = chKeys[chapterIdx];
      var items = state.chapterMap[chapterName];
      state.currentChapter = chapterName;

      // Group by topic
      var topics = {};
      for (var i = 0; i < items.length; i++) {
        var t = items[i].topic || '通用';
        if (!topics[t]) topics[t] = [];
        topics[t].push(items[i]);
      }
      var topicKeys = Object.keys(topics);

      var html = '<div class="breadcrumb">';
      html += '<a href="#/">首页</a><span class="breadcrumb__sep">/</span>';
      html += '<a href="#/' + subject.id + '">' + U.escapeHTML(subject.name) + '</a><span class="breadcrumb__sep">/</span>';
      html += '<span>' + U.escapeHTML(chapterName) + '</span>';
      html += '</div>';

      html += '<h1>' + U.escapeHTML(chapterName) + '</h1>';

      // Render topics as note sections
      for (var t = 0; t < topicKeys.length; t++) {
        var topicName = topicKeys[t];
        var topicItems = topics[topicName];

        html += '<div class="note-section" data-topic="' + U.escapeHTML(topicName) + '">';
        html += '<h2 class="note-section__title">' + U.escapeHTML(topicName) + '</h2>';

        for (var j = 0; j < topicItems.length; j++) {
          var item = topicItems[j];
          html += '<div class="note-qa">';
          html += '<h3 class="note-qa__question">' + renderLatex(U.escapeHTML(item.question)) + '</h3>';
          html += '<div class="note-qa__answer">' + formatAnswer(item.answer) + '</div>';
          html += '</div>';
        }

        html += '</div>';
      }

      content.innerHTML = html;
      window.scrollTo(0, 0);

      // Handle ?topic= parameter
      var params = new URLSearchParams(window.location.search);
      var targetTopic = params.get('topic');
      if (targetTopic) {
        var target = U.$('.note-section[data-topic="' + targetTopic + '"]');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }).catch(function(err) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state__icon">⚠️</div><h2 class="empty-state__title">加载失败</h2><p class="empty-state__desc">' + err.message + '</p></div>';
    });
  }

  /* ====== Sidebar ====== */

  function renderSidebar(subject) {
    var navTree = U.$('#navTree');
    if (!navTree) return;

    if (!subject) {
      navTree.innerHTML = state.subjects.map(function(s) {
        return '<div class="sidebar__section"><a href="#/' + s.id + '" class="sidebar__item sidebar__item--chapter">' + U.escapeHTML(s.name) + '</a></div>';
      }).join('');
      return;
    }

    // Load questions for sidebar
    U.fetchJSON(subject.file).then(function(data) {
      var questions = Array.isArray(data) ? data : (data.questions || []);
      var chapters = buildChapterMap(questions);

      var html = '<div class="sidebar__section">';
      html += '<div class="sidebar__section-title">' + U.escapeHTML(subject.name) + '</div>';

      var chKeys = Object.keys(chapters);
      for (var c = 0; c < chKeys.length; c++) {
        var chName = chKeys[c];
        var chIdx = c;
        var items = chapters[chName];
        var isActive = state.currentChapter === chName;

        html += '<details' + (isActive ? ' open' : '') + '>';
        html += '<summary class="nav-chapter"><span>' + U.escapeHTML(chName) + '</span></summary>';

        // Group by topic
        var topics = {};
        for (var i = 0; i < items.length; i++) {
          var t = items[i].topic || '通用';
          if (!topics[t]) topics[t] = [];
          topics[t].push(items[i]);
        }
        var tKeys = Object.keys(topics);
        for (var ti = 0; ti < tKeys.length; ti++) {
          html += '<a href="#/' + subject.id + '/' + chIdx + '" class="sidebar__item" style="padding-left:24px;font-size:12px;">';
          html += U.escapeHTML(tKeys[ti]) + ' <span style="color:var(--color-text-muted);font-size:11px;">(' + topics[tKeys[ti]].length + ')</span>';
          html += '</a>';
        }

        html += '</details>';
      }

      html += '</div>';
      navTree.innerHTML = html;
    });
  }

  /* ====== Search ====== */

  function onSearch() {
    var query = (U.$('#searchInput').value || '').trim().toLowerCase();
    if (!query) { hideSearch(); return; }

    // Build results from all subjects
    var results = [];
    var promises = state.subjects.map(function(subject) {
      return U.fetchJSON(subject.file).then(function(data) {
        var questions = Array.isArray(data) ? data : (data.questions || []);
        var chapters = buildChapterMap(questions);
        var chKeys = Object.keys(chapters);

        for (var c = 0; c < chKeys.length; c++) {
          var items = chapters[chKeys[c]];
          for (var i = 0; i < items.length; i++) {
            var q = items[i];
            var text = ((q.question || '') + ' ' + (q.answer || '') + ' ' + (q.topic || '')).toLowerCase();
            if (text.indexOf(query) !== -1) {
              results.push({
                subject: subject,
                chapter: chKeys[c],
                chapterIdx: c,
                question: q
              });
            }
          }
        }
      });
    });

    Promise.all(promises).then(function() {
      showSearchResults(results, query);
    });
  }

  function showSearchResults(results, query) {
    var panel = U.$('#searchResults');
    var list = U.$('#searchResultsList');
    var count = U.$('#searchCount');
    if (!panel || !list) return;

    count.textContent = results.length + ' 个结果';

    if (results.length === 0) {
      list.innerHTML = '<div class="search-results__empty">未找到相关知识点</div>';
    } else {
      list.innerHTML = results.slice(0, 30).map(function(r) {
        var snippet = r.question.question;
        if (snippet.length > 80) snippet = snippet.substring(0, 80) + '...';
        return '<a href="#/' + r.subject.id + '/' + r.chapterIdx + '" class="search-results__item" onclick="QuizUtils.closeSidebar();document.getElementById(\'searchResults\').classList.remove(\'visible\');">' +
          '<div class="search-results__item-breadcrumb">' + U.escapeHTML(r.subject.name) + ' / ' + U.escapeHTML(r.chapter) + ' / ' + U.escapeHTML(r.question.topic || '') + '</div>' +
          '<div class="search-results__item-title">' + U.highlightText(U.escapeHTML(r.question.question.substring(0, 60)), query) + '</div>' +
          '<div class="search-results__item-snippet">' + U.highlightText(U.escapeHTML(snippet), query) + '</div>' +
        '</a>';
      }).join('');
    }

    panel.classList.add('visible');
  }

  function hideSearch() {
    var panel = U.$('#searchResults');
    if (panel) panel.classList.remove('visible');
  }

  /* ====== Helpers ====== */

  function buildChapterMap(questions) {
    var map = {};
    for (var i = 0; i < questions.length; i++) {
      var ch = questions[i].chapter || '其他';
      if (!map[ch]) map[ch] = [];
      map[ch].push(questions[i]);
    }
    return map;
  }

  /* ====== LaTeX (same as quiz) ====== */

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
    'infty':'∞','to':'→','rightarrow':'→','leftarrow':'←',
    'approx':'≈','equiv':'≡','sim':'∼',
    'sum':'∑','prod':'∏','int':'∫',
    'forall':'∀','exists':'∃','in':'∈','notin':'∉',
    'subset':'⊂','subseteq':'⊆',
    'cup':'∪','cap':'∩','emptyset':'∅'
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
        next(); var depth = 1, start = i;
        while (i < len && depth > 0) { var ch = expr.charAt(i++); if (ch === '{') depth++; else if (ch === '}') depth--; }
        return expr.substring(start, i - 1);
      }
      if (peek() === '\\') {
        next(); var cmd = '';
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
          next(); var cmd = '';
          while (i < len && /[a-zA-Z]/.test(peek())) cmd += next();
          if (cmd === 'frac') {
            var num = parseGroup(), den = parseGroup();
            result += '<span class="math-frac"><span class="math-frac-top">' + renderMathExpr(num) + '</span><span class="math-frac-bot">' + renderMathExpr(den) + '</span></span>';
          } else if (cmd === 'sqrt') {
            result += '√<span class="math-sqrt-inner">' + renderMathExpr(parseGroup()) + '</span>';
          } else if (GREEK.hasOwnProperty(cmd)) { result += GREEK[cmd]; }
          else if (SYMBOLS.hasOwnProperty(cmd)) { result += SYMBOLS[cmd]; }
          else { result += cmd; }
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

  /* ====== Answer formatting (shared) ====== */

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
        flushList(); tableRows.push(trimmed); if (!inTable) inTable = true; continue;
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

  document.addEventListener('DOMContentLoaded', init);
})();
