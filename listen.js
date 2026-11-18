/* Openland audio player -- released singles */
(function () {
  'use strict';
  var root = document.getElementById('listen');
  var audio = document.getElementById('listenAudio');
  if (!root || !audio) return;

  var TRACKS = {
    huiyi: {
      id: 'huiyi',
      title: '回忆成光',
      titleFull: '《回忆成光》',
      artist: 'Openland',
      duration: 330.024,
      sources: [
        { src: 'audio/huiyi-chengguang.m4a', type: 'audio/mp4' },
        { src: 'audio/huiyi-chengguang.mp3', type: 'audio/mpeg' }
      ],
      cover: 'img/cover-huiyi-chengguang.webp',
      thumb: 'img/s/cover-huiyi-chengguang-320.webp',
      coverPos: '50% 50%',
      lyrics: 'audio/lyrics/huiyi-chengguang.json',
      ariaPlay: 'aria187'
    },
    waiting: {
      id: 'waiting',
      title: 'Waiting For You',
      titleFull: '《Waiting For You》',
      artist: 'Openland',
      duration: 259.77,
      sources: [
        { src: 'audio/waiting-for-you.m4a', type: 'audio/mp4' },
        { src: 'audio/waiting-for-you.mp3', type: 'audio/mpeg' }
      ],
      cover: 'img/n11-3.webp',
      thumb: 'img/s/n11-3-320.webp',
      coverPos: '50% 50%',
      lyrics: 'audio/lyrics/waiting-for-you.json',
      ariaPlay: 'aria188'
    }
  };
  var ORDER = ['huiyi', 'waiting'];

  var LABELS = {
    zh: { play: '播放', pause: '暂停', seek: '播放进度', now: '正在播放' },
    en: { play: 'Play', pause: 'Pause', seek: 'Seek', now: 'Now playing' },
    ja: { play: '再生', pause: '一時停止', seek: '再生位置', now: '再生中' },
    ko: { play: '재생', pause: '일시정지', seek: '재생 위치', now: '재생 중' }
  };

  var playBtn = document.getElementById('listenPlay');
  var titleEl = document.getElementById('listenTitle');
  var artEl = document.getElementById('listenArt');
  var curEl = document.getElementById('listenCur');
  var durEl = document.getElementById('listenDur');
  var seekEl = document.getElementById('listenSeek');
  var liveEl = document.getElementById('listenLive');
  var lyricsRoot = document.getElementById('listenLyrics');
  var lyricsView = document.getElementById('listenLyricsView');
  var lyricsList = document.getElementById('listenLyricsList');
  var lyricsNote = document.getElementById('listenLyricsNote');
  var lyricsScrub = document.getElementById('listenLyricsScrub');
  var lyricsScrubTime = document.getElementById('listenLyricsScrubTime');
  var current = TRACKS.huiyi;
  var seeking = false;
  var lyricsData = null;
  var lyricLines = []; /* {t, te, text, tr, el, index} */
  var lyricActive = -1;
  var lyricFollow = true;
  var lyricPreviewT = null;
  var lyricScrubbing = false;
  var lyricFollowTimer = 0;
  var lyricPointer = null;
  var lyricSwallowClick = false;
  var lyricY = 0;       /* current translateY of the list (px) */
  var lyricViewH = 0;   /* cached height of the fixed lyrics viewport */
  var glowEl = root.querySelector('.listen-glow');
  var haloEl = root.querySelector('.listen-halo');
  var haloGlowEl = root.querySelector('.listen-halo-glow');
  var lastPulse = -1, lastProg = '', lastCur = '', lastNow = -1;
  var levels = null;    /* 5 band levels (0..1) for the nav now-playing chip, null when unavailable */
  var ctx = null, analyser = null, sourceNode = null, freq = null;
  var rafViz = 0;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (window.matchMedia) {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
      reduce = e.matches;
      root.classList.toggle('is-reduced', reduce);
      if (reduce) setPulse(0);
    });
  }
  root.classList.toggle('is-reduced', reduce);

  function siteLang() {
    var l = (document.documentElement.lang || 'zh').toLowerCase();
    if (l.indexOf('zh') === 0) return 'zh';
    if (l.indexOf('ja') === 0) return 'ja';
    if (l.indexOf('ko') === 0) return 'ko';
    if (l.indexOf('en') === 0) return 'en';
    return 'zh';
  }
  function labels() { return LABELS[siteLang()] || LABELS.zh; }
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    t = Math.floor(t);
    var m = Math.floor(t / 60), s = t % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function playing() { return !audio.paused && !audio.ended; }

  function setSources(track) {
    while (audio.firstChild) audio.removeChild(audio.firstChild);
    track.sources.forEach(function (s) {
      var el = document.createElement('source');
      el.src = s.src; el.type = s.type;
      audio.appendChild(el);
    });
    audio.preload = 'none';
    audio.load();
  }


  function applyTrack(track, keepTime) {
    var wasPlaying = playing();
    var t = keepTime ? audio.currentTime : 0;
    pendingT = null;
    current = track;
    setSources(track);
    titleEl.textContent = track.titleFull;
    artEl.src = track.thumb || track.cover; /* the disc label is ~80px: no need to decode the 1254px cover */
    artEl.style.objectPosition = track.coverPos || '50% 50%';
    artEl.alt = track.titleFull;
    durEl.textContent = fmt(track.duration);
    setCur(t);
    seekEl.setAttribute('aria-valuemax', String(Math.floor(track.duration)));
    root.querySelectorAll('.listen-track').forEach(function (b) {
      var on = b.getAttribute('data-track') === track.id;
      b.classList.toggle('is-current', on);
      b.setAttribute('aria-current', on ? 'true' : 'false');
    });
    updateSeek();
    updatePlayUi();
    updateSongButtons();
    loadLyrics(track);
    if (keepTime) {
      audio.addEventListener('loadedmetadata', function once() {
        audio.removeEventListener('loadedmetadata', once);
        try { audio.currentTime = t; } catch (e) {}
      });
    }
    if (wasPlaying) {
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
    }
    setMediaSession();
    if (liveEl) liveEl.textContent = labels().now + ' — ' + track.titleFull;
  }

  function updatePlayUi() {
    var on = playing();
    root.classList.toggle('is-playing', on);
    playBtn.classList.toggle('is-playing', on);
    var lab = labels();
    playBtn.setAttribute('aria-label', on ? lab.pause : lab.play);
    playBtn.setAttribute('data-i18n-aria', on ? 'aria185' : 'aria184');
    playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function updateSongButtons() {
    document.querySelectorAll('.song-play').forEach(function (b) {
      var on = playing() && b.getAttribute('data-track') === current.id;
      b.classList.toggle('is-playing', on);
      var key = on ? 'aria185' : (TRACKS[b.getAttribute('data-track')] || {}).ariaPlay;
      var lab = labels();
      var track = TRACKS[b.getAttribute('data-track')];
      b.setAttribute('aria-label', on ? lab.pause : (lab.play + (track ? ' ' + track.titleFull : '')));
      if (key) b.setAttribute('data-i18n-aria', key);
    });
  }

  function pauseVideos() {
    document.querySelectorAll('video').forEach(function (v) { try { v.pause(); } catch (e) {} });
    var th = document.getElementById('theater');
    if (th && th.classList.contains('is-open')) {
      var close = th.querySelector('.theater-close');
      if (close) close.click();
    }
  }

  function ensureAudioGraph() {
    if (analyser) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      sourceNode = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;
      freq = new Uint8Array(analyser.frequencyBinCount);
      sourceNode.connect(analyser);
      analyser.connect(ctx.destination);
    } catch (e) {
      analyser = null;
    }
  }

  function toggle() {
    if (playing()) {
      audio.pause();
    } else {
      play();
    }
  }

  function play() {
    pauseVideos();
    ensureAudioGraph();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
    setMediaSession();
  }

  function onPlay() {
    pauseVideos();
    root.classList.add('is-playing');
    updatePlayUi();
    updateSongButtons();
    startAnim();
    setMediaSession();
  }
  function onPause() {
    updatePlayUi();
    updateSongButtons();
    if (!playing()) stopAnim();
  }

  /* ── seek bar ── */
  function currentTime() {
    if (seeking && seekEl._seekT != null) return seekEl._seekT;
    if (lyricPreviewT != null) return lyricPreviewT;
    if (pendingT != null) return pendingT;
    return audio.currentTime || 0;
  }
  /* seeking before the file has loaded (preload is "none") is remembered and applied on load */
  var pendingT = null;
  function seekAudio(t) {
    if (audio.readyState < 1) { pendingT = t; return; }
    pendingT = null;
    try { audio.currentTime = t; } catch (err) {}
  }
  /* text / custom-property writes only happen when the value really changed */
  function setCur(t) {
    var v = fmt(t);
    if (v !== lastCur) { lastCur = v; curEl.textContent = v; }
  }
  function updateSeek() {
    if (!seekEl) return;
    var dur = current.duration || 1;
    var t = currentTime();
    var prog = Math.max(0, Math.min(1, t / dur)).toFixed(4);
    if (prog !== lastProg) { lastProg = prog; seekEl.style.setProperty('--listen-prog', prog); }
    var now = Math.floor(t);
    if (now !== lastNow) { lastNow = now; seekEl.setAttribute('aria-valuenow', String(now)); }
  }

  function timeFromEvent(e) {
    var r = seekEl.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    return Math.max(0, Math.min(1, x)) * (current.duration || 0);
  }
  function beginSeek(e) {
    if (e.button != null && e.button !== 0) return;
    seeking = true;
    seekEl.classList.add('is-seeking');
    seekEl._seekT = timeFromEvent(e);
    setCur(seekEl._seekT);
    updateSeek();
    if (seekEl.setPointerCapture && e.pointerId != null) {
      try { seekEl.setPointerCapture(e.pointerId); } catch (err) {}
    }
    e.preventDefault();
  }
  function moveSeek(e) {
    if (!seeking) return;
    seekEl._seekT = timeFromEvent(e);
    setCur(seekEl._seekT);
    updateSeek();
  }
  function endSeek(e) {
    if (!seeking) return;
    seeking = false;
    seekEl.classList.remove('is-seeking');
    var t = seekEl._seekT != null ? seekEl._seekT : timeFromEvent(e);
    seekAudio(t);
    seekEl._seekT = null;
    setCur(t);
    updateSeek();
    lyricFollow = true;
    updateLyrics(true);
  }

  /* ── soft pulse from average energy: opacity + transform on pre-painted layers only ── */
  function setPulse(p) {
    if (Math.abs(p - lastPulse) < 0.02 && !(p === 0 && lastPulse !== 0)) return;
    lastPulse = p;
    if (glowEl) glowEl.style.opacity = p.toFixed(2);
    if (haloGlowEl) haloGlowEl.style.opacity = (p * 0.9).toFixed(2);
    if (haloEl) haloEl.style.transform = p ? 'scale(' + (1 + p * 0.028).toFixed(4) + ')' : '';
  }
  var BANDS = [[1, 3], [3, 6], [6, 11], [11, 19], [19, 32]];
  function updatePulse() {
    if (reduce || !analyser || !playing() || !freq) {
      levels = null;
      setPulse(0);
      return;
    }
    analyser.getByteFrequencyData(freq);
    var count = Math.max(1, Math.floor(freq.length * 0.6));
    var sum = 0;
    for (var i = 0; i < count; i++) sum += freq[i];
    setPulse(Math.min(1, (sum / count / 255) * 1.45));
    if (!levels) levels = [0, 0, 0, 0, 0];
    for (var b = 0; b < 5; b++) {
      var a = 0, lo = BANDS[b][0], hi = BANDS[b][1];
      for (var k = lo; k < hi; k++) a += freq[k];
      levels[b] = Math.min(1, a / (hi - lo) / 255 * (1 + b * 0.18));
    }
  }

  function tick() {
    rafViz = 0;
    if (!playing()) { updatePulse(); updateSeek(); updateLyrics(); return; }
    if (!seeking) setCur(currentTime());
    updateSeek();
    updatePulse();
    updateLyrics();
    if (window.OPENLAND_NOWPLAYING) window.OPENLAND_NOWPLAYING.levels(levels);
    rafViz = requestAnimationFrame(tick);
  }
  function startAnim() {
    if (!rafViz) rafViz = requestAnimationFrame(tick);
  }
  function stopAnim() {
    if (rafViz) cancelAnimationFrame(rafViz);
    rafViz = 0;
    updatePulse();
    updateSeek();
    updateLyrics();
  }


  /* ── lyrics ── */
  function comingLabel() {
    var lab = {
      zh: '歌词即将上线',
      en: 'Lyrics coming soon',
      ja: '歌詞は近日公開',
      ko: '가사 곧 공개'
    };
    return lab[siteLang()] || lab.zh;
  }
  function translationFor(line) {
    if (!line || !line.tr) return '';
    var lang = siteLang();
    var src = (lyricsData && lyricsData.lang) || 'zh';
    if (lang === src) return '';
    if (lang === 'zh' && line.tr.zh) return line.tr.zh;
    if (lang === 'en' && line.tr.en) return line.tr.en;
    if (lang === 'ja' && line.tr.ja) return line.tr.ja;
    if (lang === 'ko' && line.tr.ko) return line.tr.ko;
    return '';
  }
  function loadLyrics(track) {
    lyricsData = null;
    lyricLines = [];
    lyricActive = -1;
    lyricFollow = true;
    lyricPreviewT = null;
    lyricScrubbing = false;
    if (lyricsRoot) lyricsRoot.classList.remove('is-scrubbing', 'is-coming', 'is-placeholder');
    if (lyricsScrub) lyricsScrub.hidden = true;
    if (lyricsNote) lyricsNote.hidden = true;
    if (lyricsList) lyricsList.innerHTML = '';
    if (!track || !track.lyrics) { renderLyricsComing(); return; }
    fetch(track.lyrics).then(function (r) {
      if (!r.ok) throw new Error('lyrics ' + r.status);
      return r.json();
    }).then(function (data) {
      if (current.id !== track.id) return;
      lyricsData = data || {};
      renderLyrics();
      updateLyrics('instant');
    }).catch(function () {
      if (current.id === track.id) renderLyricsComing();
    });
  }
  function renderLyricsComing() {
    if (!lyricsList) return;
    if (lyricsRoot) lyricsRoot.classList.add('is-coming');
    if (lyricsNote) lyricsNote.hidden = true;
    lyricsList.innerHTML = '';
    var p = document.createElement('p');
    p.className = 'listen-lyrics-coming';
    p.setAttribute('data-i18n', 't190');
    p.textContent = comingLabel();
    lyricsList.appendChild(p);
  }
  function renderLyrics() {
    if (!lyricsList) return;
    lyricsList.innerHTML = '';
    lyricLines = [];
    lyricActive = -1;
    var rows = (lyricsData && lyricsData.lines) || [];
    var timed = rows.filter(function (r) { return r && r.text && r.t != null && isFinite(r.t); });
    if (lyricsData && lyricsData.placeholder && lyricsNote) {
      lyricsNote.hidden = false;
      if (lyricsRoot) lyricsRoot.classList.add('is-placeholder');
    } else if (lyricsNote) {
      lyricsNote.hidden = true;
      if (lyricsRoot) lyricsRoot.classList.remove('is-placeholder');
    }
    if (!timed.length) { renderLyricsComing(); return; }
    if (lyricsRoot) lyricsRoot.classList.remove('is-coming');
    var jumpLab = { zh: '跳转到这句', en: 'Jump to this line', ja: 'この行に移動', ko: '이 소절로 이동' };
    var jlab = jumpLab[siteLang()] || jumpLab.zh;
    function addLine(row, kind) {
      var i = lyricLines.length;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'listen-lyric' + (kind ? ' is-credit' + (kind === 'head' ? ' is-credit-head' : '') : '');
      btn.setAttribute('data-t', String(row.t));
      btn.setAttribute('aria-label', (kind ? row.text + ' · ' : jlab + ' · ') + fmt(row.t));
      var text = document.createElement('span');
      text.className = 'tx';
      if (kind === 'row') {
        var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = row.name;
        var pt = document.createElement('span'); pt.className = 'pt'; pt.textContent = row.part;
        text.appendChild(nm); text.appendChild(pt);
      } else {
        text.textContent = row.text;
      }
      btn.appendChild(text);
      var tr = kind ? '' : translationFor(row);
      if (tr) {
        var sub = document.createElement('span');
        sub.className = 'tr';
        sub.textContent = tr;
        btn.appendChild(sub);
      }
      btn.addEventListener('click', function (e) {
        if (lyricSwallowClick) { e.preventDefault(); return; }
        seekToLyric(i, true);
      });
      btn.addEventListener('focus', function () {
        /* keyboard focus: bring the row into view ourselves (the viewport never scrolls) */
        var vis = false;
        try { vis = btn.matches(':focus-visible'); } catch (e) {}
        if (!vis || lyricScrubbing) return;
        centerLyric(i, false);
        scheduleFollowResume();
      });
      lyricsList.appendChild(btn);
      lyricLines.push({
        t: Number(row.t),
        te: row.te != null ? Number(row.te) : null,
        text: row.text,
        tr: row.tr || null,
        credit: !!kind,
        el: btn,
        index: i,
        c: 0
      });
    }
    /* credits: spread evenly over the instrumental intro, done ~1s before the first sung line */
    creditRows(timed[0].t).forEach(function (cr) { addLine(cr, cr.head ? 'head' : 'row'); });
    if (lyricLines.length) {
      var end = document.createElement('div');
      end.className = 'listen-credit-end';
      end.setAttribute('aria-hidden', 'true');
      lyricsList.appendChild(end);
    }
    rows.forEach(function (row) {
      if (row && row.break) {
        var sp = document.createElement('div');
        sp.className = 'listen-lyric-break';
        sp.setAttribute('aria-hidden', 'true');
        lyricsList.appendChild(sp);
        return;
      }
      if (!row || !row.text || row.t == null || !isFinite(row.t)) return;
      addLine(row, '');
    });
    measureLyrics();
  }
  function creditHead(sec) {
    var lang = siteLang();
    var dict = (window.OPENLAND_I18N || {})[lang] || {};
    if (lang !== 'zh' && sec.key && dict[sec.key]) return dict[sec.key];
    return (lang === 'zh' ? sec.zh : sec.en) || sec.en || sec.zh || '';
  }
  function creditRows(firstT) {
    var secs = (lyricsData && lyricsData.credits) || [];
    var out = [];
    secs.forEach(function (sec) {
      out.push({ head: true, text: creditHead(sec) });
      (sec.people || []).forEach(function (p) {
        out.push({ head: false, name: p[0], part: p[1], text: p[0] + ' — ' + p[1] });
      });
    });
    var span = Number(firstT) - 1; /* keep ~1s clear before the first lyric */
    if (!out.length || !(span >= out.length * 0.6)) return [];
    out.forEach(function (r, k) { r.t = Math.round(k * span / out.length * 100) / 100; });
    return out;
  }
  /* geometry is read once after rendering (and on width changes) — never during playback */
  function measureLyrics() {
    if (!lyricsView || !lyricLines.length) return;
    lyricViewH = lyricsView.clientHeight;
    lyricLines.forEach(function (ln) { ln.c = ln.el.offsetTop + ln.el.offsetHeight / 2; });
    if (lyricActive >= 0 && !lyricScrubbing) centerLyric(lyricActive, true);
  }
  function lineAt(t) {
    if (!lyricLines.length) return -1;
    var i = 0;
    for (var k = 0; k < lyricLines.length; k++) {
      if (lyricLines[k].t <= t + 0.04) i = k;
      else break;
    }
    return i;
  }
  var instantRaf = 0;
  function setLyricY(y, instant) {
    lyricY = y;
    if (!lyricsList) return;
    if (instant && lyricsRoot) {
      lyricsRoot.classList.add('is-instant');
      cancelAnimationFrame(instantRaf);
      instantRaf = requestAnimationFrame(function () {
        instantRaf = requestAnimationFrame(function () { lyricsRoot.classList.remove('is-instant'); });
      });
    }
    lyricsList.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)';
  }
  /* early lines don't sit in the middle: the list never drops below the top of the view, so there is no empty gap above the first line */
  var LYRIC_TOP = 28; /* just below the top fade of the mask */
  function clampLyricY(y) { return Math.min(LYRIC_TOP, y); }
  function centerLyric(i, instant) {
    var ln = lyricLines[i];
    if (ln) setLyricY(clampLyricY(lyricViewH / 2 - ln.c), instant);
  }
  function paintLyricClasses(currentIdx, targetIdx) {
    lyricLines.forEach(function (ln, i) {
      ln.el.classList.toggle('is-current', i === currentIdx && targetIdx < 0);
      ln.el.classList.toggle('is-past', i < currentIdx && targetIdx < 0);
      ln.el.classList.toggle('is-target', i === targetIdx);
    });
  }
  function updateLyrics(forceScroll) {
    if (!lyricLines.length) return;
    if (lyricScrubbing && !forceScroll) return;
    var i = lineAt(currentTime());
    var changed = i !== lyricActive;
    if (!changed && !forceScroll) return;
    lyricActive = i;
    paintLyricClasses(i, -1);
    if (lyricFollow && i >= 0) centerLyric(i, forceScroll === 'instant');
  }
  function lineNearestCenter() {
    if (!lyricLines.length) return 0;
    var mid = lyricViewH / 2 - lyricY;
    var best = 0, bestD = Infinity;
    for (var i = 0; i < lyricLines.length; i++) {
      var d = Math.abs(lyricLines[i].c - mid);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function previewLyric(i) {
    if (i < 0 || i >= lyricLines.length) return;
    var ln = lyricLines[i];
    lyricPreviewT = ln.t;
    setCur(ln.t);
    updateSeek();
    paintLyricClasses(lineAt(audio.currentTime || 0), i);
    if (lyricsScrub) lyricsScrub.hidden = false;
    if (lyricsScrubTime) lyricsScrubTime.textContent = fmt(ln.t);
    if (lyricsRoot) lyricsRoot.classList.add('is-scrubbing');
  }
  function seekToLyric(i, followNow) {
    if (i < 0 || i >= lyricLines.length) return;
    var t = lyricLines[i].t;
    seekAudio(t);
    lyricPreviewT = null;
    lyricScrubbing = false;
    if (lyricsScrub) lyricsScrub.hidden = true;
    if (lyricsRoot) lyricsRoot.classList.remove('is-scrubbing');
    lyricFollow = !!followNow;
    lyricActive = i;
    setCur(t);
    updateSeek();
    paintLyricClasses(i, -1);
    centerLyric(i, false);
    if (!followNow) scheduleFollowResume();
  }
  function scheduleFollowResume() {
    lyricFollow = false;
    clearTimeout(lyricFollowTimer);
    lyricFollowTimer = setTimeout(function () {
      lyricFollow = true;
      updateLyrics(true);
    }, 3000);
  }
  function bindLyricsScrub() {
    if (!lyricsView) return;
    /* focus can make the browser scroll an overflow:hidden box — always pin it back to 0 */
    lyricsView.addEventListener('scroll', function () {
      if (lyricsView.scrollTop) lyricsView.scrollTop = 0;
      if (lyricsView.scrollLeft) lyricsView.scrollLeft = 0;
    }, { passive: true });
    lyricsView.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      if (!lyricLines.length) return;
      lyricPointer = { y: e.clientY, y0: lyricY, dragged: false, id: e.pointerId, i: -1 };
    });
    lyricsView.addEventListener('pointermove', function (e) {
      if (!lyricPointer || e.pointerId !== lyricPointer.id) return;
      var dy = e.clientY - lyricPointer.y;
      if (!lyricPointer.dragged) {
        if (Math.abs(dy) < 6) return;
        lyricPointer.dragged = true;
        lyricScrubbing = true;
        lyricFollow = false;
        clearTimeout(lyricFollowTimer);
        try { lyricsView.setPointerCapture(e.pointerId); } catch (err) {}
      }
      var first = lyricLines[0], last = lyricLines[lyricLines.length - 1];
      var y = Math.max(lyricViewH / 2 - last.c, Math.min(clampLyricY(lyricViewH / 2 - first.c), lyricPointer.y0 + dy));
      setLyricY(y, false);
      var i = lineNearestCenter();
      if (i !== lyricPointer.i) { lyricPointer.i = i; previewLyric(i); }
    });
    function endPointer(e) {
      if (!lyricPointer || (e && e.pointerId !== lyricPointer.id)) return;
      var p = lyricPointer;
      lyricPointer = null;
      if (!p.dragged) return;
      lyricSwallowClick = true;
      setTimeout(function () { lyricSwallowClick = false; }, 60);
      if (e && e.type === 'pointercancel') {
        /* gesture taken away: drop the preview and go back to following the song */
        lyricPreviewT = null;
        lyricScrubbing = false;
        if (lyricsScrub) lyricsScrub.hidden = true;
        if (lyricsRoot) lyricsRoot.classList.remove('is-scrubbing');
        lyricFollow = true;
        lyricActive = -1;
        updateLyrics(true);
        setCur(audio.currentTime || 0);
        updateSeek();
        return;
      }
      seekToLyric(lineNearestCenter(), false);
    }
    lyricsView.addEventListener('pointerup', endPointer);
    lyricsView.addEventListener('pointercancel', endPointer);
  }
  bindLyricsScrub();

  /* ── media session ── */
  function setMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: 'Openland',
        album: 'Openland 旷野乐队',
        artwork: [
          { src: current.cover, sizes: '1080x1080', type: 'image/webp' }
        ]
      });
      navigator.mediaSession.playbackState = playing() ? 'playing' : 'paused';
    } catch (e) {}
  }
  function bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    var h = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    try { h('play', function () { play(); }); } catch (e) {}
    try { h('pause', function () { audio.pause(); }); } catch (e) {}
    try { h('seekto', function (d) { if (d.seekTime != null) audio.currentTime = d.seekTime; }); } catch (e) {}
    try { h('seekbackward', function (d) { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); }); } catch (e) {}
    try { h('seekforward', function (d) { audio.currentTime = Math.min(current.duration, audio.currentTime + (d.seekOffset || 10)); }); } catch (e) {}
    try { h('previoustrack', function () { switchBy(-1); }); } catch (e) {}
    try { h('nexttrack', function () { switchBy(1); }); } catch (e) {}
  }

  function switchBy(dir) {
    var i = ORDER.indexOf(current.id);
    var next = ORDER[(i + dir + ORDER.length) % ORDER.length];
    applyTrack(TRACKS[next], false);
    play();
  }

  function playTrack(id) {
    var track = TRACKS[id];
    if (!track) return;
    if (current.id !== id) applyTrack(track, false);
    if (playing() && current.id === id) audio.pause();
    else play();
  }

  /* ── events ── */
  playBtn.addEventListener('click', toggle);
  audio.addEventListener('play', onPlay);
  audio.addEventListener('pause', onPause);
  audio.addEventListener('ended', function () {
    updatePlayUi();
    updateSongButtons();
    stopAnim();
    setCur(current.duration);
    updateSeek();
    setMediaSession();
  });
  audio.addEventListener('timeupdate', function () {
    if (seeking) return;
    if (lyricPreviewT == null) setCur(currentTime());
    if (!rafViz) { updateSeek(); updateLyrics(); }
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
      try {
        navigator.mediaSession.setPositionState({
          duration: current.duration || audio.duration || 0,
          playbackRate: audio.playbackRate || 1,
          position: Math.min(audio.currentTime || 0, current.duration || audio.duration || 0)
        });
      } catch (e) {}
    }
  });
  audio.addEventListener('loadedmetadata', function () {
    if (audio.duration && isFinite(audio.duration)) {
      current.duration = audio.duration;
      durEl.textContent = fmt(current.duration);
    }
    if (pendingT != null) { var pt = pendingT; pendingT = null; try { audio.currentTime = pt; } catch (e) {} }
  });

  seekEl.addEventListener('pointerdown', beginSeek);
  seekEl.addEventListener('pointermove', moveSeek);
  seekEl.addEventListener('pointerup', endSeek);
  seekEl.addEventListener('pointercancel', endSeek);
  seekEl.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 10 : 5;
    var t = audio.currentTime || 0;
    if (e.key === 'ArrowRight' || e.key === 'Right') { e.preventDefault(); audio.currentTime = Math.min(current.duration, t + step); }
    else if (e.key === 'ArrowLeft' || e.key === 'Left') { e.preventDefault(); audio.currentTime = Math.max(0, t - step); }
    else if (e.key === 'Home') { e.preventDefault(); audio.currentTime = 0; }
    else if (e.key === 'End') { e.preventDefault(); audio.currentTime = current.duration; }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
  });

  root.querySelectorAll('.listen-track').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-track');
      if (current.id === id) toggle();
      else { applyTrack(TRACKS[id], false); play(); }
    });
  });
  document.querySelectorAll('.song-play').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var id = b.getAttribute('data-track');
      var goingToPlay = !(playing() && current.id === id);
      playTrack(id);
      if (goingToPlay && root && typeof root.scrollIntoView === 'function') {
        var r = root.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight) {
          root.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        }
      }
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && /input|textarea|select|button|a/i.test(e.target.tagName)) return;
    if (e.target && e.target.getAttribute('role') === 'slider') return;
    if (e.code === 'Space' && (playing() || document.activeElement === playBtn)) {
      /* don't steal space from page scroll unless we're focused in the player */
    }
  });

  new MutationObserver(function () {
    updatePlayUi();
    updateSongButtons();
    if (lyricsData) renderLyrics();
    else if (lyricsList && lyricsList.querySelector('.listen-lyrics-coming')) renderLyricsComing();
    lyricActive = -1;
    updateLyrics('instant');
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  /* re-measure the lyric rows only when the panel width really changed (never on the
     height-only resizes phones fire while the toolbar collapses) */
  var lyricW = 0;
  function remeasureLyrics() {
    var w = lyricsView ? lyricsView.clientWidth : 0;
    if (w === lyricW) return;
    lyricW = w;
    measureLyrics();
  }
  window.addEventListener('resize', remeasureLyrics, { passive: true });
  window.addEventListener('load', function () { lyricW = -1; remeasureLyrics(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { lyricW = -1; remeasureLyrics(); });

  window.OPENLAND_LISTEN = {
    pause: function () { try { audio.pause(); } catch (e) {} },
    play: playTrack,
    playing: playing,
    title: function () { return current.titleFull; },
    el: root
  };

  applyTrack(TRACKS.huiyi, false);
  bindMediaSession();
  updateSeek();
})();

/* Now-playing chip in the nav: shows while the listen player or any page video is playing */
(function () {
  'use strict';
  var chip = document.getElementById('nowPlaying');
  var label = document.getElementById('nowPlayingLabel');
  var audio = document.getElementById('listenAudio');
  if (!chip || !label) return;
  var bars = Array.prototype.slice.call(chip.querySelectorAll('.np-bars i'));
  var videos = Array.prototype.slice.call(document.querySelectorAll('video'));
  var cards = new Map(); /* video -> its timeline card (the video itself may move into the theater) */
  videos.forEach(function (v) { cards.set(v, v.closest('.event') || v.parentNode); });
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var src = null, hideT = 0, live = false;
  var ARIA = { zh: '正在播放：{title}，点击跳转' };

  function lang() {
    var l = (document.documentElement.lang || 'zh').toLowerCase().slice(0, 2);
    return /^(ja|en|ko)$/.test(l) ? l : 'zh';
  }
  function isPlaying(m) { return m && !m.paused && !m.ended; }
  function titleOf(s) {
    if (!s) return '';
    if (s === audio) return (window.OPENLAND_LISTEN && window.OPENLAND_LISTEN.title()) || '';
    var card = cards.get(s), h = card && card.querySelector && card.querySelector('h3');
    return h ? h.textContent.trim() : '';
  }
  function paint() {
    var t = titleOf(src), l = lang();
    var tpl = l === 'zh' ? ARIA.zh : (((window.OPENLAND_I18N || {})[l] || {}).np1 || ARIA.zh);
    label.textContent = t;
    chip.setAttribute('aria-label', tpl.replace('{title}', t));
    chip.title = t;
  }
  function setLive(on) {
    if (on === live) return;
    live = on;
    chip.classList.toggle('is-live', on);
    if (!on) bars.forEach(function (b) { b.style.transform = ''; });
  }
  function refresh() {
    var next = isPlaying(audio) ? audio : null;
    if (!next) for (var i = 0; i < videos.length; i++) if (isPlaying(videos[i])) { next = videos[i]; break; }
    if (next) {
      src = next;
      clearTimeout(hideT);
      paint();
      if (chip.hidden) {
        chip.hidden = false;
        requestAnimationFrame(function () { requestAnimationFrame(function () { if (src) chip.classList.add('is-on'); }); });
      } else chip.classList.add('is-on');
      if (next !== audio) setLive(false);
    } else if (src) {
      src = null;
      setLive(false);
      chip.classList.remove('is-on');
      clearTimeout(hideT);
      hideT = setTimeout(function () { if (!src) chip.hidden = true; }, 380);
    }
  }
  /* media events do not bubble, but they can be captured on the document */
  ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (e.target === audio || (e.target && e.target.tagName === 'VIDEO')) refresh();
    }, true);
  });
  new MutationObserver(function () { if (src) paint(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  chip.addEventListener('click', function () {
    if (!src) return;
    var smooth = reduce ? 'auto' : 'smooth';
    if (src === audio) {
      var el = (window.OPENLAND_LISTEN && window.OPENLAND_LISTEN.el) || document.getElementById('listen');
      if (el) el.scrollIntoView({ behavior: smooth, block: 'center' });
      return;
    }
    var theater = document.getElementById('theater');
    if (theater && theater.classList.contains('is-open') && theater.contains(src)) {
      var c = theater.querySelector('.theater-close');
      (c || src).focus();
      return;
    }
    var card = cards.get(src);
    /* block: page scroll to the card; inline: the timeline carousel brings the card to its centre */
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: smooth, block: 'center', inline: 'center' });
  });

  window.OPENLAND_NOWPLAYING = {
    /* called once per frame by the listen player with 5 real band levels (or null) */
    levels: function (lv) {
      if (!lv || reduce || src !== audio) { setLive(false); return; }
      setLive(true);
      for (var i = 0; i < bars.length; i++) {
        bars[i].style.transform = 'scaleY(' + (0.18 + 0.82 * (lv[i] || 0)).toFixed(3) + ')';
      }
    }
  };
  refresh();
})();
