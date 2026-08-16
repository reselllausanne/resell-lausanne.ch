/**
 * Grid perf: prioritize first above-fold product cards on search and collection.
 */
(function () {
  const SEARCH_GRID = '.main-search__products-grid';
  const COLLECTION_GRID = '.main-collection__products-grid';
  const SEARCH_FIRST_EAGER = 2;
  const COLLECTION_FIRST_EAGER = 4;
  const PRELOADED = new Set();

  function preload(url) {
    if (!url || PRELOADED.has(url)) return;
    PRELOADED.add(url);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }

  function firstCardImage(card) {
    return card.querySelector(
      '.product-card-media-gallery .splide__slide:first-child img[src], .product-card-media-gallery > a.product-card-media-gallery__link img[src]'
    );
  }

  function boostGridCards(selector, firstEager) {
    const grid = document.querySelector(selector);
    if (!grid) return;

    grid.querySelectorAll('product-card').forEach((card, index) => {
      const img = firstCardImage(card);
      if (!img || !img.src || img.src.startsWith('data:')) return;

      if (index < firstEager) {
        img.loading = 'eager';
        if ('fetchPriority' in img) {
          img.fetchPriority = index === 0 ? 'high' : 'low';
        }
      }
    });
  }

  function preloadCardSlides(card) {
    card.querySelectorAll('img[data-splide-lazy]').forEach((img) => {
      preload(img.getAttribute('data-splide-lazy'));
    });
  }

  function onGridReady() {
    requestAnimationFrame(() => {
      boostGridCards(SEARCH_GRID, SEARCH_FIRST_EAGER);
      boostGridCards(COLLECTION_GRID, COLLECTION_FIRST_EAGER);
    });
  }

  function eventTargetElement(event) {
    const target = event && event.target;
    if (target instanceof Element) return target;
    if (target && target.parentElement instanceof Element) return target.parentElement;
    return null;
  }

  document.addEventListener(
    'pointerenter',
    (event) => {
      const clickTarget = eventTargetElement(event);
      const card = clickTarget ? clickTarget.closest(`${SEARCH_GRID} product-card`) : null;
      if (card) preloadCardSlides(card);
    },
    true
  );

  document.addEventListener('rl:search-results-updated', onGridReady);
  document.addEventListener('filters:updated', onGridReady);
  document.addEventListener('rl:collection-results-updated', onGridReady);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onGridReady);
  } else {
    onGridReady();
  }
})();
