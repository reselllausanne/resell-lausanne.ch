/**
 * Loads img.rl-deferred-img from data-lazy-* when near viewport.
 */
(function () {
  function activate(img) {
    if (img.dataset.lazySrc) {
      img.src = img.dataset.lazySrc;
      delete img.dataset.lazySrc;
    }
    if (img.dataset.lazySrcset) {
      img.srcset = img.dataset.lazySrcset;
      delete img.dataset.lazySrcset;
    }
    if (img.dataset.lazySizes) {
      img.sizes = img.dataset.lazySizes;
      delete img.dataset.lazySizes;
    }
    img.classList.add('rl-deferred-img--loaded');
  }

  function activateVisible() {
    document.querySelectorAll('img.rl-deferred-img[data-lazy-src]').forEach(function (img) {
      var rect = img.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < vh + 900 && rect.bottom > -200) {
        activate(img);
      }
    });
  }

  function initDeferred() {
    var imgs = document.querySelectorAll('img.rl-deferred-img[data-lazy-src]');
    if (!imgs.length) return;

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries, obs) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            activate(entry.target);
            obs.unobserve(entry.target);
          });
        },
        { rootMargin: '900px 0px' }
      );
      imgs.forEach(function (img) {
        io.observe(img);
      });
    } else {
      imgs.forEach(activate);
    }

    window.addEventListener('scroll', activateVisible, { passive: true });
    window.addEventListener('resize', activateVisible, { passive: true });
    activateVisible();
  }

  function patchNativeLazy() {
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var candidates = document.querySelectorAll('img:not(.rl-deferred-img)');
    if (!candidates.length) return;

    var pending = [];
    candidates.forEach(function (img) {
      if (img.loading === 'lazy' || img.loading === 'eager') return;
      if (img.getAttribute('fetchpriority') === 'high') return;
      if (img.closest('[data-lcp-image]')) return;
      pending.push(img);
    });
    if (!pending.length) return;

    var rects = pending.map(function (img) {
      return img.getBoundingClientRect();
    });

    requestAnimationFrame(function () {
      pending.forEach(function (img, i) {
        if (rects[i].top > vh) {
          img.loading = 'lazy';
          if (!img.getAttribute('decoding')) img.decoding = 'async';
        }
      });
    });
  }

  function schedulePatchNativeLazy() {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(patchNativeLazy, { timeout: 1500 });
    } else {
      setTimeout(patchNativeLazy, 600);
    }
  }

  function run() {
    initDeferred();
    schedulePatchNativeLazy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
