(() => {
  const upsellEl = document.querySelector('[data-rs-cart-upsell]');
  if (!upsellEl) return;

  const checkbox = upsellEl.querySelector('.rs-cart__upsell-toggle-input');
  const variantId = upsellEl.dataset.variantId;
  const lineKey = upsellEl.dataset.lineKey || '';
  let inCart = upsellEl.dataset.inCart === 'true';
  let busy = false;

  if (!checkbox || !variantId) return;

  checkbox.addEventListener('change', async () => {
    if (busy) {
      checkbox.checked = inCart;
      return;
    }

    busy = true;
    upsellEl.classList.add('rs-cart__upsell--loading');
    const shouldAdd = checkbox.checked;

    try {
      if (shouldAdd && !inCart) {
        const res = await fetch(Theme.routes.cart_add_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
        });
        const data = await res.json();
        if (data.status && data.message) throw new Error(data.description || data.message);
        inCart = true;
      } else if (!shouldAdd && inCart && lineKey) {
        const res = await fetch(Theme.routes.cart_change_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ id: lineKey, quantity: 0 }),
        });
        const data = await res.json();
        if (data.status && data.message) throw new Error(data.description || data.message);
        inCart = false;
      }
      window.location.reload();
    } catch (err) {
      checkbox.checked = inCart;
      document.dispatchEvent(
        new CustomEvent('toast:open', {
          detail: { type: 'error', message: err.message || 'Une erreur est survenue.' },
        }),
      );
    } finally {
      busy = false;
      upsellEl.classList.remove('rs-cart__upsell--loading');
    }
  });
})();
