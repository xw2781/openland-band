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
      html += '<i style="--h:' + Math.max(0.1, h).toFixed(3) + '"></i>';
    }
    /* two layers (dim bars + a clipped bright copy) instead of one animated layer per bar */
    wave.innerHTML = '<span class="wave-dim">' + html + '</span><span class="wave-lit sd-in"><span class="sd-in">' + html + '</span></span>';
  }

  /* ── statement: split into characters that light up one by one ── */
  function splitStatement() {
    var st = $('#statementText');
    if (!st) return;
    var txt = st.textContent;
    if (!MOTION) return;
    st.setAttribute('aria-label', txt);
    var out = '', n = txt.length;
    /* phones (quote not pinned): finish lighting while the quote is still mid-screen */
    var K = window.innerWidth < 721 ? 0.58 : 0.8, S0 = window.innerWidth < 721 ? 0.1 : 0.04;
    for (var c = 0; c < n; c++) {
      var a = S0 + K * (c / (n || 1));
      var ch = txt.charAt(c);
      if (ch === '&') ch = '&amp;';
      else if (ch === '<') ch = '&lt;';
      else if (ch === '>') ch = '&gt;';
      out += '<span class="ch sd-in rg-contain" aria-hidden="true" style="--s:' + a.toFixed(4) + ';--e:' + (a + K * 5 / (n || 1)).toFixed(4) + '">' + ch + '</span>';
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

  /* ── stable viewport height ──
     Phones resize the visual viewport whenever the browser toolbar collapses (and many in-app
     browsers resize 100vh with it). Anything derived from that height would re-layout mid-scroll,
     so on touch devices the two height units the layout uses are locked to pixels once and only
     refreshed when the WIDTH changes (rotation / real resize). Height-only resizes are ignored. */
  var probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:100vh;height:100lvh';
  var probeS = probe.cloneNode(false);
  probeS.style.cssText = 'position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:100vh;height:100svh';
  document.body.appendChild(probe); document.body.appendChild(probeS);
  var COARSE = !!(window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches);
  var VW = 0, VH = 0;
  function lockViewport(force) {
    var w = root.clientWidth;
    if (!force && COARSE && w === VW) return false;
    var h = probe.offsetHeight || window.innerHeight, sh = probeS.offsetHeight || h;
    if (w === VW && h === VH) return false;
    VW = w; VH = h;
    if (COARSE) {
      root.style.setProperty('--lvh', h + 'px');
      root.style.setProperty('--svh', Math.min(sh, h) + 'px');
    }
    root.classList.toggle('vh-tall', h >= 700);
    return true;
  }
  lockViewport(true);

  /* ── timeline: native horizontal carousel (counter, progress, arrows, drag, keys) ── */
  var hs = $('#hscroll'), tl = $('#timeline');
  var hsIdx = $('#hsIdx'), hsLabel = $('#hsLabel'), hsBar = $('#hsBar');
  var hsPrev = $('#hsPrev'), hsNext = $('#hsNext');
  var events = tl ? $$('.event', tl) : [];
  var readLabels = function () {
    return events.map(function (ev) { var d = $('.event-date', ev); return d && d.firstChild ? d.firstChild.textContent.trim() : ''; });
  };
  var labels = readLabels();
  var hsTotal = hs && $('.hs-count em', hs);
  if (hsTotal && events.length) hsTotal.textContent = '/ ' + events.length;

  var curIdx = -1, hsPos = [], hsMax = 0, hsRaf = 0, tickFlip = false;
  function tick(el, text) {
    /* restart the little rise animation by swapping between two identical keyframes (no forced reflow) */
    if (!el) return;
    el.textContent = text;
    el.classList.remove(tickFlip ? 'tick' : 'tick2');
    el.classList.add(tickFlip ? 'tick2' : 'tick');
  }
  function measureHs() {
    if (!tl || !events.length) return;
    var cw = tl.clientWidth;
    hsMax = Math.max(0, tl.scrollWidth - cw);
    hsPos = events.map(function (ev) { return clamp(ev.offsetLeft + ev.offsetWidth / 2 - cw / 2, 0, hsMax); });
    updateHs(true);
  }
  function setIdx(i) {
    if (i === curIdx) return;
    if (events[curIdx]) events[curIdx].classList.remove('is-active');
    curIdx = i;
    events[i].classList.add('is-active');
    tickFlip = !tickFlip;
    tick(hsIdx, (i + 1 < 10 ? '0' : '') + (i + 1));
    tick(hsLabel, labels[i]);
    if (hsPrev) hsPrev.disabled = i === 0;
    if (hsNext) hsNext.disabled = i === events.length - 1;
  }
  function updateHs() {
    hsRaf = 0;
    if (!tl || !hsPos.length) return;
    var x = tl.scrollLeft, best = 0, bd = Infinity;
    for (var i = 0; i < hsPos.length; i++) { var d = Math.abs(hsPos[i] - x); if (d < bd) { bd = d; best = i; } }
    setIdx(best);
    if (hsBar) {
      var n = events.length, p = hsMax > 0 ? clamp(x / hsMax, 0, 1) : 0;
      hsBar.style.transform = 'scaleX(' + ((1 + (n - 1) * p) / n).toFixed(4) + ')';
    }
  }
  function hsGo(i, instant) {
    if (!tl || !hsPos.length) return;
    i = clamp(i, 0, events.length - 1);
    try { tl.scrollTo({ left: hsPos[i], behavior: instant ? 'auto' : 'smooth' }); }
    catch (e) { tl.scrollLeft = hsPos[i]; }
  }
  if (tl && events.length) {
    tl.addEventListener('scroll', function () { if (!hsRaf) hsRaf = requestAnimationFrame(updateHs); }, { passive: true });
    if (hsPrev) hsPrev.addEventListener('click', function () { hsGo(curIdx - 1); });
    if (hsNext) hsNext.addEventListener('click', function () { hsGo(curIdx + 1); });
    tl.addEventListener('keydown', function (e) {
      if (e.target !== tl) return;
      var k = e.key;
      if (k === 'ArrowRight' || k === 'Right') { e.preventDefault(); hsGo(curIdx + 1); }
      else if (k === 'ArrowLeft' || k === 'Left') { e.preventDefault(); hsGo(curIdx - 1); }
      else if (k === 'Home') { e.preventDefault(); hsGo(0); }
      else if (k === 'End') { e.preventDefault(); hsGo(events.length - 1); }
    });

    /* mouse: click-drag to pan (touch / trackpad / shift+wheel are native) */
    var drag = null, settleT = 0, swallowClick = false;
    var settle = function () { clearTimeout(settleT); tl.classList.remove('is-dragging'); };
    tl.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (e.target.closest && e.target.closest('.duo-show, video, button, input, .has-player.playing')) return;
      drag = { x: e.clientX, left: tl.scrollLeft, id: e.pointerId, moved: false, lx: e.clientX, lt: e.timeStamp, v: 0 };
    });
    tl.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < 6) return;
        drag.moved = true;
        clearTimeout(settleT);
        tl.classList.add('is-dragging');
        try { tl.setPointerCapture(drag.id); } catch (err) {}
      }
      var dt = e.timeStamp - drag.lt;
      if (dt > 0) { drag.v = 0.7 * (e.clientX - drag.lx) / dt + 0.3 * drag.v; drag.lx = e.clientX; drag.lt = e.timeStamp; }
      tl.scrollLeft = drag.left - dx;
    });
    var endDrag = function (e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var d = drag; drag = null;
      if (!d.moved) return;
      swallowClick = true; setTimeout(function () { swallowClick = false; }, 60);
      var aim = tl.scrollLeft - d.v * 220, best = 0, bd = Infinity;
      for (var i = 0; i < hsPos.length; i++) { var dd = Math.abs(hsPos[i] - aim); if (dd < bd) { bd = dd; best = i; } }
      hsGo(best);
      settleT = setTimeout(settle, 520); /* snapping comes back once the glide has landed */
    };
    tl.addEventListener('pointerup', endDrag);
    tl.addEventListener('pointercancel', endDrag);
    tl.addEventListener('click', function (e) { if (swallowClick) { e.preventDefault(); e.stopPropagation(); } }, true);
    tl.addEventListener('dragstart', function (e) { e.preventDefault(); });
    measureHs();
  }

  /* ── in-page links glide (native scrollIntoView; html no longer has scroll-behavior: smooth) ── */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var id = a.getAttribute('href').slice(1), t = id && document.getElementById(id);
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { history.pushState(null, '', '#' + id); } catch (err) {}
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
    var y = window.pageYOffset, vh = VH;
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
    requestAnimationFrame(function () { ticking = false; update(); });
  }
  /* content changed size (fonts, language, images): re-measure. Never triggered by scrolling. */
  var remeasure = function () { if (FALLBACK) { measure(); update(); } measureHs(); };
  /* window resize: only act when the width (or, on desktop, the real height) changed.
     The toolbar-collapse resizes that phones fire while scrolling are dropped here. */
  var onResize = function () { if (lockViewport(false)) remeasure(); };

  if (FALLBACK) {
    collect(); measure(); update();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', function () { setTimeout(function () { if (lockViewport(true)) remeasure(); }, 250); });
  window.addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  if (FALLBACK && 'ResizeObserver' in window) {
    var roT = 0, roH = 0;
    new ResizeObserver(function (es) {
      var h = es[0] && es[0].contentRect ? Math.round(es[0].contentRect.height) : -1;
      if (h === roH) return; roH = h;
      clearTimeout(roT); roT = setTimeout(remeasure, 120);
    }).observe(document.body);
  }

  window.OPENLAND_MOTION = {
    onLang: function () {
      splitStatement();
      labels = readLabels();
      if (curIdx >= 0) tick(hsLabel, labels[curIdx]);
      remeasure();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    },
    /* bring a timeline card to the centre of the carousel (used by the now-playing chip) */
    showEvent: function (el) {
      var i = events.indexOf(el);
      if (i >= 0) hsGo(i);
    }
  };
})();
