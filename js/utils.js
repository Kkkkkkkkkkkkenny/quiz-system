/* Shared utilities */
var QuizUtils = {
  $: function(sel) { return document.querySelector(sel); },
  $$: function(sel) { return document.querySelectorAll(sel); },

  debounce: function(fn, delay) {
    var timer;
    return function() {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
    };
  },

  escapeHTML: function(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  highlightText: function(text, query) {
    if (!query) return text;
    var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp('(' + escaped + ')', 'gi'), '<mark>$1</mark>');
  },

  fetchJSON: function(url) {
    return fetch(url).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  },

  _cache: {},
  cachedFetch: function(url) {
    if (this._cache[url]) return Promise.resolve(this._cache[url]);
    var self = this;
    return this.fetchJSON(url).then(function(data) {
      self._cache[url] = data;
      return data;
    });
  },

  initTheme: function() {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    var btn = this.$('#themeBtn');
    if (!btn) return;

    var lightIcon = this.$('.theme-icon-light');
    var darkIcon = this.$('.theme-icon-dark');

    function updateIcons() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (lightIcon) lightIcon.style.display = isDark ? 'none' : 'block';
      if (darkIcon) darkIcon.style.display = isDark ? 'block' : 'none';
    }
    updateIcons();

    btn.addEventListener('click', function() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
      }
      updateIcons();
    });
  },

  initMenu: function() {
    var menuBtn = this.$('#menuBtn');
    var sidebar = this.$('#sidebar');
    var overlay = this.$('#overlay');
    if (!menuBtn || !sidebar) return;

    menuBtn.addEventListener('click', function() {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('visible');
    });

    if (overlay) {
      overlay.addEventListener('click', function() {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
      });
    }
  },

  closeSidebar: function() {
    var sidebar = this.$('#sidebar');
    var overlay = this.$('#overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
  }
};
