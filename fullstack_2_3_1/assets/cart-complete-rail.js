(() => {
  // After rail ATC reload: restore scroll so list grows down without jump-to-top.
  try {
    const keepY = sessionStorage.getItem('rs-cart-keep-scroll');
    if (keepY != null) {
      sessionStorage.removeItem('rs-cart-keep-scroll');
      const y = Number.parseInt(keepY, 10);
      if (Number.isFinite(y)) {
        const restore = () => window.scrollTo(0, y);
        restore();
        requestAnimationFrame(restore);
        window.setTimeout(restore, 0);
      }
    }
  } catch (_) {
    /* ignore */
  }

  const root = document.querySelector('[data-rs-cart-complete]');
  if (!root) return;

  const scroller = root.querySelector('[data-rs-complete-scroller]');
  const nav = root.querySelector('[data-rs-complete-nav]');
  const prevBtn = root.querySelector('[data-rs-complete-prev]');
  const nextBtn = root.querySelector('[data-rs-complete-next]');
  const cartAddUrl = () => window.Theme?.routes?.cart_add_url || '/cart/add.js';

  const sizeModal = document.querySelector('[data-rs-cart-complete-size-modal]');
  const sizeTitle = sizeModal?.querySelector('[data-rs-cart-complete-size-title]');
  const sizeGrid = sizeModal?.querySelector('[data-rs-cart-complete-size-grid]');
  const sizeAtc = sizeModal?.querySelector('[data-rs-cart-complete-size-atc]');
  const OPEN_LOCK_CLASS = 'rs-size-modal-open';

  let activeCard = null;
  let selectedVariantId = '';
  let scrollLockY = 0;

  const toast = (type, message) => {
    document.dispatchEvent(new CustomEvent('toast:open', { detail: { type, message } }));
  };

  const formatSizeLabel = (label) => {
    const text = String(label || '').trim();
    if (!text) return '';
    if (/\bEU\b/i.test(text)) return text;
    // Numeric shoe sizes → "36 EU"; ranges / apparel stay as-is
    if (/^\d+([.,]\d+)?$/.test(text)) return `${text} EU`;
    return text;
  };

  const updateNav = () => {
    if (!scroller || !nav || !prevBtn || !nextBtn) return;
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth - 2);
    const showNav = maxScroll > 8;
    nav.hidden = !showNav;
    if (!showNav) return;
    prevBtn.disabled = scroller.scrollLeft <= 2;
    nextBtn.disabled = scroller.scrollLeft >= maxScroll;
  };

  const scrollByCard = (dir) => {
    if (!scroller) return;
    const card = scroller.querySelector('.rs-cart-complete__item');
    const step = card ? card.getBoundingClientRect().width + 12 : scroller.clientWidth * 0.7;
    scroller.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  prevBtn?.addEventListener('click', () => scrollByCard(-1));
  nextBtn?.addEventListener('click', () => scrollByCard(1));
  scroller?.addEventListener('scroll', updateNav, { passive: true });
  window.addEventListener('resize', updateNav, { passive: true });
  updateNav();

  const setBusy = (card, busy) => {
    if (!card) return;
    card.classList.toggle('is-loading', busy);
    card.querySelectorAll('button').forEach((btn) => {
      btn.disabled = busy;
    });
  };

  const lockScroll = () => {
    scrollLockY = window.scrollY || window.pageYOffset || 0;
    // Desktop: overflow lock only — avoid body position:fixed (jumps page to top).
    document.documentElement.style.setProperty('overflow', 'hidden');
    document.body.style.setProperty('overflow', 'hidden');
    document.documentElement.classList.add(OPEN_LOCK_CLASS);
    document.body.classList.add(OPEN_LOCK_CLASS);
    document.body.dataset.rsCartScrollY = String(scrollLockY);
  };

  const unlockScroll = () => {
    const saved = Number.parseInt(document.body.dataset.rsCartScrollY || String(scrollLockY), 10);
    const y = Number.isFinite(saved) ? saved : scrollLockY;
    document.documentElement.classList.remove(OPEN_LOCK_CLASS);
    document.body.classList.remove(OPEN_LOCK_CLASS);
    document.documentElement.style.removeProperty('overflow');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('top');
    delete document.body.dataset.rsCartScrollY;
    const restore = () => window.scrollTo(0, y);
    restore();
    requestAnimationFrame(restore);
    window.setTimeout(restore, 0);
  };

  const closeSizeModal = () => {
    if (!sizeModal) return;
    sizeModal.setAttribute('aria-hidden', 'true');
    unlockScroll();
    activeCard = null;
    selectedVariantId = '';
    if (sizeGrid) {
      sizeGrid.innerHTML = '';
      sizeGrid.classList.remove('has-selection');
    }
    if (sizeAtc) {
      sizeAtc.disabled = true;
      sizeAtc.classList.remove('is-loading');
    }
  };

  const addVariant = async (card, variantId, { fromModal = false } = {}) => {
    if (!variantId) return;
    setBusy(card, true);
    if (fromModal && sizeAtc) {
      sizeAtc.disabled = true;
      sizeAtc.classList.add('is-loading');
    }
    if (fromModal && sizeGrid) {
      sizeGrid.querySelectorAll('button').forEach((btn) => {
        btn.disabled = true;
      });
    }
    try {
      const item = { id: Number(variantId), quantity: 1 };
      const colorwayPct = card?.dataset?.essentialsColorway;
      if (colorwayPct) {
        item.properties = { _essentials_colorway_upsell: String(colorwayPct) };
      }
      const res = await fetch(cartAddUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [item] }),
      });
      const data = await res.json();
      if (data.status && data.message) {
        throw new Error(data.description || data.message);
      }
      toast('success', data?.message || 'Produit ajouté au panier');
      // Keep scroll; reversed cart lines put new item at bottom (grows down).
      try {
        sessionStorage.setItem('rs-cart-keep-scroll', String(window.scrollY || 0));
      } catch (_) {
        /* ignore */
      }
      window.location.reload();
    } catch (err) {
      toast('error', err?.message || 'Une erreur est survenue.');
      setBusy(card, false);
      if (fromModal && sizeAtc) {
        sizeAtc.disabled = !selectedVariantId;
        sizeAtc.classList.remove('is-loading');
      }
      if (fromModal && sizeGrid) {
        sizeGrid.querySelectorAll('button').forEach((btn) => {
          btn.disabled = false;
        });
      }
    }
  };

  const parseVariants = (card) => {
    const script = card.querySelector('[data-rs-complete-variants]');
    if (!script?.textContent) return [];
    try {
      const parsed = JSON.parse(script.textContent);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const selectCard = (btn, variantId) => {
    selectedVariantId = String(variantId);
    sizeGrid?.classList.add('has-selection');
    sizeGrid?.querySelectorAll('.rs-size-modal__size-card').forEach((el) => {
      const on = el === btn;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (sizeAtc) sizeAtc.disabled = false;
  };

  const openSizeModal = (card) => {
    if (!sizeModal || !sizeGrid || !sizeTitle) return;
    const variants = parseVariants(card);
    if (!variants.length) return;

    activeCard = card;
    selectedVariantId = '';
    sizeTitle.textContent = card.dataset.productTitle || '';
    sizeGrid.innerHTML = '';
    sizeGrid.classList.remove('has-selection');
    if (sizeAtc) {
      sizeAtc.disabled = true;
      sizeAtc.classList.remove('is-loading');
    }

    variants.forEach((variant) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rs-size-modal__size-card';
      btn.setAttribute('data-rs-size-card', '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', 'false');
      btn.dataset.variantId = String(variant.id);

      const labelText = formatSizeLabel(variant.label);
      const lab = document.createElement('span');
      lab.className = 'rs-size-modal__size-label';
      lab.textContent = labelText;
      btn.appendChild(lab);

      const slot = document.createElement('div');
      slot.className = 'rs-size-modal__size-price-slot';
      if (variant.compare) {
        const was = document.createElement('span');
        was.className = 'rs-size-modal__size-price rs-size-modal__size-price--was';
        was.textContent = variant.compare;
        slot.appendChild(was);
      }
      const now = document.createElement('span');
      now.className = variant.compare
        ? 'rs-size-modal__size-price rs-size-modal__size-price--now'
        : 'rs-size-modal__size-price';
      now.textContent = variant.price || '';
      slot.appendChild(now);
      btn.appendChild(slot);

      btn.setAttribute(
        'aria-label',
        `${labelText}${variant.price ? `, ${variant.price}` : ''}`,
      );

      btn.addEventListener('click', () => {
        selectCard(btn, variant.id);
      });
      sizeGrid.appendChild(btn);
    });

    if (sizeModal.parentElement !== document.body) {
      document.body.appendChild(sizeModal);
    }
    sizeModal.setAttribute('aria-hidden', 'false');
    lockScroll();
    sizeGrid.querySelector('button')?.focus({ preventScroll: true });
  };

  sizeModal?.querySelector('[data-rs-cart-complete-size-close]')?.addEventListener('click', closeSizeModal);
  sizeModal?.querySelector('[data-rs-cart-complete-size-overlay]')?.addEventListener('click', closeSizeModal);

  sizeAtc?.addEventListener('click', () => {
    if (!activeCard || !selectedVariantId) return;
    addVariant(activeCard, selectedVariantId, { fromModal: true });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (sizeModal?.getAttribute('aria-hidden') === 'false') closeSizeModal();
  });

  root.addEventListener('click', (event) => {
    const cta = event.target.closest('[data-rs-complete-cta]');
    if (!cta) return;
    const card = cta.closest('[data-rs-complete-card]');
    if (!card) return;

    const mode = cta.dataset.mode;
    if (mode === 'add') {
      addVariant(card, card.dataset.variantId);
      return;
    }

    if (mode === 'size') {
      event.preventDefault();
      openSizeModal(card);
    }
  });
})();
