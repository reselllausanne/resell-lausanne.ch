(() => {
  const ROOT_SELECTOR = '[data-rs-ultimate-bundle]';
  const STORAGE_KEY = 'rs_ultimate_bundle_assignment_v1';
  const COOKIE_KEY = 'rs_ultimate_bundle_assignment_v1';
  const SESSION_VIEW_KEY = 'rs_ultimate_bundle_viewed_v1';
  const DAY_MS = 24 * 60 * 60 * 1000;

  const parseJsonFromNode = (node) => {
    if (!node) return null;
    try {
      return JSON.parse(node.textContent || 'null');
    } catch (error) {
      return null;
    }
  };

  const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const formatMoney = (cents) => {
    const amount = Math.max(0, toNumber(cents, 0)) / 100;
    const formatter = new Intl.NumberFormat(document.documentElement.lang || 'fr-CH', {
      style: 'currency',
      currency: (window.Theme && Theme.currency) || 'CHF',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const supportsAnalytics = () => {
    if (!window.Shopify || !window.Shopify.customerPrivacy) return true;
    if (typeof window.Shopify.customerPrivacy.analyticsProcessingAllowed === 'function') {
      return window.Shopify.customerPrivacy.analyticsProcessingAllowed();
    }
    return true;
  };

  const getQueryPreviewMode = () => {
    const url = new URL(window.location.href);
    const preview = (url.searchParams.get('ultimate_bundle_preview') || '').trim().toLowerCase();
    if (preview === 'control') return 'control';
    if (preview === '4990') return 'bundle_4990';
    if (preview === '5990') return 'bundle_5990';
    return '';
  };

  const readCookie = (name) => {
    const chunks = document.cookie.split(';').map((chunk) => chunk.trim());
    const match = chunks.find((chunk) => chunk.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
  };

  const writeCookie = (name, value, days) => {
    const expires = new Date(Date.now() + Math.max(1, days) * DAY_MS).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  };

  const writeStorage = (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {}
  };

  const readStorage = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (error) {
      return '';
    }
  };

  const emitTracking = (root, name, payload = {}) => {
    const trackingEnabled = root.dataset.trackingEnabled === 'true';
    if (!trackingEnabled) return;
    if (!supportsAnalytics()) return;
    if (root.dataset.previewModeActive === 'true') return;

    const eventPayload = {
      ...payload,
      ultimate_bundle_test: root.dataset.testName,
      ultimate_bundle_variant: root.dataset.assignedVariant || 'unknown',
      ultimate_bundle_price: toNumber(root.dataset.activePriceCents) / 100,
      ultimate_bundle_compare_at: toNumber(root.dataset.compareAtCents) / 100,
      ultimate_bundle_savings: toNumber(root.dataset.savingsCents) / 100,
      estimated_cogs: toNumber(root.dataset.estimatedCogs),
      estimated_contribution: toNumber(root.dataset.estimatedContribution),
      preview_mode: root.dataset.previewMode || '',
      cart_token: root.dataset.cartToken || '',
    };

    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: name, ...eventPayload });
    }

    if (window.Shopify && window.Shopify.analytics && typeof window.Shopify.analytics.publish === 'function') {
      window.Shopify.analytics.publish(name, eventPayload);
    }

    if (typeof window.gtag === 'function') {
      window.gtag('event', name, eventPayload);
    }
  };

  const readAssignment = () => {
    const raw = readStorage() || readCookie(COOKIE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.variant || !parsed.expiresAt) return null;
      if (Date.now() > parsed.expiresAt) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  };

  const writeAssignment = (variant, days) => {
    const payload = {
      variant,
      assignedAt: Date.now(),
      expiresAt: Date.now() + Math.max(1, days) * DAY_MS,
    };
    const serialized = JSON.stringify(payload);
    writeStorage(serialized);
    writeCookie(COOKIE_KEY, serialized, days);
    return payload;
  };

  const pickVariant = (allocations) => {
    const buckets = allocations
      .map((entry) => ({ ...entry, pct: Math.max(0, toNumber(entry.pct, 0)) }))
      .filter((entry) => entry.pct > 0);
    if (!buckets.length) return 'control';
    const total = buckets.reduce((sum, entry) => sum + entry.pct, 0);
    let cursor = Math.random() * total;
    for (const bucket of buckets) {
      cursor -= bucket.pct;
      if (cursor <= 0) return bucket.key;
    }
    return buckets[buckets.length - 1].key;
  };

  const normalizeVariantKey = (variant) => {
    if (variant === 'bundle_4990' || variant === 'bundle_5990' || variant === 'control') return variant;
    return 'control';
  };

  const isProtectionLine = (item, protectionProductId) => {
    if (!item) return false;
    if (protectionProductId && String(item.product_id) === String(protectionProductId)) return true;
    const handle = String(item.handle || '').toLowerCase();
    const title = String(item.product_title || item.title || '').toLowerCase();
    return handle.includes('protection') || title.includes('protection');
  };

  const containsUltimateBundle = (item, bundleIds) => {
    if (!item) return false;
    if (bundleIds.includes(String(item.product_id))) return true;
    const props = item.properties || {};
    return Boolean(props._ultimate_bundle);
  };

  const getEligibleSubtotal = (cart, config) => {
    if (!cart || !Array.isArray(cart.items)) return 0;
    return cart.items.reduce((sum, item) => {
      if (containsUltimateBundle(item, config.bundleIds)) return sum;
      if (item.gift_card) return sum;
      if (isProtectionLine(item, config.protectionProductId)) return sum;
      return sum + toNumber(item.final_line_price, 0);
    }, 0);
  };

  const getActiveProduct = (root, products) => {
    const variant = root.dataset.assignedVariant;
    if (variant === 'bundle_5990') return products.bundle_5990 || null;
    return products.bundle_4990 || null;
  };

  const findBundleVariantInCart = (cart, config) => {
    if (!cart || !Array.isArray(cart.items)) return null;
    return cart.items.find((item) => containsUltimateBundle(item, config.bundleIds)) || null;
  };

  const buildSizeMap = (product) => {
    const map = [];
    if (!product || !Array.isArray(product.variants)) return map;
    const preferredSizes = new Set(['XS', 'S', 'M', 'L']);
    const seen = new Set();

    const pushVariant = (variant) => {
      const color = String(variant.option1 || '').trim();
      const size = String(variant.option2 || '').trim();
      // Color then Size → flat "Color · Size" (same as modal select).
      const label = size
        ? color
          ? `${color} · ${size}`
          : size
        : color || String(variant.title || '').trim();
      if (!label || seen.has(label)) return;
      seen.add(label);
      map.push({
        label,
        id: variant.id,
        available: Boolean(variant.available),
        price: toNumber(variant.price, 0),
        compareAtPrice: toNumber(variant.compare_at_price, 0),
        colorLabel: color,
        sizeLabel: size || label,
      });
    };

    const hasOption2 = product.variants.some((variant) => String(variant.option2 || '').trim());
    if (hasOption2) {
      const preferred = product.variants.filter((variant) =>
        preferredSizes.has(String(variant.option2 || '').trim().toUpperCase()),
      );
      (preferred.length ? preferred : product.variants).forEach(pushVariant);
      return map;
    }

    product.variants.forEach(pushVariant);
    return map;
  };

  const setFeedback = (root, message, isError = false) => {
    const feedback = root.querySelector('[data-rs-ub-feedback]');
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.classList.toggle('hidden', !message);
    feedback.classList.toggle('is-error', Boolean(message && isError));
    feedback.classList.toggle('is-success', Boolean(message && !isError));
  };

  const refreshCartSection = async () => {
    const response = await fetch(window.location.href, { credentials: 'same-origin' });
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const incoming = doc.querySelector('cart-component');
    const current = document.querySelector('cart-component');
    if (!incoming || !current) return;
    current.replaceWith(incoming);
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { data: {} } }));
  };

  const updateCartAttributes = async (payload) => {
    const body = JSON.stringify({ attributes: payload });
    await fetch(Theme.routes.cart_update_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });
  };

  const computeEstimatedContribution = (root) => {
    const gross = toNumber(root.dataset.activePriceCents) / 100;
    const vatPct = toNumber(root.dataset.estimatedVatPercent) / 100;
    const feePct = toNumber(root.dataset.estimatedFeesPercent) / 100;
    const cogs = toNumber(root.dataset.estimatedCogs);
    const shipping = toNumber(root.dataset.estimatedShipping);
    const netBeforeVat = gross / (1 + vatPct);
    const fees = gross * feePct;
    return Number((netBeforeVat - fees - cogs - shipping).toFixed(2));
  };

  const bindCheckoutGuard = (root, config, translations) => {
    document.querySelectorAll('[data-ref="checkout-button"]').forEach((button) => {
      if (button.dataset.rsUbBound === 'true') return;
      button.dataset.rsUbBound = 'true';
      button.addEventListener('click', async (event) => {
        const cartResponse = await fetch(`${Theme.routes.cart_url}.js`, { credentials: 'same-origin' });
        const cart = await cartResponse.json();
        const bundleLine = findBundleVariantInCart(cart, config);
        if (!bundleLine) return;

        const eligibleSubtotal = getEligibleSubtotal(cart, config);
        if (eligibleSubtotal >= config.thresholdCents) {
          emitTracking(root, 'ultimate_bundle_checkout_started', {
            size: bundleLine.variant_title || '',
            cart_subtotal_before: cart.items_subtotal_price / 100,
          });
          return;
        }

        event.preventDefault();
        const shouldRemove = window.confirm(
          translations.bundle_threshold_confirm || 'Le bundle n’est plus éligible. Le retirer du panier ?'
        );
        if (!shouldRemove) return;

        await fetch(Theme.routes.cart_change_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ id: bundleLine.key, quantity: 0 }),
        });

        emitTracking(root, 'ultimate_bundle_removed', {
          reason: 'threshold_below',
          size: bundleLine.variant_title || '',
        });

        setFeedback(root, translations.bundle_removed_for_threshold || 'Bundle retiré: seuil non atteint.');
        await refreshCartSection();
      });
    });
  };

  const bindBundleRemoveTracking = (root) => {
    document.querySelectorAll('cart-item[data-is-ultimate-bundle="true"] [data-ref="remove-item"]').forEach((button) => {
      if (button.dataset.rsUbRemoveBound === 'true') return;
      button.dataset.rsUbRemoveBound = 'true';
      button.addEventListener('click', () => {
        emitTracking(root, 'ultimate_bundle_removed', { reason: 'manual_remove' });
      });
    });
  };

  const initCard = async (root) => {
    if (root.dataset.rsUbInit === 'true') return;
    root.dataset.rsUbInit = 'true';

    const product4990 = parseJsonFromNode(root.querySelector('[data-rs-ub-product-4990]'));
    const product5990 = parseJsonFromNode(root.querySelector('[data-rs-ub-product-5990]'));
    const translations = parseJsonFromNode(root.querySelector('[data-rs-ub-translations]')) || {};

    const products = {
      bundle_4990: product4990,
      bundle_5990: product5990,
    };

    const previewParam = getQueryPreviewMode();
    const forcedPreview = (root.dataset.forcePreview || '').trim().toLowerCase();
    const previewMode = previewParam || (forcedPreview ? normalizeVariantKey(`bundle_${forcedPreview}`) : '');
    const previewActive = Boolean(previewParam || forcedPreview);
    root.dataset.previewMode = previewMode;
    root.dataset.previewModeActive = previewActive ? 'true' : 'false';

    const config = {
      thresholdCents: toNumber(root.dataset.thresholdCents, 1500),
      controlPercent: toNumber(root.dataset.controlPercent, 20),
      bundle4990Percent: toNumber(root.dataset.bundle4990Percent, 80),
      bundle5990Percent: toNumber(root.dataset.bundle5990Percent, 0),
      persistenceDays: Math.max(1, toNumber(root.dataset.persistenceDays, 30)),
      protectionProductId: String(root.dataset.protectionProductId || ''),
      bundleIds: [root.dataset.bundleProductId4990, root.dataset.bundleProductId5990].filter(Boolean).map(String),
    };

    const cartResponse = await fetch(`${Theme.routes.cart_url}.js`, { credentials: 'same-origin' });
    const cart = await cartResponse.json();
    root.dataset.cartToken = cart.token || '';

    const eligibleSubtotal = getEligibleSubtotal(cart, config);
    const bundleInCart = findBundleVariantInCart(cart, config);

    let assignment;
    if (previewActive) {
      assignment = { variant: previewMode || 'control' };
    } else {
      assignment = readAssignment();
      if (!assignment && eligibleSubtotal >= config.thresholdCents) {
        assignment = writeAssignment(
          pickVariant([
            { key: 'control', pct: config.controlPercent },
            { key: 'bundle_4990', pct: config.bundle4990Percent },
            { key: 'bundle_5990', pct: config.bundle5990Percent },
          ]),
          config.persistenceDays
        );
        emitTracking(root, 'ultimate_bundle_assigned', { assigned_variant: assignment.variant });
      }
    }

    const assignedVariant = normalizeVariantKey(assignment?.variant || 'control');
    root.dataset.assignedVariant = assignedVariant;

    if (!previewActive && assignment && eligibleSubtotal >= config.thresholdCents) {
      updateCartAttributes({
        ultimate_bundle_test: root.dataset.testName || 'ultimate_bundle_v1',
        ultimate_bundle_variant: assignedVariant === 'control' ? 'control' : assignedVariant.replace('bundle_', 'bundle_'),
      }).catch(() => {});
    }

    const activeProduct = getActiveProduct(root, products);
    const sizeMap = buildSizeMap(activeProduct);
    const hasAvailableSize = sizeMap.some((entry) => entry.available);
    const shouldDisplay =
      eligibleSubtotal >= config.thresholdCents && !bundleInCart && assignedVariant !== 'control' && hasAvailableSize;

    if (!shouldDisplay) {
      root.classList.add('hidden');
      bindCheckoutGuard(root, config, translations);
      bindBundleRemoveTracking(root);
      return;
    }

    root.classList.remove('hidden');
    emitTracking(root, 'ultimate_bundle_eligible', {
      cart_subtotal_before: cart.items_subtotal_price / 100,
      eligible_subtotal: eligibleSubtotal / 100,
    });

    const sizeContainer = root.querySelector('[data-rs-ub-size-options]');
    const cta = root.querySelector('[data-rs-ub-cta]');
    const priceEl = root.querySelector('[data-rs-ub-price]');
    const compareEl = root.querySelector('[data-rs-ub-compare]');
    const savingsEl = root.querySelector('[data-rs-ub-savings]');
    if (!sizeContainer || !cta || !priceEl || !compareEl || !savingsEl) return;
    if (root.dataset.rsUbBound === '1') return;
    root.dataset.rsUbBound = '1';

    const renderPrice = (variantData) => {
      const activePrice = toNumber(variantData?.price, 0);
      const savingsMoney = formatMoney(toNumber(root.dataset.savingsCents));
      root.dataset.activePriceCents = String(activePrice);
      root.dataset.estimatedContribution = String(computeEstimatedContribution(root));
      priceEl.textContent = formatMoney(activePrice);
      compareEl.textContent = formatMoney(toNumber(root.dataset.compareAtCents));
      savingsEl.textContent = (translations.savings || 'Économisez {{ savings }}').replace(
        '{{ savings }}',
        savingsMoney,
      );
      if (translations.cta) {
        cta.textContent = translations.cta.replace('{{ savings }}', savingsMoney);
      }
    };

    let selectedSize = '';
    let selectedVariant = null;

    sizeContainer.replaceChildren();
    sizeMap.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rs-cart__ultimate-bundle-size-button';
      button.textContent = entry.label;
      button.disabled = !entry.available;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (!entry.available) return;
        selectedSize = entry.label;
        selectedVariant = entry;
        sizeContainer.querySelectorAll('button').forEach((node) => {
          node.classList.remove('is-active');
          node.setAttribute('aria-pressed', 'false');
        });
        button.classList.add('is-active');
        button.setAttribute('aria-pressed', 'true');
        renderPrice(entry);
        emitTracking(root, 'ultimate_bundle_size_selected', {
          size: selectedSize,
          cart_subtotal_before: cart.items_subtotal_price / 100,
        });
      });
      sizeContainer.appendChild(button);
    });

    renderPrice(sizeMap.find((entry) => entry.available) || sizeMap[0] || null);

    if (!sessionStorage.getItem(SESSION_VIEW_KEY)) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            emitTracking(root, 'ultimate_bundle_view', {
              cart_subtotal_before: cart.items_subtotal_price / 100,
              eligible_subtotal: eligibleSubtotal / 100,
            });
            sessionStorage.setItem(SESSION_VIEW_KEY, '1');
            observer.disconnect();
          });
        },
        { threshold: 0.5 }
      );
      observer.observe(root);
    }

    let pending = false;
    cta.addEventListener('click', async () => {
      if (pending) return;
      if (!selectedVariant || !selectedSize) {
        setFeedback(root, translations.select_size_error || 'Choisissez une taille.', true);
        return;
      }

      pending = true;
      cta.disabled = true;
      cta.classList.add('is-loading');
      emitTracking(root, 'ultimate_bundle_add_clicked', {
        size: selectedSize,
        cart_subtotal_before: cart.items_subtotal_price / 100,
      });

      try {
        const addResponse = await fetch(Theme.routes.cart_add_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            items: [
              {
                id: selectedVariant.id,
                quantity: 1,
                properties: {
                  _ultimate_bundle: true,
                  _ultimate_bundle_test: root.dataset.testName || 'ultimate_bundle_v1',
                  _ultimate_bundle_variant: root.dataset.assignedVariant || 'bundle_4990',
                  _ultimate_bundle_size: selectedVariant.sizeLabel || selectedSize,
                  _ultimate_bundle_color: selectedVariant.colorLabel || '',
                },
              },
            ],
          }),
        });
        const addData = await addResponse.json();
        if (!addResponse.ok || addData.status) {
          throw new Error(addData.description || addData.message || translations.generic_add_error || 'Erreur ajout panier.');
        }

        const cartAfterResponse = await fetch(`${Theme.routes.cart_url}.js`, { credentials: 'same-origin' });
        const cartAfter = await cartAfterResponse.json();
        emitTracking(root, 'ultimate_bundle_added', {
          size: selectedSize,
          cart_subtotal_before: cart.items_subtotal_price / 100,
          cart_subtotal_after: toNumber(cartAfter.items_subtotal_price, 0) / 100,
        });
        setFeedback(root, translations.added || 'Ultimate Bundle ajouté !', false);
        await refreshCartSection();
      } catch (error) {
        const message = error instanceof Error ? error.message : translations.generic_add_error || 'Erreur ajout panier.';
        setFeedback(root, message, true);
        emitTracking(root, 'ultimate_bundle_add_failed', {
          size: selectedSize || '',
          error_message: message,
        });
      } finally {
        pending = false;
        cta.disabled = false;
        cta.classList.remove('is-loading');
      }
    });

    bindCheckoutGuard(root, config, translations);
    bindBundleRemoveTracking(root);
  };

  const boot = () => {
    document.querySelectorAll(ROOT_SELECTOR).forEach((root) => {
      initCard(root).catch((error) => {
        console.error('[ultimate-bundle] init failed', error);
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', boot);
  // refreshCartSection() replaces <cart-component>; re-bind on the new root.
  document.addEventListener('cart:updated', boot);
})();
