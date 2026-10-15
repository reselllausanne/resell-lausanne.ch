(() => {
  if (window.__rsUpsellCarouselTracking) return;

  const MIN_SCROLL_DELTA = 48;
  const SCROLL_DEBOUNCE_MS = 400;

  const publish = (name, data) => {
    try {
      const published = window.Shopify?.analytics?.publish?.(name, {
        ...(data || {}),
        url: window.location.pathname + window.location.search,
      });
      if (published && typeof published.catch === 'function') published.catch(() => {});
    } catch (_) {
      /* tracking optional */
    }
  };

  const cardProductId = (card) =>
    card?.dataset?.rsUpsellProductId || card?.dataset?.productId || null;

  const cardProductHandle = (card) =>
    card?.dataset?.rsUpsellProductHandle || card?.dataset?.productHandle || null;

  const visibleCards = (scroller, cardSelector) => {
    const bounds = scroller.getBoundingClientRect();
    const cards = scroller.querySelectorAll(cardSelector);
    const out = [];
    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const overlap = Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left);
      if (overlap >= Math.min(rect.width, bounds.width) * 0.35) {
        out.push({
          index,
          productId: cardProductId(card),
          productHandle: cardProductHandle(card),
        });
      }
    });
    return out;
  };

  const emitInteraction = (sourceComponent, payload) => {
    publish('rs_upsell_carousel_interacted', {
      sourceComponent,
      ...payload,
    });
  };

  const bind = (scroller, options) => {
    if (!scroller || scroller.dataset.rsUpsellCarouselBound === '1') return;
    scroller.dataset.rsUpsellCarouselBound = '1';

    const cardSelector = options.cardSelector || '.rs-size-modal__cart-upsell';
    const sourceComponent = options.sourceComponent || 'upsell_carousel';
    let lastLeft = scroller.scrollLeft;
    let accDelta = 0;
    let scrollTimer = null;

    const flushScroll = () => {
      scrollTimer = null;
      if (Math.abs(accDelta) < MIN_SCROLL_DELTA) {
        accDelta = 0;
        return;
      }
      const visible = visibleCards(scroller, cardSelector);
      const cards = scroller.querySelectorAll(cardSelector);
      emitInteraction(sourceComponent, {
        interactionType: 'scroll',
        scrollDirection: accDelta > 0 ? 'right' : 'left',
        scrollDelta: Math.round(Math.abs(accDelta)),
        visibleIndex: visible[0]?.index ?? null,
        productsTotal: cards.length,
        visibleProductIds: visible.map((v) => v.productId).filter(Boolean).join(','),
        visibleProductHandles: visible.map((v) => v.productHandle).filter(Boolean).join(','),
      });
      accDelta = 0;
    };

    scroller.addEventListener(
      'scroll',
      () => {
        const delta = scroller.scrollLeft - lastLeft;
        lastLeft = scroller.scrollLeft;
        if (!delta) return;
        accDelta += delta;
        if (scrollTimer) window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(flushScroll, SCROLL_DEBOUNCE_MS);
      },
      { passive: true },
    );

    scroller.addEventListener('click', (event) => {
      const link = event.target.closest('a[href*="/products/"]');
      if (!link || !scroller.contains(link)) return;
      const card = link.closest(cardSelector);
      if (!card) return;
      emitInteraction(sourceComponent, {
        interactionType: 'product_link_click',
        productId: cardProductId(card),
        productHandle: cardProductHandle(card),
      });
    });
  };

  const autoBindConfigs = [
    {
      selector: '[data-rs-modal-cart-upsells]',
      sourceComponent: 'product_size_modal_cart_view',
      cardSelector: '.rs-size-modal__cart-upsell',
    },
    {
      selector: '[data-rs-complete-scroller]',
      sourceComponent: 'cart_complete_rail',
      cardSelector: '[data-rs-complete-card]',
    },
  ];

  const autoBind = () => {
    for (const cfg of autoBindConfigs) {
      document.querySelectorAll(cfg.selector).forEach((el) => bind(el, cfg));
    }
  };

  window.__rsUpsellCarouselTracking = { bind, emit: emitInteraction, autoBind };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBind);
  } else {
    autoBind();
  }
})();
