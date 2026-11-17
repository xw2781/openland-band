/* Openland 旷野乐队 — motion layer
   - html.sda : native CSS scroll-driven animations do the scrubbing; this file only adds
                the small things CSS cannot do (text split, counters, tilt, cursor light).
   - html.sdf : additionally runs a rAF engine that writes range progress into custom
                properties; the same CSS keyframes are scrubbed through animation-delay.
   - no class : reduced motion / static. Nothing below animates. */
(function () {
  'use strict';
  var root = document.documentElement;
  var MOTION = root.classList.contains('motion');
  var FALLBACK = root.classList.contains('sdf');
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ── sound-wave motif: a waveform that "plays" as it crosses the viewport ── */
  var wave = $('#wave');
  if (wave) {
    var N = window.innerWidth < 720 ? 44 : 72, html = '';
    for (var k = 0; k < N; k++) {
      var t = k / (N - 1);
      var env = 0.35 + 0.65 * Math.sin(Math.PI * t);
      var h = env * (0.3 + 0.7 * Math.abs(Math.sin(k * 0.9) * Math.cos(k * 0.37 + 1.1)));
      var s = 0.12 + 0.38 * t;
      html += '<i class="sd-in" style="--h:' + Math.max(0.1, h).toFixed(3) + ';--s:' + s.toFixed(3) + ';--e:' + (s + 0.1).toFixed(3) + '"></i>';
    }
    wave.innerHTML = html;
  }

  /* ── statement: split into characters that light up one by one ── */
  function splitStatement() {
    var st = $('#statementText');
    if (!st) return;
    var txt = st.textContent;
    if (!MOTION) return;
    st.setAttribute('aria-label', txt);
    var out = '', n = txt.length;
    for (var c = 0; c < n; c++) {
      var a = 0.04 + 0.8 * (c / (n || 1));
      var ch = txt.charAt(c);
      if (ch === '&') ch = '&amp;';
      else if (ch === '<') ch = '&lt;';
      else if (ch === '>') ch = '&gt;';
      out += '<span class="ch sd-in rg-contain" aria-hidden="true" style="--s:' + a.toFixed(4) + ';--e:' + (a + 0.8 * 5 / (n || 1)).toFixed(4) + '">' + ch + '</span>';
    }
    st.innerHTML = out;
  }
  splitStatement();

  /* ── number counters ── */
  var nums = $$('.num[data-count]');
  if (MOTION && 'IntersectionObserver' in window) {
    var runCount = function (el) {
      var to = +el.getAttribute('data-count'), from = +(el.getAttribute('data-from') || 0);
      var t0 = null, dur = 1500;
      el.textContent = from;
      requestAnimationFrame(function step(ts) {
        if (t0 === null) t0 = ts;
        var p = clamp((ts - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(step);
      });
    };
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); runCount(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.2 });
    nums.forEach(function (el) { io.observe(el); });
  }

  if (!MOTION) return;

  /* ── horizontal timeline: counter + date label, keyboard focus support ── */
  var hs = $('#hscroll'), hsStage = hs && $('.hscroll-stage', hs);
  var hsIdx = $('#hsIdx'), hsLabel = $('#hsLabel');
  var events = hs ? $$('.event', hs) : [];
  var labels = events.map(function (ev) { var d = $('.event-date', ev); return d && d.firstChild ? d.firstChild.textContent.trim() : ''; });
  var hsTotal = hs && $('.hs-count em', hs);
  if (hsTotal && events.length) hsTotal.textContent = '/ ' + events.length;

  var curIdx = 0;
  function hsPinned() { return hsStage && getComputedStyle(hsStage).position === 'sticky'; }
  function tick(el, text) {
    el.textContent = text; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
  }
  function updateHs() {
    if (!hs || !events.length) return;
    var r = hs.getBoundingClientRect(), span = r.height - window.innerHeight;
    if (span <= 0) return;
    var i = Math.round(clamp(-r.top / span, 0, 1) * (events.length - 1));
    if (i !== curIdx) {
      curIdx = i;
      tick(hsIdx, (i + 1 < 10 ? '0' : '') + (i + 1));
      tick(hsLabel, labels[i]);
    }
  }
  events.forEach(function (ev, i) {
    ev.addEventListener('focusin', function () {
      if (!hsPinned()) return;
      hsStage.scrollLeft = 0;
      if (i === curIdx) return;
      var top = hs.getBoundingClientRect().top + window.pageYOffset;
      var span = hs.offsetHeight - window.innerHeight;
      window.scrollTo(0, top + span * i / (events.length - 1));
    });
  });

  /* ── desktop: card tilt + cursor stage light ── */
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine) {
    $$('.member').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.classList.add('tilting');
        card.style.setProperty('--ry', ((x - 0.5) * 10).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - y) * 8).toFixed(2) + 'deg');
        card.style.setProperty('--gx', (x * r.width).toFixed(0) + 'px');
        card.style.setProperty('--gy', (y * r.height).toFixed(0) + 'px');
      });
      card.addEventListener('pointerleave', function () {
        card.classList.remove('tilting');
        card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg');
      });
    });
    var glow = $('#cursorGlow');
    if (glow) {
      var gx = 0, gy = 0, tx = 0, ty = 0, raf = 0;
      var loop = function () {
        gx += (tx - gx) * 0.14; gy += (ty - gy) * 0.14;
        glow.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)';
        raf = (Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5) ? requestAnimationFrame(loop) : 0;
      };
      window.addEventListener('pointermove', function (e) {
        tx = e.clientX; ty = e.clientY;
        if (!glow.classList.contains('on')) { gx = tx; gy = ty; glow.classList.add('on'); }
        if (!raf) raf = requestAnimationFrame(loop);
      }, { passive: true });
      document.addEventListener('pointerleave', function () { glow.classList.remove('on'); });
    }
  }

  /* ── fallback engine (Safari / iOS / Firefox without animation-timeline) ── */
  var items = [], songs = [], songGrid = $('#songGrid'), navBar = $('.nav-progress');
  function absTop(el) { var y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; }

  function collect() {
    var followers = {};
    $$('[data-follow]').forEach(function (f) {
      var sel = f.getAttribute('data-follow');
      (followers[sel] = followers[sel] || []).push(f);
    });
    var seen = [];
    $$('.tl, .sd').forEach(function (el) { seen.push(el); items.push({ el: el, targets: [el], top: 0, h: 0, key: '' }); });
    Object.keys(followers).forEach(function (sel) {
      var el = $(sel); if (!el) return;
      var i = seen.indexOf(el);
      if (i >= 0) items[i].targets = items[i].targets.concat(followers[sel]);
      else items.push({ el: el, targets: followers[sel], top: 0, h: 0, key: '' });
    });
    if (songGrid) songs = $$('.song', songGrid).map(function (el) { return { el: el, top: 0, h: 0, stick: 0, key: '' }; });
  }
  function measure() {
    for (var i = 0; i < items.length; i++) {
      items[i].top = absTop(items[i].el); items[i].h = items[i].el.offsetHeight; items[i].key = '';
    }
    if (songGrid) {
      var y = absTop(songGrid);
      songs.forEach(function (s) {
        var cs = getComputedStyle(s.el);
        s.top = y; s.h = s.el.offsetHeight;
        s.stick = cs.position === 'sticky' ? (parseFloat(cs.top) || 0) : -1;
        y += s.h + (parseFloat(cs.marginBottom) || 0);
        s.key = '';
      });
    }
  }
  function f4(v) { return clamp(v, -1, 2).toFixed(4); }
  function update() {
    var y = window.pageYOffset, vh = window.innerHeight;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], a = y + vh - it.top, h = it.h;
      var state = a < -vh * 0.6 ? 'b' : (y > it.top + h + vh * 0.6 ? 'a' : '');
      if (state && it.key === state) continue;
      var m = Math.min(vh, h) || 1;
      var p = a / (vh + h), pe = a / m, px = (y - (it.top + h - m)) / m;
      var pc = h >= vh ? (y - it.top) / ((h - vh) || 1) : (y - (it.top + h - vh)) / ((vh - h) || 1);
      var key = state || (p.toFixed(4) + '|' + vh);
      if (key === it.key) continue;
      it.key = key;
      for (var j = 0; j < it.targets.length; j++) {
        var st = it.targets[j].style;
        st.setProperty('--p', f4(p)); st.setProperty('--pe', f4(pe));
        st.setProperty('--pc', f4(pc)); st.setProperty('--px', f4(px));
      }
    }
    for (var k = 0; k < songs.length; k++) {
      var s = songs[k], nx = songs[k + 1];
      var sp = (y + vh - s.top) / (vh + s.h);
      var pu = (nx && nx.stick >= 0) ? (y + vh - nx.top) / (vh - nx.stick) : 0;
      var sk = f4(sp) + f4(pu);
      if (sk !== s.key) {
        s.key = sk;
        s.el.style.setProperty('--p', f4(sp));
        s.el.style.setProperty('--pu', clamp(pu, 0, 1).toFixed(4));
      }
    }
    if (navBar) {
      var max = document.documentElement.scrollHeight - vh;
      navBar.style.setProperty('--p', max > 0 ? clamp(y / max, 0, 1).toFixed(4) : '0');
    }
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; if (FALLBACK) update(); updateHs(); });
  }
  var remeasure = function () { if (FALLBACK) { measure(); update(); } updateHs(); };

  if (FALLBACK) { collect(); measure(); update(); }
  updateHs();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', remeasure);
  window.addEventListener('load', remeasure);
  if (FALLBACK) {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    if ('ResizeObserver' in window) {
      var roT = 0;
      new ResizeObserver(function () { clearTimeout(roT); roT = setTimeout(remeasure, 120); }).observe(document.body);
    }
  }

  window.OPENLAND_MOTION = {
    onLang: function () {
      splitStatement();
      labels = events.map(function (ev) { var d = $('.event-date', ev); return d && d.firstChild ? d.firstChild.textContent.trim() : ''; });
      curIdx = -1;
      var reflow = function () { if (FALLBACK) { /* items already collected */ measure(); update(); } updateHs(); };
      reflow();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(reflow);
    }
  };
})();
