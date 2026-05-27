/**
 * KnowledgeGraph - 知识点图谱引擎
 * 分层树形布局 + Canvas 渲染 + 交互控制
 */
(function(global) {
  'use strict';

  /* ---- 颜色方案 ---- */
  var COLORS = [
    { bg: '#3B82F6', fg: '#fff', border: '#2563EB' },
    { bg: '#10B981', fg: '#fff', border: '#059669' },
    { bg: '#EF4444', fg: '#fff', border: '#DC2626' },
    { bg: '#F59E0B', fg: '#fff', border: '#D97706' },
    { bg: '#8B5CF6', fg: '#fff', border: '#7C3AED' },
    { bg: '#EC4899', fg: '#fff', border: '#DB2777' },
    { bg: '#06B6D4', fg: '#fff', border: '#0891B2' },
    { bg: '#F97316', fg: '#fff', border: '#EA580C' },
    { bg: '#14B8A6', fg: '#fff', border: '#0D9488' },
    { bg: '#6366F1', fg: '#fff', border: '#4F46E5' },
  ];

  var ROOT_COLOR  = { bg: '#1E293B', fg: '#fff', border: '#0F172A' };
  var BG_COLOR    = '#F8FAFC';
  var GRID_COLOR  = '#E8ECF0';
  var EDGE_COLOR  = '#CBD5E1';

  /* ---- 尺寸配置 ---- */
  var SIZES = {
    rootW: 190, rootH: 48, rootR: 12,
    chW: 160, chH: 38, chR: 8,
    tpW: 120, tpH: 32, tpR: 7,
    layerGap: 84,
    nodeGap: 16,
    chGap: 36
  };

  /* ---- 辅助函数 ---- */
  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /* ==================================================================
   *  KnowledgeGraph 构造函数
   * ================================================================*/
  function KnowledgeGraph(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = callbacks || {};

    /* data */
    this.nodes = [];       // flat array
    this.edges = [];       // {source, target}
    this.nMap = {};        // id → node
    this.rootId = null;

    /* transform (zoom & pan) */
    this.tx = 0;
    this.ty = 0;
    this.scale = 1;
    this._txT = 0;
    this._tyT = 0;
    this._scT = 1;
    this._minScale = 0.25;
    this._maxScale = 2.5;

    /* interaction state */
    this._hover = null;
    this._dragNode = null;
    this._dragOffX = 0;
    this._dragOffY = 0;
    this._panning = false;
    this._panSX = 0;
    this._panSY = 0;
    this._panTX = 0;
    this._panTY = 0;
    this._needsRender = true;

    /* DPI */
    this._dpr = window.devicePixelRatio || 1;
    this._w = 0;
    this._h = 0;

    /* animation */
    this._rAF = null;
    this._tick = 0;

    this._bind();
    this._resize();

    /* render empty state */
    this.render();
  }

  /* ==================================================================
   *  Public API
   * ================================================================*/
  KnowledgeGraph.prototype.setData = function(questions, title) {
    this._build(questions, title || '知识图谱');
    this._layout();
    this._fitView();
    this.render();
  };

  KnowledgeGraph.prototype.resize = function() {
    var oldW = this._w, oldH = this._h;
    this._resize();
    if (!this.nodes.length) return;
    /* 方向变化时重新布局 */
    var wasPortrait = oldH > oldW;
    var isPortrait = this._h > this._w;
    if (wasPortrait !== isPortrait) {
      this._layout();
      this._fitView();
    }
    this.render();
  };

  KnowledgeGraph.prototype.render = function() {
    this._needsRender = true;
    if (!this._rAF) {
      this._rAF = requestAnimationFrame(this._frame.bind(this));
    }
  };

  KnowledgeGraph.prototype.destroy = function() {
    this._unbind();
    cancelAnimationFrame(this._rAF);
    this._rAF = null;
  };

  /* ==================================================================
   *  Build graph from questions
   * ================================================================*/
  KnowledgeGraph.prototype._build = function(questions, title) {
    this.nMap = {};
    this.nodes = [];
    this.edges = [];

    /* group questions by chapter → topic */
    var chapters = {};
    var hasCh = false;
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var ch = q.chapter || '其他';
      var tp = q.topic || '未分类';
      if (q.chapter) hasCh = true;
      if (!chapters[ch]) chapters[ch] = {};
      if (!chapters[ch][tp]) chapters[ch][tp] = 0;
      chapters[ch][tp]++;
    }

    var chNames = Object.keys(chapters);
    this.rootId = '__root__';

    /* root */
    this._addNode(this.rootId, title, 'root', null, ROOT_COLOR, questions.length);

    var ci = 0;
    for (var c = 0; c < chNames.length; c++) {
      var ch = chNames[c];
      var color = COLORS[ci % COLORS.length];
      ci++;

      var chTotal = 0;
      var tNames = Object.keys(chapters[ch]);
      for (var t = 0; t < tNames.length; t++) chTotal += chapters[ch][tNames[t]];

      var chId;
      if (hasCh) {
        chId = 'ch_' + c;
        this._addNode(chId, ch, 'chapter', this.rootId, color, chTotal);
      }

      for (var t = 0; t < tNames.length; t++) {
        var tp = tNames[t];
        var pid = hasCh ? chId : this.rootId;
        this._addNode('tp_' + c + '_' + t, tp, 'topic', pid, color, chapters[ch][tp]);
      }
    }
  };

  KnowledgeGraph.prototype._addNode = function(id, label, type, parentId, color, count) {
    var truncMax = (type === 'root') ? 16 : (type === 'chapter') ? 12 : 10;
    var node = {
      id: id,
      label: truncate(label, truncMax),
      fullLabel: label,
      type: type,
      parent: parentId,
      color: color,
      count: count || 0,
      x: 0, y: 0,
      w: 0, h: 0,
      children: [],
      depth: 0
    };

    /* set size by type */
    if (type === 'root')     { node.w = SIZES.rootW; node.h = SIZES.rootH; }
    else if (type === 'chapter') { node.w = SIZES.chW; node.h = SIZES.chH; }
    else                         { node.w = SIZES.tpW; node.h = SIZES.tpH; }

    this.nMap[id] = node;
    this.nodes.push(node);

    if (parentId && this.nMap[parentId]) {
      this.nMap[parentId].children.push(id);
      this.edges.push({ source: parentId, target: id });
    }

    return node;
  };

  /* ==================================================================
   *  Layout — force-directed hierarchical layout
   *  Combines tree structure with force compaction
   * ================================================================*/
  KnowledgeGraph.prototype._layout = function() {
    if (!this.nodes.length) return;

    /* detect orientation: portrait = vertical tree, landscape = horizontal spread */
    var isPortrait = this._h > this._w;

    /* 1. assign depths via BFS */
    var queue = [this.rootId];
    this.nMap[this.rootId].depth = 0;
    while (queue.length) {
      var id = queue.shift();
      var node = this.nMap[id];
      for (var i = 0; i < node.children.length; i++) {
        this.nMap[node.children[i]].depth = node.depth + 1;
        queue.push(node.children[i]);
      }
    }

    /* 2. count nodes per layer */
    var layerNodes = {};
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      if (!layerNodes[n.depth]) layerNodes[n.depth] = [];
      layerNodes[n.depth].push(n);
    }
    var keys = Object.keys(layerNodes).sort(function(a,b){return a-b;});
    var maxDepth = parseInt(keys[keys.length-1]) || 0;

    /* 3. initial positions */
    if (isPortrait) {
      /* ---- 竖屏：纵向树形布局 ---- */
      var vGap = 70;
      for (var d = 0; d < keys.length; d++) {
        var nodes = layerNodes[keys[d]];
        var count = nodes.length;
        /* 每层在竖向排列，节点之间留够间距 */
        var startY = -(count - 1) * vGap / 2;
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          n.x = d * (SIZES.chW + 60) + (Math.random() - 0.5) * 10;
          n.y = startY + i * vGap + (Math.random() - 0.5) * 8;
          n.vx = 0;
          n.vy = 0;
        }
      }
    } else {
      /* ---- 横屏/桌面：横向铺开（原逻辑） ---- */
      var layerSpread = 300;
      for (var d = 0; d < keys.length; d++) {
        var nodes = layerNodes[keys[d]];
        var count = nodes.length;
        var startX = -(count - 1) * layerSpread / 2;
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          n.x = startX + i * layerSpread + (Math.random() - 0.5) * 30;
          n.y = n.depth * (SIZES.chH + SIZES.layerGap) + (Math.random() - 0.5) * 15;
          n.vx = 0;
          n.vy = 0;
        }
      }
    }

    /* 4. force simulation */
    var repel = isPortrait ? 35000 : 60000;
    var attract = isPortrait ? 0.012 : 0.008;
    var idealLen = isPortrait ? 90 : 130;
    var layerPull = isPortrait ? 0.05 : 0.03;
    var centerPull = isPortrait ? 0.003 : 0.002;
    var damp = 0.8;
    var iters = 200;

    for (var iter = 0; iter < iters; iter++) {
      /* repulsion between all node pairs */
      for (var i = 0; i < this.nodes.length; i++) {
        for (var j = i + 1; j < this.nodes.length; j++) {
          var a = this.nodes[i], b = this.nodes[j];
          var dx = a.x - b.x;
          var dy = a.y - b.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var force = repel / (dist * dist);
          var fx = force * dx / dist;
          var fy = force * dy / dist;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }

      /* attraction along edges */
      for (var i = 0; i < this.edges.length; i++) {
        var src = this.nMap[this.edges[i].source];
        var tgt = this.nMap[this.edges[i].target];
        if (!src || !tgt) continue;
        var dx = tgt.x - src.x;
        var dy = tgt.y - src.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var force = (dist - idealLen) * attract;
        var fx = force * dx / dist;
        var fy = force * dy / dist;
        src.vx += fx; src.vy += fy;
        tgt.vx -= fx; tgt.vy -= fy;
      }

      /* layer gravity + apply */
      for (var i = 0; i < this.nodes.length; i++) {
        var n = this.nodes[i];
        if (isPortrait) {
          /* 竖屏：拉向右侧层级位置 */
          var targetX = n.depth * (SIZES.chW + 60);
          n.vx += (targetX - n.x) * layerPull;
          n.vy += (0 - n.y) * centerPull;
        } else {
          /* 横屏：拉向下方层级位置 */
          var targetY = n.depth * (SIZES.chH + SIZES.layerGap);
          n.vy += (targetY - n.y) * layerPull;
          n.vx += (0 - n.x) * centerPull;
        }
        n.vx *= damp;
        n.vy *= damp;
        n.x += n.vx;
        n.y += n.vy;
      }
    }

    /* 5. clear velocities for dragging */
    for (var i = 0; i < this.nodes.length; i++) {
      this.nodes[i].vx = 0;
      this.nodes[i].vy = 0;
    }
  };

  /* ==================================================================
   *  View helpers
   * ================================================================*/
  KnowledgeGraph.prototype._fitView = function() {
    if (!this.nodes.length) return;
    var padding = 60;
    var minX = Infinity, maxX = -Infinity;
    var minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      var hw = n.w / 2, hh = n.h / 2;
      if (n.x - hw < minX) minX = n.x - hw;
      if (n.x + hw > maxX) maxX = n.x + hw;
      if (n.y - hh < minY) minY = n.y - hh;
      if (n.y + hh > maxY) maxY = n.y + hh;
    }
    var graphW = maxX - minX, graphH = maxY - minY;
    var availW = this._w - padding * 2, availH = this._h - padding * 2;
    var sc = Math.min(availW / graphW, availH / graphH, 1.2);
    sc = Math.max(sc, this._minScale);
    this._scT = sc;
    this._txT = (this._w - (minX + maxX) * sc) / 2;
    this._tyT = padding;
    this.scale = this._scT;
    this.tx = this._txT;
    this.ty = this._tyT;
  };

  KnowledgeGraph.prototype._resize = function() {
    var rect = this.canvas.parentElement.getBoundingClientRect();
    this._w = rect.width;
    this._h = rect.height;
    this.canvas.width = this._w * this._dpr;
    this.canvas.height = this._h * this._dpr;
    this.canvas.style.width = this._w + 'px';
    this.canvas.style.height = this._h + 'px';
  };

  /* ==================================================================
   *  Render loop
   * ================================================================*/
  KnowledgeGraph.prototype._frame = function() {
    this._rAF = null;
    if (!this._needsRender) return;
    this._needsRender = false;

    var ctx = this.ctx, dpr = this._dpr, W = this._w, H = this._h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* background */
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H);

    /* grid */
    this._drawGrid(ctx, W, H);

    /* no nodes — show hint */
    if (!this.nodes.length) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '16px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('请先选择一个题库', W / 2, H / 2);
      return;
    }

    /* apply transform */
    ctx.save();
    ctx.translate(this.tx, this.ty);
    ctx.scale(this.scale, this.scale);

    /* edges */
    for (var i = 0; i < this.edges.length; i++) this._drawEdge(ctx, this.edges[i]);

    /* nodes */
    for (var i = 0; i < this.nodes.length; i++) this._drawNode(ctx, this.nodes[i]);

    ctx.restore();

    /* legend */
    this._drawLegend(ctx, W, H);
  };

  /* ==================================================================
   *  Drawing helpers
   * ================================================================*/
  KnowledgeGraph.prototype._drawGrid = function(ctx, W, H) {
    ctx.save();
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    var step = 40;
    for (var x = step; x < W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (var y = step; y < H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
  };

  KnowledgeGraph.prototype._drawEdge = function(ctx, edge) {
    var src = this.nMap[edge.source];
    var tgt = this.nMap[edge.target];
    if (!src || !tgt) return;

    var isPortrait = this._h > this._w;

    ctx.save();
    ctx.strokeStyle = EDGE_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();

    if (isPortrait) {
      /* 竖屏：从父节点右侧 → 子节点左侧 */
      var sx = src.x + src.w / 2, sy = src.y;
      var tx = tgt.x - tgt.w / 2, ty = tgt.y;
      ctx.moveTo(sx, sy);
      var cx1 = sx + (tx - sx) * 0.5;
      var cx2 = tx - (tx - sx) * 0.5;
      ctx.bezierCurveTo(cx1, sy, cx2, ty, tx, ty);
      ctx.stroke();

      if (this._hover && (this._hover.id === edge.source || this._hover.id === edge.target)) {
        ctx.strokeStyle = 'rgba(59,130,246,0.25)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(cx1, sy, cx2, ty, tx, ty);
        ctx.stroke();
      }
    } else {
      /* 横屏：从父节点底部 → 子节点顶部 */
      ctx.moveTo(src.x, src.y + src.h / 2);
      var cy1 = src.y + src.h / 2 + (tgt.y - tgt.h / 2 - src.y - src.h / 2) * 0.5;
      var cy2 = tgt.y - tgt.h / 2 - (tgt.y - tgt.h / 2 - src.y - src.h / 2) * 0.5;
      ctx.bezierCurveTo(src.x, cy1, tgt.x, cy2, tgt.x, tgt.y - tgt.h / 2);
      ctx.stroke();

      if (this._hover && (this._hover.id === edge.source || this._hover.id === edge.target)) {
        ctx.strokeStyle = 'rgba(59,130,246,0.25)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y + src.h / 2);
        ctx.bezierCurveTo(src.x, cy1, tgt.x, cy2, tgt.x, tgt.y - tgt.h / 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  KnowledgeGraph.prototype._drawNode = function(ctx, node) {
    var r = (node.type === 'root') ? SIZES.rootR : (node.type === 'chapter') ? SIZES.chR : SIZES.tpR;
    var w = node.w, h = node.h;
    var x = node.x - w / 2, y = node.y - h / 2;
    var color = node.color || ROOT_COLOR;
    var isHover = this._hover && this._hover.id === node.id;

    /* shadow */
    ctx.save();
    ctx.shadowColor = isHover ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.10)';
    ctx.shadowBlur = isHover ? 16 : 8;
    ctx.shadowOffsetY = isHover ? 4 : 2;
    this._roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = isHover ? this._lighten(color.bg, 20) : color.bg;
    ctx.fill();
    ctx.restore();

    /* border on root */
    if (node.type === 'root') {
      ctx.save();
      this._roundRect(ctx, x, y, w, h, r);
      ctx.strokeStyle = color.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    /* label */
    ctx.save();
    ctx.fillStyle = color.fg;
    var fontSize = (node.type === 'root') ? 14 : (node.type === 'chapter') ? 13 : 12;
    ctx.font = (node.type === 'root' ? 'bold ' : '') + fontSize + 'px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, node.x, node.y - (node.type === 'topic' ? 1 : 0));
    ctx.restore();

    /* count badge for chapters and topics */
    if (node.type !== 'root' && node.count > 0) {
      var badgeText = node.count + '';
      ctx.save();
      ctx.font = '10px -apple-system, sans-serif';
      var bw = ctx.measureText(badgeText).width + 10;
      var bh = 16;
      var bx = node.x + w / 2 - bw - 4;
      var by = node.y - h / 2 - bh / 2 + 2;
      ctx.shadowColor = 'rgba(0,0,0,0.06)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      this._roundRect(ctx, bx, by, bw, bh, bh / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#64748B';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + bw / 2, by + bh / 2);
      ctx.restore();
    }
  };

  KnowledgeGraph.prototype._drawLegend = function(ctx, W, H) {
    if (this.nodes.length === 0) return;
    /* collect unique chapter colors */
    var seen = {};
    var legend = [];
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      if (n.type !== 'chapter' || seen[n.color.bg]) continue;
      seen[n.color.bg] = true;
      legend.push({ label: n.fullLabel, color: n.color });
    }
    if (legend.length < 2) return;

    ctx.save();
    var lx = 16, ly = H - 16 - legend.length * 22;
    ctx.globalAlpha = 0.85;
    for (var i = 0; i < legend.length; i++) {
      var l = legend[i];
      ctx.fillStyle = l.color.bg;
      this._roundRect(ctx, lx, ly + i * 22, 12, 12, 3);
      ctx.fill();
      ctx.fillStyle = '#64748B';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(l.label, lx + 18, ly + i * 22 + 6);
    }
    ctx.restore();
  };

  KnowledgeGraph.prototype._roundRect = function(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  KnowledgeGraph.prototype._lighten = function(hex, amt) {
    var c = parseInt(hex.slice(1), 16);
    var r = Math.min(255, (c >> 16) + amt);
    var g = Math.min(255, ((c >> 8) & 0xFF) + amt);
    var b = Math.min(255, (c & 0xFF) + amt);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  };

  /* ==================================================================
   *  Event binding
   * ================================================================*/
  KnowledgeGraph.prototype._bind = function() {
    this._onResize = this._resize.bind(this);
    this._onFrame = this._frame.bind(this);
    window.addEventListener('resize', this._onResize);

    var c = this.canvas;
    c.addEventListener('mousedown', this._onMouseDown.bind(this));
    c.addEventListener('mousemove', this._onMouseMove.bind(this));
    c.addEventListener('mouseup', this._onMouseUp.bind(this));
    c.addEventListener('mouseleave', this._onMouseLeave.bind(this));
    c.addEventListener('wheel', this._onWheel.bind(this), { passive: false });
    c.addEventListener('click', this._onClick.bind(this));
    /* touch */
    this._lastTap = 0;
    this._lastTapX = 0;
    this._lastTapY = 0;
    this._pinchDist = 0;
    this._pinchCX = 0;
    this._pinchCY = 0;
    c.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: false });
    c.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
    c.addEventListener('touchend', this._onTouchEnd.bind(this));
  };

  KnowledgeGraph.prototype._unbind = function() {
    window.removeEventListener('resize', this._onResize);
  };

  /* ---- hit test ---- */
  KnowledgeGraph.prototype._hitTest = function(wx, wy) {
    for (var i = this.nodes.length - 1; i >= 0; i--) {
      var n = this.nodes[i];
      if (wx >= n.x - n.w / 2 && wx <= n.x + n.w / 2 &&
          wy >= n.y - n.h / 2 && wy <= n.y + n.h / 2) {
        return n;
      }
    }
    return null;
  };

  KnowledgeGraph.prototype._screenToWorld = function(sx, sy) {
    return {
      x: (sx - this.tx) / this.scale,
      y: (sy - this.ty) / this.scale
    };
  };

  /* ---- mouse ---- */
  KnowledgeGraph.prototype._onMouseDown = function(e) {
    var rect = this.canvas.getBoundingClientRect();
    var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    var w = this._screenToWorld(sx, sy);

    var hit = this._hitTest(w.x, w.y);
    if (hit) {
      /* start dragging node */
      this._dragNode = hit;
      this._dragOffX = w.x - hit.x;
      this._dragOffY = w.y - hit.y;
    } else {
      /* start panning */
      this._panning = true;
      this._panSX = sx;
      this._panSY = sy;
      this._panTX = this.tx;
      this._panTY = this.ty;
    }
  };

  KnowledgeGraph.prototype._onMouseMove = function(e) {
    var rect = this.canvas.getBoundingClientRect();
    var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    var w = this._screenToWorld(sx, sy);

    if (this._dragNode) {
      this._dragNode.x = w.x - this._dragOffX;
      this._dragNode.y = w.y - this._dragOffY;
      this.render();
      return;
    }

    if (this._panning) {
      this.tx = this._panTX + (sx - this._panSX);
      this.ty = this._panTY + (sy - this._panSY);
      this.render();
      return;
    }

    /* hover */
    var hit = this._hitTest(w.x, w.y);
    if (hit !== this._hover) {
      this._hover = hit;
      this.canvas.style.cursor = hit ? 'pointer' : 'grab';
      this.render();
    }
  };

  KnowledgeGraph.prototype._onMouseUp = function() {
    this._dragNode = null;
    this._panning = false;
  };

  KnowledgeGraph.prototype._onMouseLeave = function() {
    this._dragNode = null;
    this._panning = false;
    if (this._hover) {
      this._hover = null;
      this.canvas.style.cursor = '';
      this.render();
    }
  };

  KnowledgeGraph.prototype._onClick = function(e) {
    if (this._dragNode) return;
    var rect = this.canvas.getBoundingClientRect();
    var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    var w = this._screenToWorld(sx, sy);
    var hit = this._hitTest(w.x, w.y);

    if (hit && hit.type === 'topic' && this.cb.onTopicClick) {
      this.cb.onTopicClick(hit.fullLabel);
    } else if (hit && hit.type === 'chapter' && this.cb.onChapterClick) {
      this.cb.onChapterClick(hit.fullLabel);
    }
  };

  /* ---- wheel ---- */
  KnowledgeGraph.prototype._onWheel = function(e) {
    e.preventDefault();
    var rect = this.canvas.getBoundingClientRect();
    var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    var w = this._screenToWorld(sx, sy);

    var delta = -e.deltaY * 0.001;
    var newScale = this.scale * (1 + delta);
    newScale = Math.max(this._minScale, Math.min(this._maxScale, newScale));

    /* zoom toward mouse position */
    this.tx = sx - (sx - this.tx) * (newScale / this.scale);
    this.ty = sy - (sy - this.ty) * (newScale / this.scale);
    this.scale = newScale;

    this.render();
  };

  /* ---- touch ---- */
  KnowledgeGraph.prototype._getTouchDist = function(t1, t2) {
    var dx = t1.clientX - t2.clientX;
    var dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  KnowledgeGraph.prototype._onTouchStart = function(e) {
    var now = Date.now();

    if (e.touches.length === 2) {
      /* pinch start — cancel any drag/pan */
      this._dragNode = null;
      this._panning = false;
      var rect = this.canvas.getBoundingClientRect();
      var t0 = e.touches[0], t1 = e.touches[1];
      this._pinchDist = this._getTouchDist(t0, t1);
      this._pinchCX = (t0.clientX + t1.clientX) / 2 - rect.left;
      this._pinchCY = (t0.clientY + t1.clientY) / 2 - rect.top;
      this._pinchScale0 = this.scale;
      this._pinchTX0 = this.tx;
      this._pinchTY0 = this.ty;
      e.preventDefault();
      return;
    }

    if (e.touches.length === 1) {
      var t = e.touches[0];
      var rect = this.canvas.getBoundingClientRect();
      var sx = t.clientX - rect.left, sy = t.clientY - rect.top;

      /* double-tap detection */
      var tapGap = now - this._lastTap;
      var tapDist = Math.abs(sx - this._lastTapX) + Math.abs(sy - this._lastTapY);
      if (tapGap < 300 && tapDist < 30) {
        /* double-tap → toggle zoom */
        var w = this._screenToWorld(sx, sy);
        var targetScale = this.scale < 1.2 ? Math.min(this.scale * 2, this._maxScale) : this._minScale;
        var ratio = targetScale / this.scale;
        this.tx = sx - (sx - this.tx) * ratio;
        this.ty = sy - (sy - this.ty) * ratio;
        this.scale = targetScale;
        this.render();
        this._lastTap = 0;
        e.preventDefault();
        return;
      }
      this._lastTap = now;
      this._lastTapX = sx;
      this._lastTapY = sy;

      var w = this._screenToWorld(sx, sy);
      var hit = this._hitTest(w.x, w.y);
      if (hit) {
        this._dragNode = hit;
        this._dragOffX = w.x - hit.x;
        this._dragOffY = w.y - hit.y;
      } else {
        this._panning = true;
        this._panSX = sx;
        this._panSY = sy;
        this._panTX = this.tx;
        this._panTY = this.ty;
      }
    }
  };

  KnowledgeGraph.prototype._onTouchMove = function(e) {
    e.preventDefault();
    var rect = this.canvas.getBoundingClientRect();

    if (e.touches.length === 2) {
      /* pinch zoom */
      var t0 = e.touches[0], t1 = e.touches[1];
      var dist = this._getTouchDist(t0, t1);
      var cx = (t0.clientX + t1.clientX) / 2 - rect.left;
      var cy = (t0.clientY + t1.clientY) / 2 - rect.top;

      if (this._pinchDist > 0) {
        var ratio = dist / this._pinchDist;
        var newScale = Math.max(this._minScale, Math.min(this._maxScale, this._pinchScale0 * ratio));

        /* zoom toward pinch center */
        this.tx = cx - (cx - this._pinchTX0) * (newScale / this._pinchScale0);
        this.ty = cy - (cy - this._pinchTY0) * (newScale / this._pinchScale0);
        this.scale = newScale;
        this.render();
      }
      return;
    }

    if (e.touches.length === 1) {
      var t = e.touches[0];
      var sx = t.clientX - rect.left, sy = t.clientY - rect.top;

      if (this._dragNode) {
        var w = this._screenToWorld(sx, sy);
        this._dragNode.x = w.x - this._dragOffX;
        this._dragNode.y = w.y - this._dragOffY;
        this.render();
      } else if (this._panning) {
        this.tx = this._panTX + (sx - this._panSX);
        this.ty = this._panTY + (sy - this._panSY);
        this.render();
      }
    }
  };

  KnowledgeGraph.prototype._onTouchEnd = function(e) {
    if (e.touches.length === 0) {
      /* no remaining fingers — end all gestures */
      if (!this._dragNode && e.changedTouches.length === 1) {
        var t = e.changedTouches[0];
        var rect = this.canvas.getBoundingClientRect();
        var sx = t.clientX - rect.left, sy = t.clientY - rect.top;
        var w = this._screenToWorld(sx, sy);
        var hit = this._hitTest(w.x, w.y);
        if (hit && hit.type === 'topic' && this.cb.onTopicClick) {
          this.cb.onTopicClick(hit.fullLabel);
        } else if (hit && hit.type === 'chapter' && this.cb.onChapterClick) {
          this.cb.onChapterClick(hit.fullLabel);
        }
      }
      this._dragNode = null;
      this._panning = false;
      this._pinchDist = 0;
    } else if (e.touches.length === 1) {
      /* one finger lifted during pinch → start pan with remaining finger */
      this._pinchDist = 0;
      var t = e.touches[0];
      var rect = this.canvas.getBoundingClientRect();
      this._panning = true;
      this._panSX = t.clientX - rect.left;
      this._panSY = t.clientY - rect.top;
      this._panTX = this.tx;
      this._panTY = this.ty;
    }
  };

  /* ---- export ---- */
  global.KnowledgeGraph = KnowledgeGraph;
})(window);
