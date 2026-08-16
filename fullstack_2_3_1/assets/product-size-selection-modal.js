(() => {
  if (window.__rsSizeSelectionModalInit) return;
  window.__rsSizeSelectionModalInit = true;

  const OPEN_LOCK_CLASS = 'rs-size-modal-open';
  const STANDARD_MIN_DAYS = 5;
  const STANDARD_MAX_DAYS = 10;
  const STANDARD_PROMISE_TEXT = `${STANDARD_MIN_DAYS} à ${STANDARD_MAX_DAYS} jours ouvrés`;
  const EXPRESS_PROMISE_TEXT = '2 à 5 jours ouvrés';
  const SHOW_EXPRESS_48H_BADGE = false;

  const parseEuSizeRange = (label) => {
    const nums = String(label || '')
      .match(/\d+/g)
      ?.map((n) => Number.parseInt(n, 10))
      .filter(Number.isFinite);
    if (!nums || nums.length < 2) return null;
    return {
      min: Math.min(nums[0], nums[1]),
      max: Math.max(nums[0], nums[1]),
      label: String(label).trim(),
    };
  };

  const resolveSockVariantsForShoeSize = (socksUpsell, shoeSizeValue) => {
    const variants = Array.isArray(socksUpsell?.variants) ? socksUpsell.variants : [];
    if (!variants.length) {
      return { primary: null, alternate: null, hasChoice: false };
    }

    const shoeSize = Number.parseFloat(String(shoeSizeValue ?? '').replace(',', '.'));
    if (!Number.isFinite(shoeSize)) {
      const fallback = variants.find((variant) => variant.available) || variants[0];
      return { primary: fallback, alternate: null, hasChoice: false };
    }

    const ranges = variants
      .map((variant) => ({ variant, range: parseEuSizeRange(variant.sizeLabel) }))
      .filter((entry) => entry.range);

    const containing = ranges.filter(({ range }) => shoeSize >= range.min && shoeSize <= range.max);

    if (containing.length >= 2) {
      const lowerRange = containing.find(({ range }) => range.max === shoeSize)?.variant || null;
      const upperRange =
        containing.find(({ range }) => range.min === shoeSize && range.max > shoeSize)?.variant || null;

      if (lowerRange && upperRange) {
        return { primary: lowerRange, alternate: upperRange, hasChoice: true };
      }

      containing.sort((a, b) => a.range.max - a.range.min - (b.range.max - b.range.min));
      return { primary: containing[0].variant, alternate: null, hasChoice: false };
    }

    if (containing.length === 1) {
      return { primary: containing[0].variant, alternate: null, hasChoice: false };
    }

    let best = null;
    let bestDistance = Infinity;
    for (const { variant, range } of ranges) {
      const midpoint = (range.min + range.max) / 2;
      const distance = Math.abs(shoeSize - midpoint);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = variant;
      }
    }

    const fallback = best || variants.find((variant) => variant.available) || variants[0];
    return { primary: fallback, alternate: null, hasChoice: false };
  };

  const normalizeUpsellSize = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(',', '.')
      .replace(/\s+/g, ' ');

  const resolveApparelVariantForSize = (apparelUpsell, sizeValue) => {
    const variants = Array.isArray(apparelUpsell?.variants) ? apparelUpsell.variants : [];
    const wantedSize = normalizeUpsellSize(sizeValue);
    if (!variants.length || !wantedSize) return null;
    return variants.find((variant) => variant.available && normalizeUpsellSize(variant.sizeLabel) === wantedSize) || null;
  };

  const resolvePreferredUpsell = (payload, sizeValue, selectedVariantId = '') => {
    const apparelVariant = resolveApparelVariantForSize(payload?.apparelUpsell, sizeValue);
    if (apparelVariant) {
      return {
        type: 'apparel',
        product: payload.apparelUpsell,
        choice: { primary: apparelVariant, alternate: null, hasChoice: false },
        activeVariant: apparelVariant,
        activeVariantId: String(apparelVariant.id),
      };
    }

    const socksChoice = resolveSockVariantsForShoeSize(payload?.socksUpsell, sizeValue);
    if (!socksChoice.primary) {
      return {
        type: 'socks',
        product: payload?.socksUpsell || null,
        choice: socksChoice,
        activeVariant: null,
        activeVariantId: '',
      };
    }

    const selectedSockVariant = selectedVariantId
      ? payload?.socksUpsell?.variants?.find((variant) => String(variant.id) === selectedVariantId) || null
      : null;
    const activeVariant = selectedSockVariant || socksChoice.primary;
    return {
      type: 'socks',
      product: payload?.socksUpsell || null,
      choice: socksChoice,
      activeVariant,
      activeVariantId: activeVariant ? String(activeVariant.id) : '',
    };
  };

  const findUpsellProductLine = (cart, upsellProductId) => {
    if (!cart?.items || !upsellProductId) return null;
    return cart.items.find((item) => String(item.product_id) === String(upsellProductId)) || null;
  };

  const presentSocksUpsellInModal = (modal, payload, shoeSizeValue, state = {}) => {
    if (!modal || (!payload?.socksUpsell && !payload?.apparelUpsell)) return null;

    const {
      selectedVariantId = '',
      inCart = false,
      busy = false,
    } = state;

    const resolution = resolvePreferredUpsell(payload, shoeSizeValue, selectedVariantId);
    const { choice, activeVariant, activeVariantId, product, type } = resolution;

    const upsellEl = modal.querySelector('[data-rs-modal-socks-upsell]');
    const titleEl = modal.querySelector('[data-rs-modal-socks-title]');
    const imageEl = modal.querySelector('[data-rs-modal-socks-image]');
    const priceEl = modal.querySelector('[data-rs-modal-socks-price]');
    const sizeEl = modal.querySelector('[data-rs-modal-socks-size]');
    const addBtn = modal.querySelector('[data-rs-modal-socks-add]');
    const optionsEl = modal.querySelector('[data-rs-modal-socks-size-options]');
    const optionsGridEl = modal.querySelector('[data-rs-modal-socks-size-options-grid]');

    if (upsellEl) upsellEl.hidden = !activeVariant;
    if (titleEl) titleEl.textContent = product?.title || '';
    if (imageEl && product?.image) {
      imageEl.src = product.image;
      imageEl.alt = '';
    }
    if (priceEl) priceEl.textContent = activeVariant?.priceFormatted || '';
    if (sizeEl) {
      if (!activeVariant?.sizeLabel) {
        sizeEl.textContent = '';
      } else if (type === 'apparel') {
        sizeEl.textContent = `Taille ${activeVariant.sizeLabel}`;
      } else {
        sizeEl.textContent = `Taille ${activeVariant.sizeLabel}${choice.hasChoice ? ' · choix disponible' : ' · adaptée à votre pointure'}`;
      }
    }
    // Never hard-disable the toggle for stock — busy uses .is-loading on the row.
    // Disabled buttons swallow/re-target clicks and break remove→re-add.
    if (addBtn) addBtn.disabled = false;

    if (optionsEl && optionsGridEl) {
      if (type !== 'socks' || !choice.hasChoice || !choice.primary || !choice.alternate) {
        optionsEl.hidden = true;
        optionsGridEl.replaceChildren();
      } else {
        optionsEl.hidden = false;
        optionsGridEl.replaceChildren();
        const optionDefs = [
          { variant: choice.primary, hint: 'Recommandée' },
          { variant: choice.alternate, hint: 'Taille au-dessus' },
        ];
        for (const { variant, hint } of optionDefs) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'rs-size-modal__socks-size-option';
          btn.dataset.rsSocksSizeOption = String(variant.id);
          btn.setAttribute('role', 'radio');
          const isSelected = String(variant.id) === activeVariantId;
          btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
          btn.classList.toggle('is-selected', isSelected);
          btn.disabled = busy || !variant.available;

          const label = document.createElement('span');
          label.className = 'rs-size-modal__socks-size-option-label';
          label.textContent = variant.sizeLabel;

          const meta = document.createElement('span');
          meta.className = 'rs-size-modal__socks-size-option-meta';
          meta.textContent = hint;

          btn.append(label, meta);
          optionsGridEl.appendChild(btn);
        }
      }
    }

    return { choice, activeVariantId, activeVariant, product, type };
  };

  const escName = (name) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(name) : String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"'));

  const getPayload = (modal) => {
    const script = document.getElementById(`${modal.id}-payload`);
    if (!script?.textContent) return null;
    try {
      return JSON.parse(script.textContent);
    } catch {
      return null;
    }
  };

  const getSectionProductForm = (modal) => {
    const section = modal.closest('.shopify-section-product-section');
    return (
      section?.querySelector('product-form[data-ref="product-form"]') ||
      document.querySelector('product-form[data-ref="product-form"]')
    );
  };

  const getVariantPicker = (productForm) => productForm?.querySelector('variant-picker');

  const getSelectedOptionLabels = (picker, optionNames) =>
    optionNames.map((name) => {
      const esc = escName(name);
      const r = picker.querySelector(`input[type="radio"][name="option-${esc}"]:checked`);
      if (r) return r.value;
      const sel = picker.querySelector(`select[name="option-${esc}"]`);
      return sel?.selectedOptions?.[0]?.value ?? null;
    });

  const findVariantById = (variants, id) => variants.find((v) => String(v.id) === String(id));

  const variantsForGrid = (variants, sizeIdx, labels) =>
    variants.filter((v) => {
      for (let j = 0; j < labels.length; j++) {
        if (j === sizeIdx) continue;
        if (labels[j] == null) return false;
        if (String(v.options[j]) !== String(labels[j])) return false;
      }
      return true;
    });

  const setNativeSize = (picker, sizeOptionName, sizeValue) => {
    const esc = escName(sizeOptionName);
    const radios = picker.querySelectorAll(`input[type="radio"][name="option-${esc}"]`);
    for (const radio of radios) {
      if (radio.value === sizeValue) {
        if (radio.getAttribute('aria-disabled') === 'true') return false;
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    const sel = picker.querySelector(`select[name="option-${esc}"]`);
    if (sel) {
      const opt = Array.from(sel.options).find((o) => o.value === sizeValue);
      if (!opt || opt.getAttribute('aria-disabled') === 'true') return false;
      sel.value = sizeValue;
      for (const o of sel.options) o.removeAttribute('selected');
      opt.setAttribute('selected', 'selected');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  };

  const getFormVariantId = (form) => {
    const idInput = form?.querySelector('input[name="id"]');
    return idInput?.value ? String(idInput.value) : '';
  };

  // The modal lets people submit before the theme's variant round-trip lands,
  // so the id has to be written from the clicked card, not read from the form.
  const setFormVariantId = (form, variantId) => {
    if (!form || !variantId) return;
    let idInput = form.querySelector('input[name="id"]');
    if (!idInput) {
      idInput = document.createElement('input');
      idInput.type = 'hidden';
      idInput.name = 'id';
      form.appendChild(idInput);
    }
    idInput.value = String(variantId);
  };

  const setHiddenProp = (form, key, value) => {
    if (!form) return;
    const nameAttr = `properties[${key}]`;
    let input = null;
    form.querySelectorAll('input[type="hidden"]').forEach((inp) => {
      if (inp.name === nameAttr) input = inp;
    });
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = nameAttr;
      form.appendChild(input);
    }
    input.value = value;
  };

  const removeHiddenProp = (form, key) => {
    if (!form) return;
    const nameAttr = `properties[${key}]`;
    form.querySelectorAll(`input[type="hidden"][name="${escName(nameAttr)}"]`).forEach((input) => input.remove());
  };

  const toPositiveInt = (value) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  const variantHasExpressPrice = (v) => {
    const expPrice = Number(v.expressPriceCents);
    return v.expressPriceDefined === true && Number.isFinite(expPrice) && expPrice > 0;
  };

  const variantHasExpress = (v) => variantHasExpressPrice(v);

  const shippingLayout = (v) => {
    if (!variantHasExpressPrice(v)) {
      return { showStandard: true, showExpress: false, forceExpress: false };
    }
    const expPrice = Number(v.expressPriceCents);
    const basePrice = Number(v.price);
    if (Number.isFinite(basePrice) && expPrice > basePrice) {
      return { showStandard: true, showExpress: true, forceExpress: false };
    }
    return { showStandard: false, showExpress: true, forceExpress: true };
  };

  const compactText = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim();
  };

  const variantIs48hExpress = (variant) => variant?.expressIs48h === true;

  const updateCartDeliverySummary = (modal, variant, payload, { isExpressSelection = false } = {}) => {
    if (!modal || !variant) return;
    const panel = modal.querySelector('.rs-size-modal__panel');
    const standardShippingName = panel?.dataset?.rsStandardShippingName || 'Livraison';
    const expressShippingName = panel?.dataset?.rsExpressShippingName || 'Express';
    const modalI18n = payload?.i18n || {};
    const deliveryLabel = modalI18n.deliveryLabel || standardShippingName;

    const layout = shippingLayout(variant);
    const expressSelected = !!isExpressSelection && layout.showExpress;
    const is48h = variantIs48hExpress(variant);

    const labelEl = modal.querySelector('[data-rs-modal-cart-delivery-label]');
    const badgeEl = modal.querySelector('[data-rs-modal-cart-delivery-badge]');
    const pictoEl = modal.querySelector('[data-rs-modal-cart-delivery-picto]');

    if (labelEl) {
      labelEl.textContent = deliveryLabel;
    }

    if (badgeEl) {
      badgeEl.textContent = expressSelected ? expressShippingName : standardShippingName;
      badgeEl.hidden = false;
      badgeEl.classList.remove('is-48h');
      badgeEl.classList.toggle('is-express', expressSelected);
    }

    if (pictoEl) {
      pictoEl.hidden = !(expressSelected && is48h);
    }
  };

  let scrollLockDepth = 0;
  let scrollLockY = 0;
  // Mobile-only touchmove handler — holds reference so we can remove it on close.
  let mobileTouchLockHandler = null;

  // Stable viewport height — visualViewport is resilient to Safari browser bars
  // and safe-area changes, unlike dvh/100vh. Exposed as --rs-stable-vh (1% unit).
  const setStableVh = () => {
    const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    const unit = `${h * 0.01}px`;
    document.documentElement.style.setProperty('--rs-stable-vh', unit);
    document.querySelectorAll('[data-rs-size-modal][aria-hidden="false"]').forEach((el) => {
      el.style.setProperty('--rs-stable-vh', unit);
    });
  };

  let viewportListenersAttached = false;
  const attachViewportListeners = () => {
    setStableVh();
    if (viewportListenersAttached) return;
    viewportListenersAttached = true;
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setStableVh);
      window.visualViewport.addEventListener('scroll', setStableVh);
    }
    window.addEventListener('resize', setStableVh);
    window.addEventListener('orientationchange', setStableVh);
  };
  const detachViewportListeners = () => {
    if (!viewportListenersAttached) return;
    viewportListenersAttached = false;
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', setStableVh);
      window.visualViewport.removeEventListener('scroll', setStableVh);
    }
    window.removeEventListener('resize', setStableVh);
    window.removeEventListener('orientationchange', setStableVh);
  };

  const lockBackgroundScroll = () => {
    if (scrollLockDepth > 0) {
      scrollLockDepth += 1;
      return;
    }
    scrollLockDepth = 1;
    scrollLockY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.classList.add(OPEN_LOCK_CLASS);
    document.body.classList.add(OPEN_LOCK_CLASS);

    if (window.innerWidth < 750) {
      // Mobile: applying position:fixed to body causes Chrome's bottom toolbar
      // to reappear (it interprets the layout change as "user stopped scrolling").
      // Instead, block background scroll via a non-passive touchmove listener,
      // which keeps the toolbar state completely untouched.
      mobileTouchLockHandler = (e) => {
        const target = e.target;
        const inScrollable =
          target &&
          typeof target.closest === 'function' &&
          target.closest(
            '.rs-size-modal__grid-scroller, .rs-size-modal__cart-inner, .product-size-modal, .product-size-modal__body',
          );
        if (!inScrollable) e.preventDefault();
      };
      document.addEventListener('touchmove', mobileTouchLockHandler, { passive: false });
    } else {
      // Desktop: classic position:fixed scroll lock.
      document.body.style.top = `-${scrollLockY}px`;
    }
  };

  const unlockBackgroundScroll = () => {
    if (scrollLockDepth === 0) return;
    scrollLockDepth -= 1;
    if (scrollLockDepth > 0) return;
    document.documentElement.classList.remove(OPEN_LOCK_CLASS);
    document.body.classList.remove(OPEN_LOCK_CLASS);

    if (mobileTouchLockHandler) {
      document.removeEventListener('touchmove', mobileTouchLockHandler);
      mobileTouchLockHandler = null;
      // No body.top to restore — we never applied position:fixed on mobile.
    } else {
      document.body.style.removeProperty('top');
      window.scrollTo(0, scrollLockY);
    }
  };

  /** @type {Map<string, { open: (trigger: Element | null) => void; close: () => void }>} */
  const registry = new Map();

  const mobileMq = window.matchMedia('(max-width: 750px)');

  const getStickyAnchorRect = (anchor) => {
    if (!anchor) return null;
    let rect = anchor.getBoundingClientRect();
    if (rect.height < 1 && rect.width < 1) {
      const wrap = anchor.closest('.rs-size-modal__trigger-wrap');
      if (wrap) rect = wrap.getBoundingClientRect();
    }
    if (rect.height < 1 && rect.width < 1) return null;
    return rect;
  };

  const markPdpDockReady = () => {
    document.documentElement.classList.add('rs-pdp-dock-ready');
  };

  const finalizeDockBoot = (updateDockVisibility) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateDockVisibility();
        markPdpDockReady();
      });
    });
  };

  const shouldShowStickyAfterAnchor = (anchor, footerEl, dockEl) => {
    const anchorRect = getStickyAnchorRect(anchor);
    if (!anchorRect) return false;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    if (anchorRect.bottom > 0 && anchorRect.top < viewportHeight) return false;
    if (anchorRect.top >= viewportHeight) return false;
    if (footerEl) {
      const footerRect = footerEl.getBoundingClientRect();
      let bottomReserve = 16;
      if (dockEl) {
        const dockStyles = getComputedStyle(dockEl);
        const dockHeight = dockEl.offsetHeight || 58;
        const dockBottom = Number.parseFloat(dockStyles.bottom) || 0;
        bottomReserve = dockHeight + dockBottom + 16;
      }
      if (footerRect.top <= viewportHeight - bottomReserve) return false;
    }
    return true;
  };

  const mountProductDocks = (section) => {
    if (!section || section.dataset.rsDockMounted === 'true') return;

    const productForm =
      section.querySelector('product-form[data-ref="product-form"]') ||
      document.querySelector('product-form[data-ref="product-form"]');
    const mainAtcBtn = productForm?.querySelector('[data-ref="add-to-cart-button"]');
    const stickyAnchor =
      productForm?.querySelector('.rs-size-modal__trigger') ||
      productForm?.querySelector('[data-ref="add-to-cart-button-container"]') ||
      mainAtcBtn;
    const mobileDock = section.querySelector('[data-rs-mobile-dock]');
    const desktopDock = section.querySelector('[data-rs-desktop-dock]');
    const footer = document.querySelector('[data-ref="footer"]');

    if (!stickyAnchor || (!mobileDock && !desktopDock)) return;

    section.dataset.rsDockMounted = 'true';

    const updateDockVisibility = () => {
      const activeDock = mobileMq.matches ? mobileDock : desktopDock;
      const shouldShow = shouldShowStickyAfterAnchor(stickyAnchor, footer, activeDock);

      if (mobileDock) {
        mobileDock.classList.toggle('is-visible', mobileMq.matches && shouldShow);
      }
      if (desktopDock) {
        const showDesktop = !mobileMq.matches && shouldShow;
        desktopDock.classList.toggle('is-visible', showDesktop);
        desktopDock.setAttribute('aria-hidden', showDesktop ? 'false' : 'true');
        if (showDesktop) {
          desktopDock.removeAttribute('inert');
        } else {
          desktopDock.setAttribute('inert', '');
        }
      }
    };

    window.addEventListener('scroll', updateDockVisibility, { passive: true });
    window.addEventListener('resize', updateDockVisibility);
    mobileMq.addEventListener('change', updateDockVisibility);

    section.__rsUpdateDockVisibility = updateDockVisibility;
    finalizeDockBoot(updateDockVisibility);
  };

  document.querySelectorAll('.shopify-section-product-section').forEach((section) => {
    if (section.querySelector('[data-rs-mobile-dock], [data-rs-desktop-dock]')) {
      mountProductDocks(section);
    }
  });

  const mountModal = (modal) => {
    const payload = getPayload(modal);
    if (!payload) return;

    const section = modal.closest('.shopify-section-product-section');
    const productForm = getSectionProductForm(modal);
    const form = productForm?.querySelector('form[action$="/cart/add"]');
    const picker = getVariantPicker(productForm);
    const footer = document.querySelector('[data-ref="footer"]');
    if (!productForm || !form || !picker) return;

    const grid = modal.querySelector('[data-rs-size-grid]');
    const gridExpandBtn = modal.querySelector('[data-rs-size-grid-expand]');
    const gridScroller = modal.querySelector('.rs-size-modal__grid-scroller');
    const btnAtc = modal.querySelector('[data-rs-modal-atc]');
    const btnStandard = modal.querySelector('[data-rs-ship="standard"]');
    const btnExpress = modal.querySelector('[data-rs-ship="express"]');
    const shippingSection = modal.querySelector('[data-rs-shipping-section]');
    const stdPriceEl = modal.querySelector('[data-rs-ship-standard-price]');
    const expPromiseEl = modal.querySelector('[data-rs-ship-express-promise]');
    const expPriceEl = modal.querySelector('[data-rs-ship-express-price]');
    const expPictoEl = modal.querySelector('[data-rs-ship-express-picto]');
    const cartStdPriceEl = modal.querySelector('[data-rs-cart-ship-standard-price]');
    const pdpDeliveryStandard = section?.querySelector('[data-rs-pdp-delivery-standard]');
    const pdpDeliveryExpress = section?.querySelector('[data-rs-pdp-delivery-express]');
    const mainAtcBtn = productForm.querySelector('[data-ref="add-to-cart-button"]');
    const stickyAnchor =
      productForm.querySelector('.rs-size-modal__trigger') ||
      productForm.querySelector('[data-ref="add-to-cart-button-container"]') ||
      mainAtcBtn;
    const mobileDock = section?.querySelector('[data-rs-mobile-dock]');
    const desktopDock = section?.querySelector('[data-rs-desktop-dock]');
    const dockPriceEls = section?.querySelectorAll('[data-rs-mobile-dock-price]');
    const dockSizeEl = mobileDock?.querySelector('[data-rs-mobile-dock-size]');
    const dockPrimaryButtons = section?.querySelectorAll('[data-rs-mobile-dock-primary]');
    const dockModalId = mobileDock?.getAttribute('data-rs-mobile-dock-modal-id')
      || desktopDock?.getAttribute('data-rs-mobile-dock-modal-id')
      || '';
    const unitEu = modal.querySelector('[data-rs-size-unit="eu"]');
    const heroTitle = modal.querySelector('[data-rs-modal-hero-title]');
    const expressLegend = modal.querySelector('[data-rs-modal-express-legend]');
    const expressLegendText = modal.querySelector('[data-rs-modal-express-legend-text]');
    const promoBlock = modal.querySelector('[data-rs-modal-promo]');
    const panel = modal.querySelector('.rs-size-modal__panel');
    const standardShippingName = panel?.dataset?.rsStandardShippingName || 'Livraison';
    const expressShippingName = panel?.dataset?.rsExpressShippingName || 'Express';
    const modalI18n = payload.i18n || {};
    const expressPromiseFallback = modalI18n.expressPromiseDefault || EXPRESS_PROMISE_TEXT;
    const hasAnyExpress = payload.variants.some((variant) => variantHasExpress(variant));
    const firstExpressVariant = payload.variants.find((variant) => variantHasExpress(variant)) || null;

    // Cart-confirmation view (post add-to-cart) elements
    const cartViewEl = modal.querySelector('[data-rs-modal-cart-view]');
    const cartViewTitleEl = modal.querySelector('[data-rs-modal-cart-title]');
    const cartViewVariantEl = modal.querySelector('[data-rs-modal-cart-variant]');
    const cartViewPriceEl = modal.querySelector('[data-rs-modal-cart-price]');
    const cartViewImageEl = modal.querySelector('[data-rs-modal-cart-image]');
    const cartCheckoutEl = modal.querySelector('[data-rs-modal-cart-checkout]');
    const cartUpsellsEl = modal.querySelector('[data-rs-modal-cart-upsells]');
    const cartUpsellEl = modal.querySelector('[data-rs-modal-socks-upsell]');
    const cartUpsellRowEl = modal.querySelector('[data-rs-modal-socks-upsell-row]');
    const cartUpsellToggleEl = modal.querySelector('[data-rs-modal-socks-add]');
    const cartUpsellIconEl = modal.querySelector('[data-rs-modal-socks-add-icon]');
    const cartUpsellPriceEl = modal.querySelector('[data-rs-modal-socks-price]');
    const cartUpsellSizeEl = modal.querySelector('[data-rs-modal-socks-size]');
    const socksSizeOptionsEl = modal.querySelector('[data-rs-modal-socks-size-options]');
    const socksSizeOptionsGridEl = modal.querySelector('[data-rs-modal-socks-size-options-grid]');
    const protectionUpsellEl = modal.querySelector('[data-rs-modal-protection-upsell]');
    const protectionUpsellRowEl = modal.querySelector('[data-rs-modal-protection-upsell-row]');
    const protectionToggleEl = modal.querySelector('[data-rs-modal-protection-add]');
    const protectionIconEl = modal.querySelector('[data-rs-modal-protection-add-icon]');
    const btnCartStandard = modal.querySelector('[data-rs-cart-ship="standard"]');
    const btnCartSignature = modal.querySelector('[data-rs-cart-ship="signature"]');
    const cartDeliveryOptionsEl = modal.querySelector('[data-rs-modal-cart-delivery-options]');

    let shipMode = 'standard';
    let selectedVariant = null;
    let lastChosenSizeValue = '';
    let pendingVariantSync = false;
    let lastFocused = null;
    let lastKnownScrollY = window.scrollY;
    let gridExpanded = false;
    let gridExpandable = false;
    let pendingCartView = false;
    let pendingExpressSelection = false;
    let cartViewFallbackTimer = null;
    let upsellInCart = false;
    let upsellLineKey = '';
    let upsellBusy = false;
    let cartViewShoeVariant = null;
    let resolvedSockVariant = null;
    let selectedSockVariantId = '';
    let sockSizeChoice = null;
    let resolvedUpsellProduct = null;
    let activeUpsellProductId = '';
    let protectionInCart = false;
    let protectionLineKey = '';
    let protectionBusy = false;
    let cartDeliveryMode = 'standard';
    let signatureInCart = false;
    let signatureLineKey = '';
    let signatureBusy = false;

    const applyGridExpandedState = () => {
      if (!gridExpandBtn) return;
      if (!gridExpandable) {
        modal.classList.add('is-grid-expanded');
        gridExpandBtn.hidden = true;
        gridExpandBtn.setAttribute('aria-expanded', 'true');
        return;
      }
      modal.classList.toggle('is-grid-expanded', gridExpanded);
      // One-shot: hide button once expanded, never show "voir moins"
      gridExpandBtn.hidden = gridExpanded;
      gridExpandBtn.setAttribute('aria-expanded', gridExpanded ? 'true' : 'false');
      if (!gridExpanded) gridExpandBtn.textContent = 'Voir toutes les tailles';
    };

    const clearCartViewState = () => {
      pendingCartView = false;
      if (cartViewFallbackTimer) {
        window.clearTimeout(cartViewFallbackTimer);
        cartViewFallbackTimer = null;
      }
    };

    const closeModal = () => {
      if (modal.getAttribute('aria-hidden') === 'true') return;
      modal.setAttribute('aria-hidden', 'true');
      modal.classList.remove('is-cart-view');
      clearCartViewState();
      if (!document.querySelector('[data-rs-size-modal][aria-hidden="false"]')) {
        unlockBackgroundScroll();
        detachViewportListeners();
      }
      // Keep PDP state in sync when closing without picking a size.
      syncSelectionFromForm();
      if (lastFocused instanceof HTMLElement) lastFocused.focus();
    };

    const openModal = (trigger) => {
      if (modal.getAttribute('aria-hidden') === 'false') return;
      lastFocused = trigger instanceof HTMLElement ? trigger : null;
      // Escape the sticky product-info containing block so position:fixed and
      // the visualViewport height var behave correctly on real iOS Safari.
      if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
      }
      modal.setAttribute('aria-hidden', 'false');
      modal.classList.remove('is-cart-view');
      clearCartViewState();
      attachViewportListeners();
      lockBackgroundScroll();
      gridExpanded = false;
      refreshGrid();
      // Match reference behavior: no size pre-selected on open.
      selectedVariant = null;
      shipMode = 'standard';
      updateShippingCards();
      updateModalAtcState();
      highlightSelectedCard();
      (unitEu || btnAtc)?.focus();
      // Warm cart.js so post-ATC upsell sync is near-instant.
      prefetchCartState();
    };

    const displayLabel = (v) => `${v.sizeValue} EU`;

    const priceShown = (v) => {
      const layout = shippingLayout(v);
      const isExpressOnly = !layout.showStandard && layout.showExpress;
      if (isExpressOnly) {
        return v.expressPriceFormatted || v.priceFormatted;
      }
      return v.priceFormatted;
    };

    const sizeCardAriaLabel = (v) => {
      const label = displayLabel(v);
      if (!v.available) return `${label}, indisponible`;
      return `${label}, ${priceShown(v)}`;
    };

    const setCardPriceSlot = (slot, v) => {
      if (!slot) return;
      slot.textContent = '';
      const cmp = Number(v.compareAtPrice);
      const base = Number(v.price);
      const hasCompare = Number.isFinite(cmp) && Number.isFinite(base) && cmp > base && v.compareAtPriceFormatted;

      if (hasCompare) {
        const was = document.createElement('span');
        was.className = 'rs-size-modal__size-price rs-size-modal__size-price--was';
        was.textContent = v.compareAtPriceFormatted;
        slot.appendChild(was);
      }

      const one = document.createElement('span');
      one.className = hasCompare
        ? 'rs-size-modal__size-price rs-size-modal__size-price--now'
        : 'rs-size-modal__size-price';
      one.textContent = priceShown(v);
      slot.appendChild(one);
    };

    const variantIs48hExpressLocal = (variant) => variant?.expressIs48h === true;

    const expressPromiseForVariant = (variant) => {
      if (!variantIs48hExpressLocal(variant)) {
        return expressPromiseFallback;
      }
      const customPromise = compactText(variant?.expressCustomPromise);
      if (customPromise) return customPromise;
      return expressPromiseFallback;
    };

    const expressLegendForVariant = (variant) => expressPromiseForVariant(variant || firstExpressVariant);

    const updateExpressLegend = () => {
      if (!expressLegend) return;
      expressLegend.hidden = !SHOW_EXPRESS_48H_BADGE || !hasAnyExpress;
      if (!SHOW_EXPRESS_48H_BADGE || !hasAnyExpress || !expressLegendText) return;
      expressLegendText.textContent = expressLegendForVariant(selectedVariant || firstExpressVariant);
    };

    const updateHeroDeliveryRange = () => {
      if (heroTitle) heroTitle.textContent = payload.productTitle;
      updateExpressLegend();
    };

    const updatePdpDeliveryPromise = (variant, layout) => {
      if (!variant) return;
      if (pdpDeliveryStandard) {
        pdpDeliveryStandard.textContent = `${STANDARD_MIN_DAYS}-${STANDARD_MAX_DAYS} jours ouvrés (délais estimés)`;
      }
      if (pdpDeliveryExpress) {
        const showExpress = !!layout?.showExpress;
        pdpDeliveryExpress.hidden = !showExpress;
        if (showExpress) {
          pdpDeliveryExpress.textContent = `Express ${expressPromiseForVariant(variant)}`;
        }
      }
    };

    const syncDeliveryEstimationBlocks = (variant) => {
      if (!variant || !section) return;
      const detail = {
        standardMin: STANDARD_MIN_DAYS,
        standardMax: STANDARD_MAX_DAYS,
      };
      section.querySelectorAll('delivery-estimation').forEach((deliveryEl) => {
        deliveryEl.dispatchEvent(
          new CustomEvent('delivery-estimation:update', {
            detail,
          }),
        );
      });
    };

    const updateShippingCards = () => {
      const cardsWrap = modal.querySelector('.rs-size-modal__shipping-cards');
      if (!selectedVariant) {
        // Hide shipping selector until user picks a size.
        if (shippingSection) shippingSection.hidden = true;
        if (promoBlock) promoBlock.hidden = false;
        if (btnStandard) {
          btnStandard.hidden = false;
          btnStandard.style.removeProperty('display');
        }
        if (btnExpress) {
          btnExpress.hidden = true;
          btnExpress.style.setProperty('display', 'none');
        }
        cardsWrap?.classList.add('is-single');
        btnStandard?.classList.add('is-selected');
        btnExpress?.classList.remove('is-selected');
        btnExpress?.setAttribute('aria-checked', 'false');
        btnStandard?.setAttribute('aria-checked', 'true');
        if (stdPriceEl) stdPriceEl.textContent = '';
        if (expPictoEl) expPictoEl.hidden = true;
        if (expPromiseEl) {
          expPromiseEl.hidden = true;
          expPromiseEl.textContent = '';
        }
        if (expPriceEl) expPriceEl.textContent = '';
        btnExpress?.classList.remove('is-48h-express');
        if (pdpDeliveryExpress) pdpDeliveryExpress.hidden = true;
        updateHeroDeliveryRange();
        return;
      }
      if (shippingSection) shippingSection.hidden = false;
      if (promoBlock) promoBlock.hidden = true;
      const layout = shippingLayout(selectedVariant);
      const { showStandard, showExpress, forceExpress } = layout;
      if (btnStandard) {
        btnStandard.hidden = !showStandard;
        if (showStandard) btnStandard.style.removeProperty('display');
      }
      if (btnExpress) {
        btnExpress.hidden = !showExpress;
        if (showExpress) {
          btnExpress.style.removeProperty('display');
        } else {
          btnExpress.style.setProperty('display', 'none');
        }
      }
      cardsWrap?.classList.toggle('is-single', (showStandard && !showExpress) || (!showStandard && showExpress));

      if (forceExpress) {
        shipMode = 'express';
      } else if (!showExpress && shipMode === 'express') {
        shipMode = 'standard';
      } else if (!showStandard && shipMode === 'standard') {
        shipMode = 'express';
      }

      btnStandard?.classList.toggle('is-selected', shipMode === 'standard');
      btnExpress?.classList.toggle('is-selected', shipMode === 'express');
      btnStandard?.setAttribute('aria-checked', shipMode === 'standard' ? 'true' : 'false');
      btnExpress?.setAttribute('aria-checked', shipMode === 'express' ? 'true' : 'false');

      const is48hExpress = variantIs48hExpressLocal(selectedVariant);
      btnExpress?.classList.toggle('is-48h-express', showExpress && is48hExpress);
      if (expPictoEl) expPictoEl.hidden = !showExpress || !is48hExpress;
      if (expPromiseEl) {
        if (showExpress && !is48hExpress) {
          // StockX express: show "2 à 5 jours ouvrés". 48h cards use the picto instead.
          expPromiseEl.hidden = false;
          expPromiseEl.textContent = expressPromiseFallback;
        } else {
          expPromiseEl.hidden = true;
          expPromiseEl.textContent = '';
        }
      }
      if (stdPriceEl) stdPriceEl.textContent = selectedVariant.priceFormatted || '';
      if (cartStdPriceEl) cartStdPriceEl.textContent = selectedVariant.priceFormatted || '';
      if (expPriceEl) expPriceEl.textContent = selectedVariant.expressPriceFormatted || selectedVariant.priceFormatted;

      updateHeroDeliveryRange();

      updatePdpDeliveryPromise(selectedVariant, layout);
      syncDeliveryEstimationBlocks(selectedVariant);
    };

    const updateModalAtcState = () => {
      // Availability comes from the payload, so the button unlocks on the size
      // click instead of waiting for the theme's section render.
      const ok = selectedVariant && selectedVariant.available;
      if (btnAtc) btnAtc.disabled = !ok;
      if (dockPrimaryButtons) {
        dockPrimaryButtons.forEach((btn) => {
          btn.dataset.mode = 'select';
          btn.textContent = btn.closest('[data-rs-desktop-dock]')
            ? (modalI18n.selectSizeDesktop || 'Sélectionner votre taille')
            : (modalI18n.selectSizeMobile || 'Sélectionnez votre taille');
        });
      }
    };

    const updateMobileDockVisibility = () => {
      if (typeof section.__rsUpdateDockVisibility === 'function') {
        section.__rsUpdateDockVisibility();
        return;
      }
      const activeDock = mobileMq.matches ? mobileDock : desktopDock;
      const shouldShow = shouldShowStickyAfterAnchor(stickyAnchor, footer, activeDock);

      if (mobileDock) {
        mobileDock.classList.toggle('is-visible', mobileMq.matches && shouldShow);
      }
      if (desktopDock) {
        const showDesktop = !mobileMq.matches && shouldShow;
        desktopDock.classList.toggle('is-visible', showDesktop);
        desktopDock.setAttribute('aria-hidden', showDesktop ? 'false' : 'true');
        if (showDesktop) {
          desktopDock.removeAttribute('inert');
        } else {
          desktopDock.setAttribute('inert', '');
        }
      }
      lastKnownScrollY = window.scrollY;
    };

    const lowestSellPriceFormatted = () => {
      let minCents = null;
      let minFormatted = '';
      for (const variant of payload.variants) {
        if (!variant.available) continue;
        const layout = shippingLayout(variant);
        const isExpressOnly = !layout.showStandard && layout.showExpress;
        const cents = isExpressOnly ? Number(variant.expressPriceCents) : Number(variant.price);
        if (!Number.isFinite(cents) || cents <= 0) continue;
        const formatted = isExpressOnly
          ? variant.expressPriceFormatted || variant.priceFormatted
          : variant.priceFormatted;
        if (minCents === null || cents < minCents) {
          minCents = cents;
          minFormatted = formatted;
        }
      }
      return minFormatted;
    };

    const updateMobileDock = () => {
      if (!mobileDock && !desktopDock) return;
      const lowestPrice = lowestSellPriceFormatted();
      if (lowestPrice && dockPriceEls?.length) {
        dockPriceEls.forEach((el) => {
          const fromLabel = window.Theme?.translations?.startingFrom || 'From';
          el.textContent = `${fromLabel} ${lowestPrice}`;
        });
      }
      if (!selectedVariant) {
        updateMobileDockVisibility();
        return;
      }
      if (dockSizeEl) {
        dockSizeEl.textContent = displayLabel(selectedVariant);
      }
      updateMobileDockVisibility();
    };

    const highlightSelectedCard = () => {
      if (!grid) return;
      const id = selectedVariant ? String(selectedVariant.id) : '';
      let hasSelection = false;
      grid.querySelectorAll('[data-rs-size-card]').forEach((el) => {
        const isSelected = id !== '' && el.getAttribute('data-variant-id') === id;
        if (isSelected) hasSelection = true;
        el.classList.toggle('is-selected', isSelected);
        el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      });
      grid.classList.toggle('has-selection', hasSelection);
    };

    const syncSelectionFromForm = () => {
      const id = getFormVariantId(form);
      const formVariant = findVariantById(payload.variants, id);
      // Ignore a lagging form value while a modal size click is still settling.
      if (pendingVariantSync && formVariant && formVariant.sizeValue !== lastChosenSizeValue) return;
      selectedVariant = formVariant || selectedVariant;
      if (selectedVariant?.sizeValue) {
        lastChosenSizeValue = selectedVariant.sizeValue;
      }
      updateShippingCards();
      updateModalAtcState();
      updateMobileDock();
      highlightSelectedCard();
    };

    const refreshGridPrices = () => {
      if (!grid) return;
      grid.querySelectorAll('[data-rs-size-card]').forEach((card) => {
        const vid = card.getAttribute('data-variant-id');
        const v = payload.variants.find((x) => String(x.id) === String(vid));
        if (!v) return;
        const slot = card.querySelector('.rs-size-modal__size-price-slot');
        if (slot) setCardPriceSlot(slot, v);
        const lab = card.querySelector('.rs-size-modal__size-label');
        if (lab) lab.textContent = displayLabel(v);
        card.setAttribute('aria-label', sizeCardAriaLabel(v));
      });
    };

    const refreshGrid = () => {
      if (!grid) return;
      grid.textContent = '';
      const labels = getSelectedOptionLabels(picker, payload.optionNames);
      const list = variantsForGrid(payload.variants, payload.sizeOptionIndex, labels);
      gridExpandable = list.length > 9;
      if (!gridExpandable) gridExpanded = false;
      applyGridExpandedState();

      for (const v of list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'rs-size-modal__size-card';
        b.setAttribute('data-rs-size-card', '');
        b.setAttribute('data-variant-id', String(v.id));
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', 'false');
        b.disabled = !v.available;

        const lab = document.createElement('span');
        lab.className = 'rs-size-modal__size-label';
        lab.textContent = displayLabel(v);
        b.appendChild(lab);

        const slot = document.createElement('div');
        slot.className = 'rs-size-modal__size-price-slot';
        setCardPriceSlot(slot, v);
        b.appendChild(slot);
        b.setAttribute('aria-label', sizeCardAriaLabel(v));

        if (shippingLayout(v).showExpress) {
          const dot = document.createElement('span');
          dot.className = 'rs-size-modal__size-dot';
          dot.setAttribute('aria-hidden', 'true');
          b.appendChild(dot);
        }

        b.addEventListener('click', () => {
          if (!v.available) return;
          lastChosenSizeValue = v.sizeValue;
          pendingVariantSync = true;
          updateModalAtcState();
          const ok = setNativeSize(picker, payload.sizeOptionName, v.sizeValue);
          if (!ok) {
            pendingVariantSync = false;
            updateModalAtcState();
            return;
          }
          // Paint from the local payload right away; the theme's
          // `variant:updated` round-trip only reconciles afterwards.
          selectedVariant = v;
          highlightSelectedCard();
          updateShippingCards();
          updateModalAtcState();
          refreshGridPrices();
          updateMobileDock();
          const onUpdated = () => {
            pendingVariantSync = false;
            // The form can still hold the previous variant when clicks come
            // faster than the section render: only trust it when it agrees
            // with the size actually chosen.
            const formVariant = findVariantById(payload.variants, getFormVariantId(form));
            selectedVariant = formVariant && formVariant.sizeValue === lastChosenSizeValue ? formVariant : v;
            updateShippingCards();
            updateModalAtcState();
            highlightSelectedCard();
            refreshGridPrices();
          };
          productForm.addEventListener('variant:updated', onUpdated, { once: true });
          window.setTimeout(() => {
            if (!pendingVariantSync) return;
            pendingVariantSync = false;
            onUpdated();
          }, 2500);
        });

        grid.appendChild(b);
      }
    };

    productForm.addEventListener('variant:updated', () => {
      syncSelectionFromForm();
      refreshGridPrices();
    });

    unitEu?.addEventListener('click', () => {
      unitEu.classList.add('is-active');
      unitEu.setAttribute('aria-pressed', 'true');
      refreshGrid();
      highlightSelectedCard();
    });

    btnStandard?.addEventListener('click', () => {
      shipMode = 'standard';
      updateShippingCards();
      refreshGridPrices();
      updateMobileDock();
    });

    btnExpress?.addEventListener('click', () => {
      if (btnExpress?.hidden) return;
      shipMode = 'express';
      updateShippingCards();
      refreshGridPrices();
      updateMobileDock();
    });

    btnAtc?.addEventListener('click', () => {
      if (!selectedVariant || btnAtc.disabled) return;
      setFormVariantId(form, selectedVariant.id);
      const selectedLayout = shippingLayout(selectedVariant);
      const isExpressSelection = shipMode === 'express' && selectedLayout.showExpress;
      const expressLine =
        isExpressSelection
          ? `${expressShippingName} ${expressPromiseForVariant(selectedVariant)}`
          : 'Standard';
      setHiddenProp(form, "Mode d'expédition", expressLine);
      if (isExpressSelection) {
        setHiddenProp(form, '_estimation_livraison', expressPromiseForVariant(selectedVariant));
      } else {
        removeHiddenProp(form, '_estimation_livraison');
      }

      // Internal attributes for Cart Transform Function pricing override.
      const expressCents = toPositiveInt(selectedVariant.expressPriceCents);
      const baseCents = toPositiveInt(selectedVariant.price);
      const chosenCents = expressCents > 0 ? expressCents : (baseCents > 0 ? baseCents : 0);
      setHiddenProp(form, '_delivery', isExpressSelection ? 'express' : 'standard');
      setHiddenProp(form, '_express_price', isExpressSelection ? String(chosenCents) : '');

      // Stay open and morph to cart view once the cart update succeeds.
      pendingExpressSelection = isExpressSelection;
      pendingCartView = true;
      btnAtc.classList.add('is-loading');
      // Prefill cart-confirmation DOM now so swap is just a class flip.
      cartViewShoeVariant = selectedVariant;
      if (cartViewShoeVariant) {
        if (cartViewVariantEl) cartViewVariantEl.textContent = displayLabel(cartViewShoeVariant);
        if (cartViewPriceEl) cartViewPriceEl.textContent = priceShown(cartViewShoeVariant);
        updateCartDeliverySummary(modal, cartViewShoeVariant, payload, {
          isExpressSelection: pendingExpressSelection,
        });
      }
      if (cartViewTitleEl && payload.productTitle) {
        cartViewTitleEl.textContent = payload.productTitle;
      }
      if (cartViewImageEl && payload.productImage) {
        cartViewImageEl.src = payload.productImage;
        cartViewImageEl.alt = payload.productTitle || '';
      }
      updateSocksPresentation();
      prefetchCartState();
      if (cartViewFallbackTimer) window.clearTimeout(cartViewFallbackTimer);
      cartViewFallbackTimer = window.setTimeout(() => {
        // Fallback: if no cart:updated event arrives (e.g. network failure),
        // restore the size view button so the user can retry.
        pendingCartView = false;
        cartViewFallbackTimer = null;
        btnAtc.classList.remove('is-loading');
      }, 6000);

      const mainBtn = productForm.querySelector('[data-ref="add-to-cart-button"]');
      if (mainBtn instanceof HTMLButtonElement && !mainBtn.disabled) {
        form.requestSubmit(mainBtn);
      } else {
        form.requestSubmit();
      }
      window.setTimeout(() => {
        [
          "Mode d'expédition",
          '_estimation_livraison',
          '_delivery',
          '_express_price',
        ].forEach((key) => removeHiddenProp(form, key));
      }, 0);
    });

    cartCheckoutEl?.addEventListener('click', () => {
      closeModal();
    });

    const protectionVariantId = payload.protectionUpsell?.variantId ? String(payload.protectionUpsell.variantId) : '';
    const signatureVariantId = payload.signature?.variantId ? String(payload.signature.variantId) : '';

    const getCurrentUpsellSizeValue = () =>
      cartViewShoeVariant?.sizeValue
      || selectedVariant?.sizeValue
      || lastChosenSizeValue;

    const getCurrentUpsellResolution = () =>
      resolvePreferredUpsell(payload, getCurrentUpsellSizeValue(), selectedSockVariantId);

    const getSockSizeChoice = () => {
      return getCurrentUpsellResolution()?.choice || { primary: null, alternate: null, hasChoice: false };
    };

    const getSelectedSockVariant = () => {
      const resolution = getCurrentUpsellResolution();
      const product = resolution?.product || resolvedUpsellProduct;
      if (!product) return null;
      if (selectedSockVariantId) {
        return product.variants.find((variant) => String(variant.id) === selectedSockVariantId) || null;
      }
      return resolution?.activeVariant || sockSizeChoice?.primary || null;
    };

    const renderSockSizeOptions = () => {
      sockSizeChoice = getSockSizeChoice();
      if (!socksSizeOptionsEl || !socksSizeOptionsGridEl) return;

      const presentation = presentSocksUpsellInModal(modal, payload, getCurrentUpsellSizeValue(), {
        selectedVariantId: selectedSockVariantId,
        inCart: upsellInCart,
        busy: upsellBusy,
      });

      if (presentation?.activeVariantId && !selectedSockVariantId) {
        selectedSockVariantId = presentation.activeVariantId;
      }

      if (presentation?.choice) sockSizeChoice = presentation.choice;
      resolvedUpsellProduct = presentation?.product || null;
      activeUpsellProductId = resolvedUpsellProduct?.productId ? String(resolvedUpsellProduct.productId) : '';
      resolvedSockVariant = presentation?.activeVariant || getSelectedSockVariant() || null;

      if (cartUpsellToggleEl) {
        cartUpsellToggleEl.setAttribute(
          'aria-label',
          upsellInCart
            ? `Retirer ${resolvedUpsellProduct?.title || 'le produit'}`
            : `Ajouter ${resolvedUpsellProduct?.title || 'le produit'}${resolvedSockVariant?.sizeLabel ? ` (${resolvedSockVariant.sizeLabel})` : ''}`,
        );
      }

      if (!sockSizeChoice?.hasChoice) return;

      socksSizeOptionsGridEl.querySelectorAll('[data-rs-socks-size-option]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          selectedSockVariantId = btn.getAttribute('data-rs-socks-size-option') || '';
          renderSockSizeOptions();
        });
      });
    };

    const updateSocksPresentation = () => {
      renderSockSizeOptions();
    };

    let cartCache = null;
    let cartCacheAt = 0;
    let cartFetchPromise = null;
    const CART_CACHE_MS = 2000;

    const fetchCartState = async ({ force = false } = {}) => {
      const now = Date.now();
      if (!force && cartCache && now - cartCacheAt < CART_CACHE_MS) return cartCache;
      if (!force && cartFetchPromise) return cartFetchPromise;

      cartFetchPromise = fetch(`${window.Theme?.routes?.cart_url || '/cart'}.js`, {
        headers: { Accept: 'application/json' },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((cart) => {
          if (cart) {
            cartCache = cart;
            cartCacheAt = Date.now();
          }
          return cart;
        })
        .finally(() => {
          cartFetchPromise = null;
        });

      return cartFetchPromise;
    };

    const prefetchCartState = () => {
      fetchCartState({ force: false }).catch(() => {});
    };

    const findCartLine = (cart, variantId) => {
      if (!cart?.items || !variantId) return null;
      return cart.items.find((item) => String(item.variant_id) === variantId) || null;
    };

    const matchingCartUpsellVariants = (offer, shoeSizeValue) => {
      const shoeSize = Number.parseFloat(String(shoeSizeValue || '').replace(',', '.'));
      const availableVariants = (offer?.variants || []).filter((variant) => variant.available !== false);
      const rangedVariants = availableVariants
        .map((variant) => ({ variant, range: parseEuSizeRange(variant.sizeLabel) }))
        .filter((entry) => entry.range);
      if (rangedVariants.length === 0) return availableVariants.slice(0, 1);
      if (!Number.isFinite(shoeSize)) return [];
      const inRange = rangedVariants.filter(({ range }) => shoeSize >= range.min && shoeSize <= range.max);
      if (inRange.length === 0) return [];
      // Adjacent ranges share their boundary (34-38 / 38-42): keep the one where
      // the size sits furthest from an edge so a single row is offered.
      const bestFit = inRange.reduce((best, entry) => {
        const margin = Math.min(shoeSize - entry.range.min, entry.range.max - shoeSize);
        return !best || margin > best.margin ? { entry, margin } : best;
      }, null);
      return [bestFit.entry.variant];
    };

    const CART_UPSELL_MAX_ROWS = 6;
    // Survives the re-render triggered by every add/remove so the row keeps
    // showing the option the shopper picked.
    const cartUpsellSelection = new Map();

    const renderCartUpsells = (cart) => {
      if (!cartUpsellsEl) return;
      const shoeSize = getCurrentUpsellSizeValue();
      const seenProductIds = new Set();
      const entries = (payload.cartUpsells || [])
        .flatMap((offer) => matchingCartUpsellVariants(offer, shoeSize).map((variant) => ({ offer, variant })))
        .filter(({ offer }) => {
          const key = String(offer.productId || offer.title);
          if (seenProductIds.has(key)) return false;
          seenProductIds.add(key);
          return true;
        })
        .slice(0, CART_UPSELL_MAX_ROWS);
      cartUpsellsEl.replaceChildren();
      cartUpsellsEl.hidden = entries.length === 0;

      for (const { offer, variant } of entries) {
        const offerKey = String(offer.productId || offer.title);
        const selectableVariants = (offer.variants || []).filter((entry) => entry.available !== false);
        const inCartVariant = selectableVariants.find((entry) => findCartLine(cart, String(entry.id)));
        const rememberedVariant = selectableVariants.find(
          (entry) => String(entry.id) === String(cartUpsellSelection.get(offerKey) || ''),
        );
        let activeVariant = inCartVariant || rememberedVariant || variant;
        const row = document.createElement('div');
        row.className = 'rs-size-modal__cart-upsell';

        const action = document.createElement('div');
        action.className = 'rs-size-modal__cart-upsell-row';

        const media = document.createElement('span');
        media.className = 'rs-size-modal__cart-upsell-media';
        media.setAttribute('aria-hidden', 'true');
        const image = document.createElement('img');
        image.alt = '';
        image.width = 42;
        image.height = 42;
        image.loading = 'lazy';
        media.appendChild(image);

        const info = document.createElement('span');
        info.className = 'rs-size-modal__cart-upsell-info';
        const title = document.createElement('span');
        title.className = 'rs-size-modal__cart-upsell-title';
        title.textContent = offer.title;
        const price = document.createElement('span');
        price.className = 'rs-size-modal__cart-upsell-price';
        const size = document.createElement('span');
        size.className = 'rs-size-modal__cart-upsell-sub';

        const variantSublabel = (entry) => {
          const label = String(entry?.sizeLabel || '').trim();
          if (!label || /^default(\s+(title|size))?$/i.test(label)) return '';
          return parseEuSizeRange(label) ? `Taille ${label}` : label;
        };

        let select = null;
        if (selectableVariants.length > 1) {
          select = document.createElement('select');
          select.className = 'rs-size-modal__cart-upsell-select';
          select.setAttribute('aria-label', `Choisir une option pour ${offer.title}`);
          for (const entry of selectableVariants) {
            const option = document.createElement('option');
            option.value = String(entry.id);
            option.textContent = variantSublabel(entry) || offer.title;
            select.appendChild(option);
          }
          select.value = String(activeVariant.id);
        }

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'rs-size-modal__cart-upsell-add';
        const icon = document.createElement('span');
        icon.className = 'rs-size-modal__cart-upsell-add-icon';
        icon.setAttribute('aria-hidden', 'true');
        addBtn.appendChild(icon);

        let line = null;
        const paintRow = () => {
          line = findCartLine(cart, String(activeVariant.id));
          image.src = activeVariant.image || offer.image || '';
          price.textContent = activeVariant.priceFormatted || '';
          const sublabel = variantSublabel(activeVariant);
          size.textContent = select ? '' : sublabel;
          size.hidden = !size.textContent;
          icon.textContent = line ? '✓' : '+';
          action.classList.toggle('is-added', Boolean(line));
          addBtn.setAttribute('aria-label', line ? `Retirer ${offer.title}` : `Ajouter ${offer.title}`);
        };

        info.append(title, price, size);
        if (select) info.appendChild(select);
        action.append(media, info, addBtn);
        row.appendChild(action);
        cartUpsellsEl.appendChild(row);
        paintRow();

        select?.addEventListener('change', () => {
          const next = selectableVariants.find((entry) => String(entry.id) === select.value);
          if (next) activeVariant = next;
          cartUpsellSelection.set(offerKey, String(activeVariant.id));
          paintRow();
        });

        addBtn.addEventListener('click', async () => {
          if (addBtn.disabled) return;
          addBtn.disabled = true;
          row.classList.add('is-loading');
          try {
            if (line) {
              const res = await fetch(cartChangeUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ id: line.key, quantity: 0 }),
              });
              await parseCartJson(res);
            } else {
              const res = await fetch(cartAddUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ items: [{ id: activeVariant.id, quantity: 1 }] }),
              });
              await parseCartJson(res);
            }
            cartCache = null;
            cartCacheAt = 0;
            const nextCart = await fetchCartState({ force: true });
            renderCartUpsells(nextCart);
            emitCartUpdated('size-modal-cart-upsell');
          } catch (error) {
            document.dispatchEvent(
              new CustomEvent('toast:open', {
                detail: { type: 'error', message: error.message || 'Une erreur est survenue.' },
              }),
            );
          } finally {
            addBtn.disabled = false;
            row.classList.remove('is-loading');
          }
        });
      }
    };

    const setSocksAddedState = (added, lineVariantId = '', { refreshPresentation = true } = {}) => {
      upsellInCart = added;
      cartUpsellRowEl?.classList.toggle('is-added', added);
      if (cartUpsellToggleEl) {
        cartUpsellToggleEl.setAttribute('aria-pressed', added ? 'true' : 'false');
        cartUpsellToggleEl.disabled = false;
        cartUpsellToggleEl.setAttribute(
          'aria-label',
          added
            ? `Retirer ${resolvedUpsellProduct?.title || 'le produit'}`
            : `Ajouter ${resolvedUpsellProduct?.title || 'le produit'}`,
        );
      }
      // Off = + (clear add). On = ✓ (click to remove).
      if (cartUpsellIconEl) cartUpsellIconEl.textContent = added ? '✓' : '+';
      if (added && lineVariantId) {
        selectedSockVariantId = String(lineVariantId);
      }
      if (socksSizeOptionsGridEl) {
        socksSizeOptionsGridEl.querySelectorAll('[data-rs-socks-size-option]').forEach((btn) => {
          btn.disabled = upsellBusy;
        });
      }
      if (refreshPresentation) updateSocksPresentation();
    };

    const setProtectionAddedState = (added) => {
      protectionInCart = added;
      protectionUpsellRowEl?.classList.toggle('is-added', added);
      if (protectionToggleEl) {
        protectionToggleEl.setAttribute('aria-pressed', added ? 'true' : 'false');
        protectionToggleEl.disabled = false;
        protectionToggleEl.setAttribute(
          'aria-label',
          added
            ? 'Retirer la protection du colis'
            : `Ajouter ${payload.protectionUpsell?.title || 'Protection du colis'}`,
        );
      }
      if (protectionIconEl) protectionIconEl.textContent = added ? '✓' : '+';
    };

    const setCartDeliveryMode = (mode) => {
      cartDeliveryMode = mode === 'signature' ? 'signature' : 'standard';
      btnCartStandard?.classList.toggle('is-selected', cartDeliveryMode === 'standard');
      btnCartSignature?.classList.toggle('is-selected', cartDeliveryMode === 'signature');
      btnCartStandard?.setAttribute('aria-checked', cartDeliveryMode === 'standard' ? 'true' : 'false');
      btnCartSignature?.setAttribute('aria-checked', cartDeliveryMode === 'signature' ? 'true' : 'false');
    };

    const applyAddonsFromCart = (cart) => {
      if (!cart) return;
      const productId = activeUpsellProductId || getCurrentUpsellResolution()?.product?.productId || '';
      if (productId && cartUpsellEl) {
        const line = findUpsellProductLine(cart, productId);
        upsellLineKey = line?.key || '';
        setSocksAddedState(!!line, line?.variant_id || '', { refreshPresentation: false });
      }
      if (protectionVariantId && protectionUpsellEl) {
        const line = findCartLine(cart, protectionVariantId);
        protectionLineKey = line?.key || '';
        setProtectionAddedState(!!line);
      }
      if (signatureVariantId && cartDeliveryOptionsEl) {
        const line = findCartLine(cart, signatureVariantId);
        signatureLineKey = line?.key || '';
        signatureInCart = !!line;
        setCartDeliveryMode(signatureInCart ? 'signature' : 'standard');
      }
    };

    const syncSocksFromCart = async () => {
      const cart = await fetchCartState();
      if (!cart) return;
      applyAddonsFromCart(cart);
    };

    const syncProtectionFromCart = async () => {
      const cart = await fetchCartState();
      if (!cart) return;
      applyAddonsFromCart(cart);
    };

    const syncSignatureFromCart = async () => {
      const cart = await fetchCartState();
      if (!cart) return;
      applyAddonsFromCart(cart);
    };

    const syncCartAddonsFromCart = async () => {
      try {
        const cart = await fetchCartState({ force: true });
        applyAddonsFromCart(cart);
        renderCartUpsells(cart);
      } catch (_) {
        /* keep default state */
      }
    };

    const selectCartDelivery = async (mode) => {
      if (!signatureVariantId || !cartDeliveryOptionsEl || signatureBusy) return;
      const nextMode = mode === 'signature' ? 'signature' : 'standard';
      if (nextMode === cartDeliveryMode && nextMode === 'signature' && signatureInCart) return;
      if (nextMode === cartDeliveryMode && nextMode === 'standard' && !signatureInCart) return;

      signatureBusy = true;
      cartDeliveryOptionsEl.classList.add('is-loading');

      try {
        if (nextMode === 'signature' && !signatureInCart) {
          const res = await fetch(window.Theme?.routes?.cart_add_url || '/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ items: [{ id: signatureVariantId, quantity: 1 }] }),
          });
          const data = await res.json();
          if (data.status && data.message) throw new Error(data.description || data.message);
        } else if (nextMode === 'standard' && signatureInCart && signatureLineKey) {
          const res = await fetch(window.Theme?.routes?.cart_change_url || '/cart/change', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ id: signatureLineKey, quantity: 0 }),
          });
          const data = await res.json();
          if (data.status && data.message) throw new Error(data.description || data.message);
        }
        await syncSignatureFromCart();
        document.dispatchEvent(
          new CustomEvent('cart:updated', {
            detail: { data: { source: 'size-modal-signature' } },
          }),
        );
      } catch (err) {
        document.dispatchEvent(
          new CustomEvent('toast:open', {
            detail: { type: 'error', message: err.message || 'Une erreur est survenue.' },
          }),
        );
      } finally {
        signatureBusy = false;
        cartDeliveryOptionsEl.classList.remove('is-loading');
      }
    };

    btnCartStandard?.addEventListener('click', () => {
      selectCartDelivery('standard');
    });

    btnCartSignature?.addEventListener('click', () => {
      if (btnCartSignature?.disabled) return;
      selectCartDelivery('signature');
    });

    const cartChangeUrl = () => {
      const raw = window.Theme?.routes?.cart_change_url || '/cart/change.js';
      return raw.endsWith('.js') ? raw : `${raw}.js`;
    };

    const cartAddUrl = () => window.Theme?.routes?.cart_add_url || '/cart/add.js';

    const parseCartJson = async (res) => {
      const data = await res.json();
      if (!res.ok || (data && data.status && data.message)) {
        throw new Error(data?.description || data?.message || 'Une erreur est survenue.');
      }
      return data;
    };

    const emitCartUpdated = (source) => {
      document.dispatchEvent(
        new CustomEvent('cart:updated', {
          detail: { data: { source } },
        }),
      );
    };

    const uiWantsSocksInCart = () =>
      cartUpsellRowEl?.classList.contains('is-added')
      || cartUpsellToggleEl?.getAttribute('aria-pressed') === 'true';

    const uiWantsProtectionInCart = () =>
      protectionUpsellRowEl?.classList.contains('is-added')
      || protectionToggleEl?.getAttribute('aria-pressed') === 'true';

    const toggleSocks = async () => {
      const productId = activeUpsellProductId || getCurrentUpsellResolution()?.product?.productId || '';
      if (!cartUpsellToggleEl || upsellBusy || !productId) return;

      const wantRemove = uiWantsSocksInCart();
      const targetVariant = getSelectedSockVariant() || getCurrentUpsellResolution()?.activeVariant || null;
      if (!wantRemove && (!targetVariant?.id || targetVariant.available === false)) {
        document.dispatchEvent(
          new CustomEvent('toast:open', {
            detail: { type: 'error', message: 'Taille indisponible.' },
          }),
        );
        return;
      }

      // Optimistic UI — feels instant; rollback on error.
      upsellBusy = true;
      cartUpsellEl?.classList.add('is-loading');
      if (wantRemove) setSocksAddedState(false, '', { refreshPresentation: false });
      else setSocksAddedState(true, targetVariant.id, { refreshPresentation: false });

      try {
        if (wantRemove) {
          let lineKey = upsellLineKey;
          if (!lineKey) {
            const cart = await fetchCartState({ force: true });
            lineKey = findUpsellProductLine(cart, productId)?.key || '';
          }
          if (lineKey) {
            const removeRes = await fetch(cartChangeUrl(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ id: lineKey, quantity: 0 }),
            });
            const cart = await parseCartJson(removeRes);
            if (cart?.items) {
              cartCache = cart;
              cartCacheAt = Date.now();
            }
          }
          upsellLineKey = '';
          emitCartUpdated('size-modal-socks');
          return;
        }

        const res = await fetch(cartAddUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items: [{ id: targetVariant.id, quantity: 1 }] }),
        });
        const data = await parseCartJson(res);
        const addedItem = Array.isArray(data?.items)
          ? data.items.find((item) => String(item.product_id) === String(productId))
          : null;
        upsellLineKey = addedItem?.key || upsellLineKey;
        cartCache = null;
        cartCacheAt = 0;
        emitCartUpdated('size-modal-socks');
      } catch (err) {
        document.dispatchEvent(
          new CustomEvent('toast:open', {
            detail: { type: 'error', message: err.message || 'Une erreur est survenue.' },
          }),
        );
        await syncCartAddonsFromCart();
      } finally {
        upsellBusy = false;
        cartUpsellEl?.classList.remove('is-loading');
        if (cartUpsellToggleEl) cartUpsellToggleEl.disabled = false;
      }
    };

    const toggleProtection = async () => {
      if (!protectionVariantId || !protectionToggleEl || protectionBusy) return;

      const wantRemove = uiWantsProtectionInCart();
      protectionBusy = true;
      protectionUpsellEl?.classList.add('is-loading');
      // Optimistic flip
      setProtectionAddedState(!wantRemove);

      try {
        if (wantRemove) {
          let lineKey = protectionLineKey;
          if (!lineKey) {
            const cart = await fetchCartState({ force: true });
            lineKey = findCartLine(cart, protectionVariantId)?.key || '';
          }
          if (lineKey) {
            const res = await fetch(cartChangeUrl(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ id: lineKey, quantity: 0 }),
            });
            const cart = await parseCartJson(res);
            if (cart?.items) {
              cartCache = cart;
              cartCacheAt = Date.now();
            }
          }
          protectionLineKey = '';
          emitCartUpdated('size-modal-protection');
          return;
        }

        const res = await fetch(cartAddUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items: [{ id: protectionVariantId, quantity: 1 }] }),
        });
        const data = await parseCartJson(res);
        const addedItem = Array.isArray(data?.items)
          ? data.items.find((item) => String(item.variant_id) === String(protectionVariantId))
          : null;
        protectionLineKey = addedItem?.key || protectionLineKey;
        cartCache = null;
        cartCacheAt = 0;
        emitCartUpdated('size-modal-protection');
      } catch (err) {
        document.dispatchEvent(
          new CustomEvent('toast:open', {
            detail: { type: 'error', message: err.message || 'Une erreur est survenue.' },
          }),
        );
        await syncCartAddonsFromCart();
      } finally {
        protectionBusy = false;
        protectionUpsellEl?.classList.remove('is-loading');
        if (protectionToggleEl) protectionToggleEl.disabled = false;
      }
    };

    // Single handler path: button click only (row delegates to button).
    // Avoids double-toggle when disabled/pointer-events re-targets click to the row.
    cartUpsellToggleEl?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSocks();
    });

    cartUpsellRowEl?.addEventListener('click', (event) => {
      if (
        event.target.closest('[data-rs-modal-socks-add]')
        || event.target.closest('[data-rs-socks-size-option]')
      ) return;
      event.preventDefault();
      if (upsellBusy) return;
      cartUpsellToggleEl?.click();
    });

    protectionToggleEl?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleProtection();
    });

    protectionUpsellRowEl?.addEventListener('click', (event) => {
      if (event.target.closest('[data-rs-modal-protection-add]')) return;
      event.preventDefault();
      if (protectionBusy) return;
      protectionToggleEl?.click();
    });

    const swapToCartView = () => {
      const fallbackVariantBySize = lastChosenSizeValue
        ? payload.variants.find((variant) => String(variant.sizeValue) === String(lastChosenSizeValue)) || null
        : null;
      cartViewShoeVariant = selectedVariant || cartViewShoeVariant || fallbackVariantBySize;
      selectedSockVariantId = '';

      // Fill any missing fields (usually already prefilled on ATC click).
      if (cartViewShoeVariant) {
        if (cartViewVariantEl && !cartViewVariantEl.textContent) {
          cartViewVariantEl.textContent = displayLabel(cartViewShoeVariant);
        }
        if (cartViewPriceEl && !cartViewPriceEl.textContent) {
          cartViewPriceEl.textContent = priceShown(cartViewShoeVariant);
        }
        updateCartDeliverySummary(modal, cartViewShoeVariant, payload, {
          isExpressSelection: pendingExpressSelection,
        });
      }
      if (cartViewTitleEl && payload.productTitle && !cartViewTitleEl.textContent) {
        cartViewTitleEl.textContent = payload.productTitle;
      }
      if (cartViewImageEl && payload.productImage && !cartViewImageEl.getAttribute('src')) {
        cartViewImageEl.src = payload.productImage;
        cartViewImageEl.alt = payload.productTitle || '';
      }

      modal.classList.add('is-cart-view');
      btnAtc?.classList.remove('is-loading');

      updateSocksPresentation();
      // One /cart.js round-trip for socks + protection + signature.
      cartCache = null;
      cartCacheAt = 0;
      syncCartAddonsFromCart();
    };

    const handleCartUpdated = (event) => {
      if (!pendingCartView) return;
      const source = event?.detail?.data?.source;
      if (source && source !== 'product-form') return;
      clearCartViewState();
      btnAtc?.classList.remove('is-loading');
      // Only swap view if the modal is still visible.
      if (modal.getAttribute('aria-hidden') === 'false') {
        swapToCartView();
      }
    };

    document.addEventListener('cart:updated', handleCartUpdated);

    dockPrimaryButtons?.forEach((btn) => {
      btn.addEventListener('click', (event) => {
        if (!dockModalId) return;
        event.preventDefault();
        event.stopPropagation();
        registry.get(dockModalId)?.open(btn);
      });
    });

    gridExpandBtn?.addEventListener('click', () => {
      if (!gridExpandable) return;
      gridExpanded = !gridExpanded;
      applyGridExpandedState();
    });

    if (section.dataset.rsDockMounted !== 'true') {
      window.addEventListener('scroll', updateMobileDockVisibility, { passive: true });
      window.addEventListener('resize', updateMobileDockVisibility);
    }

    registry.set(modal.id, {
      open: openModal,
      close: closeModal,
      syncCartAddons: syncCartAddonsFromCart,
      enterCartView: swapToCartView,
    });
    syncSelectionFromForm();
    updateMobileDock();
    if (section.dataset.rsDockMounted !== 'true') {
      finalizeDockBoot(updateMobileDockVisibility);
    } else {
      updateMobileDockVisibility();
    }
  };

  const hydrateModalTemplate = (modalId) => {
    const tpl = document.getElementById(modalId + '-tpl');
    if (!tpl || tpl.tagName !== 'TEMPLATE') return null;
    tpl.parentNode.insertBefore(tpl.content, tpl);
    tpl.remove();
    const modal = document.getElementById(modalId);
    if (modal) mountModal(modal);
    return modal;
  };

  document.querySelectorAll('[data-rs-size-modal][id]').forEach((modal) => mountModal(modal));

  document.addEventListener('click', (e) => {
    const directAtcBtn = e.target.closest('[data-rs-direct-atc]');
    if (directAtcBtn) {
      e.preventDefault();
      e.stopPropagation();
      handleDirectAtc(directAtcBtn);
      return;
    }
    const trigger = e.target.closest('[data-rs-size-modal-open]');
    if (trigger) {
      const modalId = trigger.getAttribute('data-rs-size-modal-open');
      if (modalId && !registry.has(modalId)) hydrateModalTemplate(modalId);
      const ctrl = modalId ? registry.get(modalId) : null;
      if (ctrl) {
        e.preventDefault();
        ctrl.open(trigger);
      }
      return;
    }
    if (e.target.closest('[data-rs-size-modal-close]')) {
      e.preventDefault();
      const modal = e.target.closest('[data-rs-size-modal]');
      const id = modal?.id;
      if (id) registry.get(id)?.close();
      return;
    }
    if (e.target.closest('[data-rs-size-modal-overlay]')) {
      e.preventDefault();
      const modal = e.target.closest('[data-rs-size-modal]');
      const id = modal?.id;
      if (id) registry.get(id)?.close();
    }
  });

  const handleDirectAtc = (btn) => {
    if (btn.classList.contains('is-loading')) return;
    const modalId = btn.getAttribute('data-rs-size-modal-target');
    if (modalId && !registry.has(modalId)) hydrateModalTemplate(modalId);
    const modal = modalId ? document.getElementById(modalId) : null;
    const payload = modal ? getPayload(modal) : null;
    const productForm = modal ? getSectionProductForm(modal) : btn.closest('product-form');
    const form = productForm?.querySelector('form[action$="/cart/add"]');
    if (!form) return;

    const firstAvailable = payload?.variants?.find((v) => v.available);
    if (!firstAvailable) return;

    btn.classList.add('is-loading');
    btn.disabled = true;

    const sections = [];

    fetch(window.Theme?.routes?.cart_add_url || '/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: firstAvailable.id, quantity: 1 }],
        sections: sections.join(','),
      }),
    })
      .then((r) => r.json())
      .then((response) => {
        btn.classList.remove('is-loading');
        btn.disabled = false;

        if (modal) {
          showDirectAtcCartView(modal, payload, firstAvailable);
        }

        const countEl = document.querySelector('[data-ref="cart-count"]');
        const currentCount = countEl ? parseInt(countEl.textContent, 10) || 0 : 0;
        document.dispatchEvent(
          new CustomEvent('cart:updated', {
            detail: { data: { source: 'product-form', sections: response.sections, itemCount: currentCount + 1 } },
          }),
        );
      })
      .catch(() => {
        btn.classList.remove('is-loading');
        btn.disabled = false;
      });
  };

  const showDirectAtcCartView = (modal, payload, variant) => {
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.remove('is-cart-view');
    attachViewportListeners();
    lockBackgroundScroll();

    const cartViewTitleEl = modal.querySelector('[data-rs-modal-cart-title]');
    const cartViewVariantEl = modal.querySelector('[data-rs-modal-cart-variant]');
    const cartViewPriceEl = modal.querySelector('[data-rs-modal-cart-price]');
    const cartViewImageEl = modal.querySelector('[data-rs-modal-cart-image]');

    if (cartViewTitleEl) cartViewTitleEl.textContent = payload.productTitle || '';
    if (cartViewVariantEl) cartViewVariantEl.textContent = variant.sizeValue ? `${variant.sizeValue} EU` : '';
    if (cartViewPriceEl) cartViewPriceEl.textContent = variant.priceFormatted || '';
    if (cartViewImageEl && payload.productImage) {
      cartViewImageEl.src = payload.productImage;
      cartViewImageEl.alt = payload.productTitle || '';
    }
    updateCartDeliverySummary(modal, variant, payload, {
      isExpressSelection: shippingLayout(variant).forceExpress,
    });

    modal.classList.add('is-cart-view');

    // Paint upsell + sync instance line keys so ✓/× toggles can remove.
    const api = registry.get(modal.id);
    presentSocksUpsellInModal(modal, payload, variant.sizeValue);
    if (api?.syncCartAddons) {
      api.syncCartAddons();
      return;
    }

    // Fallback if modal not mounted yet (should be rare).
    const cartUrl = window.Theme?.routes?.cart_url || '/cart';
    fetch(`${cartUrl}.js`, { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((cart) => {
        if (!cart?.items) return;
        const protectionVariantId = payload.protectionUpsell?.variantId;
        const upsellProductId = payload.apparelUpsell?.productId || payload.socksUpsell?.productId;
        if (upsellProductId) {
          const socksLine = findUpsellProductLine(cart, upsellProductId);
          if (socksLine) {
            modal.querySelector('[data-rs-modal-socks-upsell-row]')?.classList.add('is-added');
            const toggle = modal.querySelector('[data-rs-modal-socks-add]');
            const icon = modal.querySelector('[data-rs-modal-socks-add-icon]');
            if (toggle) {
              toggle.setAttribute('aria-pressed', 'true');
              toggle.disabled = false;
            }
            if (icon) icon.textContent = '✓';
            presentSocksUpsellInModal(modal, payload, variant.sizeValue, {
              selectedVariantId: String(socksLine.variant_id),
              inCart: true,
            });
          }
        }
        if (protectionVariantId) {
          const protectionLine = cart.items.find((item) => String(item.variant_id) === String(protectionVariantId));
          if (protectionLine) {
            modal.querySelector('[data-rs-modal-protection-upsell-row]')?.classList.add('is-added');
            const toggle = modal.querySelector('[data-rs-modal-protection-add]');
            const icon = modal.querySelector('[data-rs-modal-protection-add-icon]');
            if (toggle) {
              toggle.setAttribute('aria-pressed', 'true');
              toggle.disabled = false;
            }
            if (icon) icon.textContent = '✓';
          }
        }
      })
      .catch(() => {});
  };

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Let the size guide close first when stacked above the size selector.
    if (document.querySelector('[data-size-modal][aria-hidden="false"]')) return;
    document.querySelectorAll('[data-rs-size-modal][aria-hidden="false"]').forEach((modal) => {
      registry.get(modal.id)?.close();
    });
  });
})();
