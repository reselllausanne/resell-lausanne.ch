(() => {
  if (window.__rsUltimateBundlePdpInit) return;
  window.__rsUltimateBundlePdpInit = true;
  const mountedModalIds = new Set();

  const getPayload = (modalId) => {
    const node = document.getElementById(`${modalId}-payload`);
    if (!node || !node.textContent) return null;
    try {
      return JSON.parse(node.textContent);
    } catch (error) {
      return null;
    }
  };

  const withJs = (url, fallback) => {
    const raw = String(url || fallback);
    return raw.endsWith('.js') ? raw : `${raw}.js`;
  };
  const cartAddUrl = () => withJs(window.Theme?.routes?.cart_add_url, '/cart/add.js');
  const cartJsonUrl = () => withJs(window.Theme?.routes?.cart_url, '/cart.js');

  const findBundleLine = (cart, productId) => {
    if (!cart || !Array.isArray(cart.items)) return null;
    const wantedId = productId != null && productId !== '' ? String(productId) : '';
    return (
      cart.items.find((item) => {
        if (item.properties && item.properties._ultimate_bundle) return true;
        if (wantedId && String(item.product_id) === wantedId) return true;
        return false;
      }) || null
    );
  };

  const flatVariants = (colors) => {
    const preferred = ['XS', 'S', 'M', 'L'];
    const out = [];
    colors.forEach((color) => {
      const variants = Array.isArray(color.variants) ? color.variants : [];
      const filtered = variants.filter((variant) => preferred.includes(String(variant.sizeLabel || '').toUpperCase()));
      (filtered.length ? filtered : variants).forEach((variant) => {
        out.push({
          ...variant,
          colorLabel: color.label || '',
          colorImage: color.image || variant.image || '',
        });
      });
    });
    return out;
  };

  const ensureInRail = (card, rail, preferColorwaysFirst = false) => {
    if (!card || !rail) return;
    if (preferColorwaysFirst) {
      const colorways = rail.querySelectorAll('.rs-size-modal__cart-upsell--colorway');
      if (colorways.length) {
        colorways[colorways.length - 1].after(card);
      } else if (card.parentElement !== rail) {
        rail.appendChild(card);
      }
    } else if (card.parentElement !== rail) {
      rail.prepend(card);
    } else if (rail.firstElementChild !== card) {
      rail.prepend(card);
    }
    rail.hidden = false;
    rail.scrollLeft = 0;
  };

  const mount = (modal) => {
    if (!modal || !modal.id) return;
    if (mountedModalIds.has(modal.id)) return;
    const payload = getPayload(modal.id);
    const bundle = payload?.ultimateBundle;
    const colors = (bundle?.colors || []).filter((color) => Array.isArray(color.variants) && color.variants.length);
    if (!colors.length) return;

    const card = modal.querySelector('[data-rs-modal-ultimate-bundle]');
    const row = modal.querySelector('[data-rs-modal-ultimate-bundle-row]');
    const select = modal.querySelector('[data-rs-modal-ultimate-bundle-select]');
    const imageEl = modal.querySelector('[data-rs-modal-ultimate-bundle-image]');
    const priceEl = modal.querySelector('[data-rs-modal-ultimate-bundle-price]');
    const compareEl = modal.querySelector('[data-rs-modal-ultimate-bundle-compare]');
    const savingsEl = modal.querySelector('[data-rs-modal-ultimate-bundle-savings]');
    const limitedEl = modal.querySelector('[data-rs-modal-ultimate-bundle-limited]');
    const limitedCountEl = modal.querySelector('[data-rs-modal-ultimate-bundle-limited-count]');
    const addBtn = modal.querySelector('[data-rs-modal-ultimate-bundle-add]');
    const addIcon = modal.querySelector('[data-rs-modal-ultimate-bundle-add-icon]');
    const rail = modal.querySelector('[data-rs-modal-cart-upsells]');
    if (!card || !select || !addBtn) return;

    const variants = flatVariants(colors);
    const availableVariants = variants.filter((entry) => entry.available);
    if (!availableVariants.length) {
      card.hidden = true;
      return;
    }

    const preferColorwaysFirst = payload?.upsellContext?.isStreetwearProduct === true
      && Array.isArray(payload?.essentialsColorwayUpsells?.colorways)
      && payload.essentialsColorwayUpsells.colorways.length > 0;

    let selectedVariant = availableVariants[0];
    let busy = false;
    let shown = false;

    const remainingSlots = () => {
      const now = new Date();
      const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
      return 7 + (seed % 8);
    };

    const paintLimited = () => {
      if (!limitedEl || !limitedCountEl) return;
      const count = remainingSlots();
      const template = bundle.messages?.limitedLeft || 'COUNT_PLACEHOLDER left';
      limitedCountEl.textContent = ` ${template.replace('COUNT_PLACEHOLDER', String(count)).replace('{{ count }}', String(count))}`;
    };

    const paint = () => {
      if (!selectedVariant) return;
      if (imageEl) {
        const src = selectedVariant.image || selectedVariant.colorImage || '';
        imageEl.src = src;
        imageEl.alt = selectedVariant.colorLabel || '';
        imageEl.hidden = !src;
      }
      if (priceEl) priceEl.textContent = selectedVariant.priceFormatted || '';
      if (compareEl) {
        compareEl.textContent = selectedVariant.compareAtFormatted || '';
        compareEl.hidden = !selectedVariant.compareAtFormatted;
      }
      if (savingsEl) {
        const savingsLabel = selectedVariant.savingsFormatted || '';
        const template = bundle.messages?.cta || 'Économisez SAVINGS_PLACEHOLDER';
        savingsEl.textContent = savingsLabel
          ? template.replace('SAVINGS_PLACEHOLDER', savingsLabel).replace('{{ savings }}', savingsLabel)
          : '';
        savingsEl.hidden = !savingsEl.textContent;
      }
      if (select.value !== String(selectedVariant.id)) {
        select.value = String(selectedVariant.id);
      }
      addBtn.setAttribute(
        'aria-label',
        `${bundle?.title || 'Pack'} · ${selectedVariant.colorLabel || ''} ${selectedVariant.sizeLabel || ''}`.trim(),
      );
    };

    const fillSelect = () => {
      select.replaceChildren();
      variants.forEach((variant) => {
        const option = document.createElement('option');
        option.value = String(variant.id);
        option.disabled = !variant.available;
        const color = variant.colorLabel || '';
        const size = variant.sizeLabel || '';
        option.textContent = color && size ? `${color} · ${size}` : size || color || variant.priceFormatted || 'Option';
        select.appendChild(option);
      });
      select.value = String(selectedVariant.id);
    };

    const refreshVisibility = async () => {
      const inCartView =
        modal.getAttribute('aria-hidden') !== 'true' && modal.classList.contains('is-cart-view');
      if (!inCartView) {
        shown = false;
        return;
      }

      let line = null;
      try {
        const cartResponse = await fetch(cartJsonUrl(), {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (cartResponse.ok) {
          const cart = await cartResponse.json();
          line = findBundleLine(cart, bundle.productId);
        }
      } catch (error) {
        line = null;
      }

      const inCart = Boolean(line);
      card.hidden = inCart;
      row?.classList.toggle('is-added', inCart);
      if (addIcon) addIcon.textContent = inCart ? '✓' : '+';
      addBtn.setAttribute('aria-pressed', inCart ? 'true' : 'false');
      shown = !inCart;
      if (!inCart) ensureInRail(card, rail, preferColorwaysFirst);
    };

    fillSelect();
    paint();
    paintLimited();
    ensureInRail(card, rail, preferColorwaysFirst);

    select.addEventListener('change', () => {
      const next = variants.find((entry) => String(entry.id) === select.value);
      if (!next || !next.available) return;
      selectedVariant = next;
      paint();
    });

    addBtn.addEventListener('click', async () => {
      if (busy) return;
      if (!selectedVariant?.id || !selectedVariant.available) return;

      busy = true;
      addBtn.disabled = true;
      card.classList.add('is-loading');

      try {
        const properties = {
          ...(bundle.properties || {}),
          _ultimate_bundle_size: String(selectedVariant.sizeLabel || ''),
          _ultimate_bundle_color: String(selectedVariant.colorLabel || ''),
        };
        const res = await fetch(cartAddUrl(), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            items: [{ id: Number(selectedVariant.id), quantity: 1, properties }],
          }),
        });
        const data = await res.json();
        if (!res.ok || (data && data.status)) {
          throw new Error(data?.description || data?.message || bundle.messages?.addError || 'Erreur ajout bundle.');
        }

        document.dispatchEvent(new CustomEvent('cart:updated', { detail: { data: { source: 'ultimate-bundle-pdp' } } }));
        await refreshVisibility();
      } catch (error) {
        document.dispatchEvent(
          new CustomEvent('toast:open', {
            detail: {
              type: 'error',
              message:
                error instanceof TypeError
                  ? bundle.messages?.networkError || 'Connexion panier coupée. Réessaie.'
                  : error?.message || bundle.messages?.addError || 'Erreur ajout bundle.',
            },
          }),
        );
      } finally {
        busy = false;
        addBtn.disabled = false;
        card.classList.remove('is-loading');
      }
    });

    const observer = new MutationObserver(() => {
      refreshVisibility().catch(() => {});
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
    document.addEventListener('cart:updated', () => {
      if (!shown && !modal.classList.contains('is-cart-view')) return;
      refreshVisibility().catch(() => {});
    });
    mountedModalIds.add(modal.id);
    refreshVisibility().catch(() => {});
  };

  const mountByModalId = (modalId) => {
    if (!modalId || mountedModalIds.has(modalId)) return;
    const modal = document.getElementById(modalId);
    if (!modal) return;
    mount(modal);
  };

  const boot = () => {
    document.querySelectorAll('[data-rs-size-modal][id]').forEach((modal) => mount(modal));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-rs-size-modal-open]') : null;
    if (!trigger) return;
    const modalId = trigger.getAttribute('data-rs-size-modal-open') || '';
    if (!modalId) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        mountByModalId(modalId);
      });
    });
  });

  const bodyObserver = new MutationObserver(() => {
    boot();
  });
  bodyObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
