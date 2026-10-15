(() => {
  if (window.__rsUpsellCarouselTrackingInit) return;
  window.__rsUpsellCarouselTrackingInit = true;

  const MIN_SCROLL_DELTA = 24;
  const SCROLL_DEBOUNCE_MS = 350;

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

    const scheduleFlush = () => {
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(flushScroll, SCROLL_DEBOUNCE_MS);
    };

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
      lastLeft = scroller.scrollLeft;
    };

    const recordDelta = (delta) => {
      if (!delta) return;
      accDelta += delta;
      scheduleFlush();
    };

    scroller.addEventListener(
      'scroll',
      () => {
        const delta = scroller.scrollLeft - lastLeft;
        lastLeft = scroller.scrollLeft;
        recordDelta(delta);
      },
      { passive: true },
    );

    scroller.addEventListener(
      'wheel',
      (event) => {
        const dx = event.deltaX;
        if (!dx || Math.abs(dx) < Math.abs(event.deltaY)) return;
        recordDelta(dx);
      },
      { passive: true },
    );

    let touchStartX = null;
    scroller.addEventListener(
      'touchstart',
      (event) => {
        const t = event.changedTouches?.[0];
        touchStartX = t ? t.clientX : null;
      },
      { passive: true },
    );
    scroller.addEventListener(
      'touchend',
      (event) => {
        const t = event.changedTouches?.[0];
        if (touchStartX == null || !t) return;
        const dx = touchStartX - t.clientX;
        touchStartX = null;
        recordDelta(dx);
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

    scroller.addEventListener('change', (event) => {
      const select = event.target.closest('select.rs-size-modal__cart-upsell-select');
      if (!select || !scroller.contains(select)) return;
      const card = select.closest(cardSelector);
      if (!card) return;
      emitInteraction(sourceComponent, {
        interactionType: 'upsell_size_select',
        productId: cardProductId(card),
        productHandle: cardProductHandle(card),
        selectedSize: select.value || null,
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
