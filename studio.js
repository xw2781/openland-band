(function () {
  var box = document.getElementById('lightbox');
  var tiles = Array.prototype.slice.call(document.querySelectorAll('[data-studio-photo]'));
  if (!box || !tiles.length) return;
  var img = box.querySelector('.lightbox-img');
  var count = box.querySelector('.lightbox-count');
  var text = box.querySelector('.lightbox-text');
  var prevBtn = box.querySelector('.lightbox-prev');
  var nextBtn = box.querySelector('.lightbox-next');
  var closeBtn = box.querySelector('.lightbox-close');
  var backdrop = box.querySelector('.lightbox-backdrop');
  var index = -1, lastFocus = null, touchX = null, touchY = null, isOpenOrOpening = false;

  function isOpen() { return box.classList.contains('is-open'); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function warm(i) { var t = tiles[(i + tiles.length) % tiles.length]; if (t) { new Image().src = t.getAttribute('href'); } }

  function show(i) {
    index = (i + tiles.length) % tiles.length;
    var thumb = tiles[index].querySelector('img');
    var alt = thumb ? thumb.getAttribute('alt') || '' : '';
    var src = tiles[index].getAttribute('href');
    var full = new Image();
    box.classList.add('is-loading');
    full.onload = full.onerror = function () {
      if (tiles[index].getAttribute('href') !== src || !isOpenOrOpening) return;
      img.setAttribute('src', src);
      box.classList.remove('is-loading');
    };
    if (thumb) { img.setAttribute('width', thumb.getAttribute('width')); img.setAttribute('height', thumb.getAttribute('height')); }
    img.setAttribute('src', (thumb && thumb.currentSrc) || src);
    img.setAttribute('alt', alt);
    full.src = src;
    count.textContent = pad(index + 1) + ' / ' + pad(tiles.length);
    text.textContent = alt;
    warm(index + 1); warm(index - 1);
  }

  function open(i, trigger) {
    if (isOpen()) return;
    lastFocus = trigger || document.activeElement;
    isOpenOrOpening = true;
    show(i);
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-active');
    closeBtn.focus();
  }

  function close() {
    if (!isOpen()) return;
    isOpenOrOpening = false;
    box.classList.remove('is-open', 'is-loading');
    box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-active');
    img.removeAttribute('src');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  tiles.forEach(function (tile, i) {
    tile.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      open(i, tile);
    });
  });
  prevBtn.addEventListener('click', function () { show(index - 1); });
  nextBtn.addEventListener('click', function () { show(index + 1); });
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  box.addEventListener('click', function (e) { if (e.target === box) close(); });

  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); show(index - 1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); show(index + 1); return; }
    if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); show(0); return; }
    if (e.key === 'End') { e.preventDefault(); e.stopPropagation(); show(tiles.length - 1); return; }
    if (e.key === 'Tab') {
      var order = [prevBtn, nextBtn, closeBtn];
      var at = order.indexOf(document.activeElement);
      var to = at < 0 ? (e.shiftKey ? order.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + order.length) % order.length;
      e.preventDefault();
      order[to].focus();
    }
  }, true);
  document.addEventListener('focusin', function (e) {
    if (isOpen() && !box.contains(e.target)) closeBtn.focus();
  });

  box.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { touchX = null; return; }
    touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
  }, { passive: true });
  box.addEventListener('touchend', function (e) {
    if (touchX == null) return;
    var t = e.changedTouches[0], dx = t.clientX - touchX, dy = t.clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1));
  }, { passive: true });

  new MutationObserver(function () {
    if (!isOpen()) return;
    var thumb = tiles[index].querySelector('img');
    var alt = thumb ? thumb.getAttribute('alt') || '' : '';
    img.setAttribute('alt', alt); text.textContent = alt;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();
