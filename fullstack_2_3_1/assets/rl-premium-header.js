/** Premium desktop header: cart badge sync + add-to-cart redirect to /cart. */
(function () {
  if (window.__rlPremiumHeaderBound) return;
  window.__rlPremiumHeaderBound = true;

  function getAddToCartBehavior() {
    return document.querySelector('[data-add-to-cart-behavior]')?.dataset.addToCartBehavior || 'open_cart';
  }

  function updateCartBadges(count) {
    if (count == null) return;

    document.querySelectorAll('[data-rl-cart-badge], [data-rl-cart-count], [data-ref="cart-count"]').forEach((el) => {
      el.textContent = String(count);
    });

    document.querySelectorAll('.rs-cart-bubble, .rl-mobile-floating-nav__badge').forEach((bubble) => {
      bubble.classList.toggle('rs-cart-bubble--hidden', count === 0);
    });

    document.querySelectorAll('[data-rl-cart-badge]').forEach((badge) => {
      badge.classList.toggle('rl-cart-badge--hidden', count === 0);
    });
  }

  document.addEventListener('cart:updated', (event) => {
    const count =
      event.detail && event.detail.data && event.detail.data.itemCount != null
        ? event.detail.data.itemCount
        : null;
    updateCartBadges(count);

    if (getAddToCartBehavior() !== 'open_cart') return;
    const sizeModalOpen = document.querySelector('[data-rs-size-modal][aria-hidden="false"]');
    if (sizeModalOpen) return;
    const cartUrl = typeof Theme !== 'undefined' && Theme.routes ? Theme.routes.cart_url || '/cart' : '/cart';
    window.location.href = cartUrl;
  });

  function eventTargetElement(event) {
    const target = event && event.target;
    if (target instanceof Element) return target;
    if (target && target.parentElement instanceof Element) return target.parentElement;
    return null;
  }

  document.addEventListener('click', (event) => {
    const clickTarget = eventTargetElement(event);
    const btn = clickTarget ? clickTarget.closest('.rl-desktop-header [data-rl-action]') : null;
    if (!btn) return;

    const action = btn.getAttribute('data-rl-action');
    if (action === 'wishlist') {
      const drawer = document.querySelector('[data-ref="wishlist-drawer"]');
      if (drawer && drawer.open) {
        drawer.open();
      } else {
        window.location.href =
          btn.getAttribute('data-rl-wishlist-url') ||
          document.body.dataset.rlWishlistUrl ||
          '/pages/liste-de-souhaits';
      }
    }
  });
})();
