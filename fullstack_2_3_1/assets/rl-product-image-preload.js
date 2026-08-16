/**
 * Warms PDP hero image cache from search / predictive product cards.
 * - pointerenter / focus / touch / pointerdown: on user intent only
 * - idle: max 2 visible cards after search results swap (low priority)
 */
(function () {
  const PRELOADED = new Set();
  const PRELOAD_ORDER = [];
  const MAX_CACHE = 32;
  const MAX_IDLE = 2;
  const SELECTOR = '[data-pdp-preload]';

  function preload(url) {
    if (!url || PRELOADED.has(url)) return;
    PRELOADED.add(url);
    PRELOAD_ORDER.push(url);
    if (PRELOAD_ORDER.length > MAX_CACHE) {
      PRELOADED.delete(PRELOAD_ORDER.shift());
    }
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }

  function preloadFromTarget(target) {
    if (!(target instanceof Element)) return;
    const el = target.closest(SELECTOR);
    if (!el) return;
    const url = el.getAttribute('data-pdp-preload');
    if (url) preload(url);
  }

  document.addEventListener('pointerenter', (e) => preloadFromTarget(e.target), true);
  document.addEventListener('focusin', (e) => preloadFromTarget(e.target), true);
  document.addEventListener('touchstart', (e) => preloadFromTarget(e.target), { capture: true, passive: true });
  document.addEventListener('pointerdown', (e) => preloadFromTarget(e.target), true);

  function idleWarm(root) {
    if (!root) return;
    const run = () => {
      const items = root.querySelectorAll(SELECTOR);
      let warmed = 0;
      for (let i = 0; i < items.length; i += 1) {
        if (warmed >= MAX_IDLE) break;
        const el = items[i];
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
        const url = el.getAttribute('data-pdp-preload');
        if (url) {
          preload(url);
          warmed += 1;
        }
      }
    };
    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 2500 });
    } else {
      setTimeout(run, 500);
    }
  }

  function warmSearchSurfaces() {
    if (document.querySelector('.main-search--has-results')) {
      idleWarm(document.querySelector('[data-ref="search-results-root"]'));
      return;
    }
    idleWarm(document.querySelector('[data-ref="search-results-root"]'));
    idleWarm(document.querySelector('[data-ref="predictive-search"]'));
  }

  document.addEventListener('rl:search-results-updated', warmSearchSurfaces);
  document.addEventListener('rl:predictive-search-updated', warmSearchSurfaces);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', warmSearchSurfaces);
  } else {
    warmSearchSurfaces();
  }
})();
