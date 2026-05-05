(() => {
  if (window.__rsSizeSelectionModalInit) return;
  window.__rsSizeSelectionModalInit = true;

  const OPEN_BODY_CLASS = 'rs-size-modal-open';

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

  const formatIsoDate = (isoDate) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  };

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

  const shippingLayout = (v) => {
    const g = (v.shippingGroup || '').toLowerCase();
    const exp = !!v.expressAvailable;
    const samePrice = exp && Number(v.expressPriceCents) === Number(v.price);
    let showStandard = true;
    let showExpress = exp && g !== 'standard';
    if (g === 'express') {
      showStandard = false;
      showExpress = exp;
    }
    if (samePrice && exp) {
      showStandard = false;
      showExpress = g === 'standard' ? false : true;
    }
    if (!exp || g === 'standard') showExpress = false;
    if (!showStandard && !showExpress) showStandard = true;
    const forceExpress = (g === 'express' || samePrice) && showExpress;
    return { showStandard, showExpress, forceExpress };
  };

  /** @type {Map<string, { open: (trigger: Element | null) => void; close: () => void }>} */
  const registry = new Map();

  const mountModal = (modal) => {
    const payload = getPayload(modal);
    if (!payload) return;

    const section = modal.closest('.shopify-section-product-section');
    const productForm = getSectionProductForm(modal);
    const form = productForm?.querySelector('form[action$="/cart/add"]');
    const picker = getVariantPicker(productForm);
    if (!productForm || !form || !picker) return;

    const grid = modal.querySelector('[data-rs-size-grid]');
    const btnAtc = modal.querySelector('[data-rs-modal-atc]');
    const btnStandard = modal.querySelector('[data-rs-ship="standard"]');
    const btnExpress = modal.querySelector('[data-rs-ship="express"]');
    const expressBadgeTop = modal.querySelector('[data-rs-express-badge]');
    const stdPromiseEl = modal.querySelector('[data-rs-ship-standard-promise]');
    const expPromiseEl = modal.querySelector('[data-rs-ship-express-promise]');
    const stdPriceEl = modal.querySelector('[data-rs-ship-standard-price]');
    const expPriceEl = modal.querySelector('[data-rs-ship-express-price]');
    const expShipBadge = modal.querySelector('[data-rs-ship-express-badge]');
    const pdpDeliveryStandard = section?.querySelector('[data-rs-pdp-delivery-standard]');
    const pdpDeliveryExpress = section?.querySelector('[data-rs-pdp-delivery-express]');
    const mobileDock = section?.querySelector('[data-rs-mobile-dock]');
    const dockPriceEl = mobileDock?.querySelector('[data-rs-mobile-dock-price]');
    const dockSizeEl = mobileDock?.querySelector('[data-rs-mobile-dock-size]');
    const dockAtc = mobileDock?.querySelector('[data-rs-mobile-dock-atc]');
    const unitEu = modal.querySelector('[data-rs-size-unit="eu"]');
    const unitUs = modal.querySelector('[data-rs-size-unit="us"]');

    let currentUnit = 'eu';
    let shipMode = 'standard';
    let selectedVariant = null;
    let pendingVariantSync = false;
    let lastFocused = null;

    const anyUs = payload.variants.some((v) => v.usSize && String(v.usSize).trim() !== '');
    if (unitUs) {
      unitUs.disabled = !anyUs;
      if (!anyUs) unitUs.setAttribute('aria-disabled', 'true');
    }

    const closeModal = () => {
      modal.setAttribute('aria-hidden', 'true');
      if (!document.querySelector('[data-rs-size-modal][aria-hidden="false"]')) {
        document.body.classList.remove(OPEN_BODY_CLASS);
      }
      if (lastFocused instanceof HTMLElement) lastFocused.focus();
    };

    const openModal = (trigger) => {
      lastFocused = trigger instanceof HTMLElement ? trigger : null;
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add(OPEN_BODY_CLASS);
      refreshGrid();
      syncSelectionFromForm();
      (unitEu || btnAtc)?.focus();
    };

    const displayLabel = (v) => {
      if (currentUnit === 'us' && v.usSize && String(v.usSize).trim() !== '') return `${v.usSize} US`;
      return `${v.sizeValue} EU`;
    };

    // Wethenew-style card pricing: size cards keep base (standard) price.
    const priceShown = (v) => v.priceFormatted;

    const sizeCardAriaLabel = (v) => {
      const label = displayLabel(v);
      if (!v.available) return `${label}, unavailable`;
      return `${label}, ${priceShown(v)}`;
    };

    const setCardPriceSlot = (slot, v) => {
      if (!slot) return;
      slot.textContent = '';
      const one = document.createElement('span');
      one.className = 'rs-size-modal__size-price';
      one.textContent = priceShown(v);
      slot.appendChild(one);
    };

    const expressBadgeText = (v) => {
      const exactDateLabel = formatIsoDate(v.expressExactDate);
      if (exactDateLabel) return exactDateLabel;
      return v.expressLabel || '48h';
    };

    const expressPromiseText = (v) => {
      const exactDateLabel = formatIsoDate(v.expressExactDate);
      if (exactDateLabel) return `Delivery on ${exactDateLabel}`;
      return `Delivery in ${v.expressLabel || '48h'}`;
    };

    const expressPdpText = (v) => {
      const exactDateLabel = formatIsoDate(v.expressExactDate);
      if (exactDateLabel) return `Express on ${exactDateLabel}`;
      return `Express ${v.expressLabel || '48h'}`;
    };

    const updatePdpDeliveryPromise = (variant, layout) => {
      if (!variant) return;
      if (pdpDeliveryStandard) {
        const min = variant.standardMin ?? 5;
        const max = variant.standardMax ?? 10;
        pdpDeliveryStandard.textContent = `${min}-${max} working days`;
      }
      if (pdpDeliveryExpress) {
        const showExpress = !!layout?.showExpress;
        pdpDeliveryExpress.hidden = !showExpress;
        if (showExpress) {
          pdpDeliveryExpress.textContent = expressPdpText(variant);
        }
      }
    };

    const syncDeliveryEstimationBlocks = (variant) => {
      if (!variant || !section) return;
      const min = Number(variant.standardMin ?? 5);
      const max = Number(variant.standardMax ?? 10);
      section.querySelectorAll('delivery-estimation').forEach((deliveryEl) => {
        deliveryEl.dispatchEvent(
          new CustomEvent('delivery-estimation:update', {
            detail: { standardMin: min, standardMax: max },
          }),
        );
      });
    };

    const updateShippingCards = () => {
      if (!selectedVariant) {
        btnStandard?.classList.add('is-selected');
        btnExpress?.classList.remove('is-selected');
        btnExpress?.setAttribute('aria-checked', 'false');
        btnStandard?.setAttribute('aria-checked', 'true');
        if (pdpDeliveryExpress) pdpDeliveryExpress.hidden = true;
        return;
      }
      const layout = shippingLayout(selectedVariant);
      const { showStandard, showExpress, forceExpress } = layout;
      if (btnStandard) btnStandard.hidden = !showStandard;
      if (btnExpress) btnExpress.hidden = !showExpress;
      const cardsWrap = modal.querySelector('.rs-size-modal__shipping-cards');
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

      const min = selectedVariant.standardMin ?? 5;
      const max = selectedVariant.standardMax ?? 10;
      if (stdPromiseEl) stdPromiseEl.textContent = `${min} to ${max} working days`;
      if (expPromiseEl) {
        expPromiseEl.textContent = expressPromiseText(selectedVariant);
      }
      if (stdPriceEl) stdPriceEl.textContent = selectedVariant.priceFormatted;
      if (expPriceEl) expPriceEl.textContent = selectedVariant.expressPriceFormatted || selectedVariant.priceFormatted;
      if (expShipBadge) expShipBadge.textContent = expressBadgeText(selectedVariant);

      if (expressBadgeTop) {
        const showTop = showExpress;
        expressBadgeTop.hidden = !showTop;
        expressBadgeTop.textContent = expressBadgeText(selectedVariant);
      }

      updatePdpDeliveryPromise(selectedVariant, layout);
      syncDeliveryEstimationBlocks(selectedVariant);
    };

    const updateModalAtcState = () => {
      const mainBtn = productForm.querySelector('[data-ref="add-to-cart-button"]');
      const mainDisabled = mainBtn?.disabled;
      const ok = selectedVariant && selectedVariant.available && !mainDisabled && !pendingVariantSync;
      if (btnAtc) btnAtc.disabled = !ok;
      if (dockAtc) dockAtc.disabled = !ok;
    };

    const updateMobileDock = () => {
      if (!mobileDock || !selectedVariant) return;
      if (dockPriceEl) {
        const activePrice =
          shipMode === 'express' && selectedVariant.expressAvailable
            ? selectedVariant.expressPriceFormatted || selectedVariant.priceFormatted
            : selectedVariant.priceFormatted;
        dockPriceEl.textContent = activePrice;
      }
      if (dockSizeEl) {
        dockSizeEl.textContent = displayLabel(selectedVariant);
      }
    };

    const highlightSelectedCard = () => {
      if (!grid || !selectedVariant) return;
      const id = String(selectedVariant.id);
      grid.querySelectorAll('[data-rs-size-card]').forEach((el) => {
        el.classList.toggle('is-selected', el.getAttribute('data-variant-id') === id);
        el.setAttribute('aria-selected', el.getAttribute('data-variant-id') === id ? 'true' : 'false');
      });
    };

    const syncSelectionFromForm = () => {
      const id = getFormVariantId(form);
      selectedVariant = findVariantById(payload.variants, id) || selectedVariant;
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

      for (const v of list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'rs-size-modal__size-card';
        b.setAttribute('data-rs-size-card', '');
        b.setAttribute('data-variant-id', String(v.id));
        b.setAttribute('role', 'option');
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

        if (v.expressAvailable) {
          const dot = document.createElement('span');
          dot.className = 'rs-size-modal__size-dot';
          dot.setAttribute('aria-hidden', 'true');
          b.appendChild(dot);
        }

        b.addEventListener('click', () => {
          if (!v.available) return;
          pendingVariantSync = true;
          updateModalAtcState();
          const ok = setNativeSize(picker, payload.sizeOptionName, v.sizeValue);
          if (!ok) {
            pendingVariantSync = false;
            updateModalAtcState();
            return;
          }
          const onUpdated = () => {
            pendingVariantSync = false;
            selectedVariant = findVariantById(payload.variants, getFormVariantId(form)) || v;
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
      currentUnit = 'eu';
      unitEu.classList.add('is-active');
      unitUs?.classList.remove('is-active');
      unitEu.setAttribute('aria-pressed', 'true');
      unitUs?.setAttribute('aria-pressed', 'false');
      refreshGrid();
      highlightSelectedCard();
    });

    unitUs?.addEventListener('click', () => {
      if (unitUs?.disabled) return;
      currentUnit = 'us';
      unitUs.classList.add('is-active');
      unitEu?.classList.remove('is-active');
      unitUs.setAttribute('aria-pressed', 'true');
      unitEu?.setAttribute('aria-pressed', 'false');
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
      const isExpressSelection = shipMode === 'express' && selectedVariant.expressAvailable;
      const expressLine =
        isExpressSelection
          ? expressPdpText(selectedVariant)
          : 'Standard';
      setHiddenProp(form, 'Shipping option', expressLine);

      // Internal attributes for Cart Transform Function pricing override.
      const expressCents = toPositiveInt(selectedVariant.expressPriceCents);
      const baseCents = toPositiveInt(selectedVariant.price);
      const chosenCents = expressCents > 0 ? expressCents : (baseCents > 0 ? baseCents : 0);
      setHiddenProp(form, '_delivery', isExpressSelection ? 'express' : 'standard');
      setHiddenProp(form, '_express_price', isExpressSelection ? String(chosenCents) : '');

      let src =
        isExpressSelection && selectedVariant.expressPriceCents !== selectedVariant.price
          ? 'variant metafield'
          : 'variant base price';
      setHiddenProp(form, 'Express price source', src);

      const mainBtn = productForm.querySelector('[data-ref="add-to-cart-button"]');
      if (mainBtn instanceof HTMLButtonElement) {
        form.requestSubmit(mainBtn);
      } else {
        form.requestSubmit();
      }
      window.setTimeout(() => {
        [
          'Shipping option',
          '_delivery',
          '_express_price',
          'Express price source',
        ].forEach((key) => removeHiddenProp(form, key));
      }, 0);
      closeModal();
    });

    dockAtc?.addEventListener('click', () => {
      const mainBtn = productForm.querySelector('[data-ref="add-to-cart-button"]');
      if (mainBtn instanceof HTMLButtonElement) {
        mainBtn.click();
        return;
      }
      if (selectedVariant && !dockAtc.disabled) {
        form.requestSubmit();
      }
    });

    modal.querySelector('[data-size-modal-open]')?.addEventListener(
      'click',
      () => {
        closeModal();
      },
      { capture: true },
    );

    registry.set(modal.id, { open: openModal, close: closeModal });
    syncSelectionFromForm();
    updateMobileDock();
  };

  document.querySelectorAll('[data-rs-size-modal][id]').forEach((modal) => mountModal(modal));

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-rs-size-modal-open]');
    if (trigger) {
      const modalId = trigger.getAttribute('data-rs-size-modal-open');
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

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('[data-rs-size-modal][aria-hidden="false"]').forEach((modal) => {
      registry.get(modal.id)?.close();
    });
  });
})();
