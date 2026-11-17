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
  var lyricIgnoreScroll = false;
  var lyricFollowTimer = 0;
  var lyricIgnoreTimer = 0;
  var lyricPointer = null;
  var ctx = null, analyser = null, sourceNode = null, freq = null;
  var rafViz = 0;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (window.matchMedia) {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
      reduce = e.matches;
      root.classList.toggle('is-reduced', reduce);
      if (reduce) root.style.setProperty('--listen-pulse', '0');
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
    current = track;
    setSources(track);
    titleEl.textContent = track.titleFull;
    artEl.src = track.cover;
    artEl.style.objectPosition = track.coverPos || '50% 50%';
    artEl.alt = track.titleFull;
    durEl.textContent = fmt(track.duration);
    curEl.textContent = fmt(t);
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
    if (!on && reduce) root.style.setProperty('--listen-pulse', '0');
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
    return audio.currentTime || 0;
  }
  function updateSeek() {
    if (!seekEl) return;
    var dur = current.duration || 1;
    var t = currentTime();
    var prog = Math.max(0, Math.min(1, t / dur));
    seekEl.style.setProperty('--listen-prog', prog.toFixed(4));
    seekEl.setAttribute('aria-valuenow', String(Math.floor(t)));
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
    curEl.textContent = fmt(seekEl._seekT);
    updateSeek();
    if (seekEl.setPointerCapture && e.pointerId != null) {
      try { seekEl.setPointerCapture(e.pointerId); } catch (err) {}
    }
    e.preventDefault();
  }
  function moveSeek(e) {
    if (!seeking) return;
    seekEl._seekT = timeFromEvent(e);
    curEl.textContent = fmt(seekEl._seekT);
    updateSeek();
  }
  function endSeek(e) {
    if (!seeking) return;
    seeking = false;
    seekEl.classList.remove('is-seeking');
    var t = seekEl._seekT != null ? seekEl._seekT : timeFromEvent(e);
    try { audio.currentTime = t; } catch (err) {}
    seekEl._seekT = null;
    curEl.textContent = fmt(t);
    updateSeek();
    lyricFollow = true;
    updateLyrics(true);
  }

  /* ── soft pulse from average energy (no spectrum bars) ── */
  function updatePulse() {
    if (reduce || !analyser || !playing() || !freq) {
      root.style.setProperty('--listen-pulse', '0');
      return;
    }
    analyser.getByteFrequencyData(freq);
    var count = Math.max(1, Math.floor(freq.length * 0.6));
    var sum = 0;
    for (var i = 0; i < count; i++) sum += freq[i];
    var pulse = Math.min(1, (sum / count / 255) * 1.45);
    root.style.setProperty('--listen-pulse', pulse.toFixed(3));
  }

  function tick() {
    rafViz = 0;
    if (!playing()) { updatePulse(); updateSeek(); updateLyrics(); return; }
    if (!seeking && lyricPreviewT == null) curEl.textContent = fmt(audio.currentTime || 0);
    else if (lyricPreviewT != null) curEl.textContent = fmt(lyricPreviewT);
    updateSeek();
    updatePulse();
    updateLyrics();
    rafViz = requestAnimationFrame(tick);
  }
  function startAnim() {
    if (!rafViz) rafViz = requestAnimationFrame(tick);
  }
  function stopAnim() {
    if (rafViz) cancelAnimationFrame(rafViz);
    rafViz = 0;
    root.style.setProperty('--listen-pulse', '0');
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
      updateLyrics(true);
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
    rows.forEach(function (row) {
      if (row && row.break) {
        var sp = document.createElement('div');
        sp.className = 'listen-lyric-break';
        sp.setAttribute('aria-hidden', 'true');
        lyricsList.appendChild(sp);
        return;
      }
      if (!row || !row.text || row.t == null || !isFinite(row.t)) return;
      var i = lyricLines.length;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'listen-lyric';
      btn.setAttribute('data-t', String(row.t));
      btn.setAttribute('aria-label', jlab + ' · ' + fmt(row.t));
      var text = document.createElement('span');
      text.className = 'tx';
      text.textContent = row.text;
      btn.appendChild(text);
      var tr = translationFor(row);
      if (tr) {
        var sub = document.createElement('span');
        sub.className = 'tr';
        sub.textContent = tr;
        btn.appendChild(sub);
      }
      btn.addEventListener('click', function (e) {
        if (lyricPointer && lyricPointer.dragged) { e.preventDefault(); return; }
        seekToLyric(i, true);
      });
      lyricsList.appendChild(btn);
      lyricLines.push({
        t: Number(row.t),
        te: row.te != null ? Number(row.te) : null,
        text: row.text,
        tr: row.tr || null,
        el: btn,
        index: i
      });
    });
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
  function scrollLyricToCenter(el, instant) {
    if (!el || !lyricsView) return;
    var top = el.offsetTop - lyricsView.clientHeight / 2 + el.offsetHeight / 2;
    lyricIgnoreScroll = true;
    lyricsView.scrollTo({ top: Math.max(0, top), behavior: (instant || reduce) ? 'auto' : 'smooth' });
    clearTimeout(lyricIgnoreTimer);
    lyricIgnoreTimer = setTimeout(function () { lyricIgnoreScroll = false; }, (instant || reduce) ? 80 : 480);
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
    var t = currentTime();
    var i = lineAt(t);
    var changed = i !== lyricActive;
    lyricActive = i;
    paintLyricClasses(i, -1);
    if ((changed || forceScroll) && lyricFollow && i >= 0) {
      scrollLyricToCenter(lyricLines[i].el, !!forceScroll || reduce);
    }
  }
  function lineNearestCenter() {
    if (!lyricsView || !lyricLines.length) return 0;
    var mid = lyricsView.scrollTop + lyricsView.clientHeight / 2;
    var best = 0, bestD = Infinity;
    lyricLines.forEach(function (ln, i) {
      var c = ln.el.offsetTop + ln.el.offsetHeight / 2;
      var d = Math.abs(c - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }
  function previewLyric(i) {
    if (i < 0 || i >= lyricLines.length) return;
    var ln = lyricLines[i];
    lyricPreviewT = ln.t;
    if (curEl) curEl.textContent = fmt(ln.t);
    updateSeek();
    paintLyricClasses(lineAt(audio.currentTime || 0), i);
    if (lyricsScrub) lyricsScrub.hidden = false;
    if (lyricsScrubTime) lyricsScrubTime.textContent = fmt(ln.t);
    if (lyricsRoot) lyricsRoot.classList.add('is-scrubbing');
  }
  function seekToLyric(i, followNow) {
    if (i < 0 || i >= lyricLines.length) return;
    var t = lyricLines[i].t;
    try { audio.currentTime = t; } catch (e) {}
    lyricPreviewT = null;
    lyricScrubbing = false;
    if (lyricsScrub) lyricsScrub.hidden = true;
    if (lyricsRoot) lyricsRoot.classList.remove('is-scrubbing');
    lyricFollow = !!followNow;
    lyricActive = i;
    if (curEl) curEl.textContent = fmt(t);
    updateSeek();
    paintLyricClasses(i, -1);
    scrollLyricToCenter(lyricLines[i].el, true);
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
  function onLyricsUserScroll() {
    if (lyricIgnoreScroll || !lyricLines.length) return;
    lyricScrubbing = true;
    lyricFollow = false;
    clearTimeout(lyricFollowTimer);
    var i = lineNearestCenter();
    previewLyric(i);
    clearTimeout(lyricFollowTimer);
    lyricFollowTimer = setTimeout(function () {
      if (!lyricScrubbing) return;
      /* wheel/trackpad "release": seek, then wait 3s to follow */
      seekToLyric(i, false);
    }, 180);
  }
  function bindLyricsScrub() {
    if (!lyricsView) return;
    lyricsView.addEventListener('scroll', onLyricsUserScroll, { passive: true });
    lyricsView.addEventListener('wheel', function () {
      /* scroll event handles preview; keep preventDefault off so it remains scrollable */
    }, { passive: true });
    lyricsView.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      lyricPointer = { y: e.clientY, dragged: false, id: e.pointerId };
    });
    lyricsView.addEventListener('pointermove', function (e) {
      if (!lyricPointer) return;
      if (Math.abs(e.clientY - lyricPointer.y) > 6) lyricPointer.dragged = true;
      if (lyricPointer.dragged) {
        lyricScrubbing = true;
        lyricFollow = false;
        clearTimeout(lyricFollowTimer);
        previewLyric(lineNearestCenter());
      }
    });
    function endPointer() {
      if (!lyricPointer) return;
      var dragged = lyricPointer.dragged;
      lyricPointer = null;
      if (dragged) {
        var i = lineNearestCenter();
        seekToLyric(i, false);
      }
    }
    lyricsView.addEventListener('pointerup', endPointer);
    lyricsView.addEventListener('pointercancel', function () {
      lyricPointer = null;
    });
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
    curEl.textContent = fmt(current.duration);
    updateSeek();
    setMediaSession();
  });
  audio.addEventListener('timeupdate', function () {
    if (seeking) return;
    curEl.textContent = fmt(audio.currentTime || 0);
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
    updateLyrics(true);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  window.addEventListener('resize', function () { updateSeek(); });

  window.OPENLAND_LISTEN = {
    pause: function () { try { audio.pause(); } catch (e) {} },
    play: playTrack,
    playing: playing
  };

  applyTrack(TRACKS.huiyi, false);
  bindMediaSession();
  updateSeek();
})();
