class CartComponent extends HTMLElement {
  constructor() {
    super();
    this.checkoutButtons = [];
    this.checkoutClickHandler = (event) => this.#handleCheckoutButtonClick(event);
  }

  connectedCallback() {
    this.checkoutButtons = Array.from(document.querySelectorAll('[data-ref="checkout-button"]'));
    this.checkoutButtons.forEach((button) => {
      button.addEventListener('click', this.checkoutClickHandler);
    });
  }

  disconnectedCallback() {
    this.checkoutButtons.forEach((button) => {
      button.removeEventListener('click', this.checkoutClickHandler);
    });
  }

  #handleCheckoutButtonClick(event) {
    document.querySelectorAll('[data-ref="checkout-button"]').forEach((button) => {
      button.classList.add('is-loading');
    });
  }
}

if (!customElements.get('cart-component')) {
  customElements.define('cart-component', CartComponent);
}

class CartItem extends HTMLElement {
  constructor() {
    super();

    this.removeItemButton = null;
    this.quantitySelectorInput = null;
    this.cartForm = null;
  }

  connectedCallback() {
    this.removeItemButton = this.querySelector('[data-ref="remove-item"]');
    this.quantitySelectorInput = this.querySelector('[data-ref="quantity-selector-input"]');
    this.cartForm = this.closest('[data-ref="cart-form"]');

    this.removeItemButton?.addEventListener('click', (event) => this.#handleItemRemove(event));
    this.quantitySelectorInput?.addEventListener('change', (event) => this.#handleQuantityInputChange(event));
    this.addEventListener('click', (event) => this.#handleItemNavigate(event));
  }

  disconnectedCallback() {
    this.quantitySelectorInput?.removeEventListener('change', (event) => this.#handleQuantityInputChange(event));
    this.removeItemButton?.removeEventListener('click', (event) => this.#handleItemRemove(event));
    this.removeEventListener('click', (event) => this.#handleItemNavigate(event));
  }

  #handleItemNavigate(event) {
    if (event.defaultPrevented) return;
    if (event.target.closest('button, select, label, input, textarea, a')) return;

    const url = this.dataset.productUrl;
    if (url) window.location.assign(url);
  }

  #handleItemRemove(event) {
    event.preventDefault();
    this.#updateLineItemQuantity(this.dataset.index, 0);
  }

  #handleQuantityInputChange(event) {
    event.preventDefault();
    this.#updateLineItemQuantity(this.dataset.index, this.quantitySelectorInput.value);
  }

  #updateLineItemQuantity(line, quantity) {
    this.#enableLoading();

    const body = JSON.stringify({
      line,
      quantity,
    });

    fetch(Theme.routes.cart_change_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: `application/json` },
      ...{ body },
    })
      .then((response) => {
        return response.text();
      })
      .then((responsetext) => {
        const parsedResponseText = JSON.parse(responsetext);

        if (parsedResponseText.errors) {
          const message = parsedResponseText.errors.join(', ');
          document.dispatchEvent(new CustomEvent('toast:open', { detail: { type: 'error', message: message } }));
          return;
        }
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        window.location.reload();
      });
  }

  #enableLoading() {
    this.cartForm.classList.add('cart__form--loading', 'rs-cart__form--loading');
  }
}

if (!customElements.get('cart-item')) {
  customElements.define('cart-item', CartItem);
}

(function initMobileCartSticky() {
  const sticky = document.getElementById('rs-cart-mobile-sticky');
  if (!sticky) return;

  const mobileMq = window.matchMedia('(max-width: 767px)');

  function zoneTop(selector) {
    const node = document.querySelector(selector);
    if (!node) return null;
    return node.getBoundingClientRect().top;
  }

  function shouldShowSticky() {
    if (!mobileMq.matches) return false;

    const viewportBottom = window.innerHeight;
    const stickyReserve = sticky.offsetHeight + 16;

    const checkoutTop = zoneTop('.rs-cart__checkout');
    if (checkoutTop != null && checkoutTop < viewportBottom - 8) return false;

    const prefooterTop = zoneTop('.shopify-section-group-prefooter-group');
    if (prefooterTop != null && prefooterTop < viewportBottom - stickyReserve) return false;

    const footerTop = zoneTop('footer[data-ref="footer"]');
    if (footerTop != null && footerTop < viewportBottom - stickyReserve) return false;

    return true;
  }

  function updateSticky() {
    const show = shouldShowSticky();
    sticky.classList.toggle('rs-cart__mobile-sticky--hidden', !show);
    sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  function bind() {
    updateSticky();
    window.addEventListener('scroll', updateSticky, { passive: true });
    window.addEventListener('resize', updateSticky, { passive: true });
    if (typeof mobileMq.addEventListener === 'function') {
      mobileMq.addEventListener('change', updateSticky);
    } else if (typeof mobileMq.addListener === 'function') {
      mobileMq.addListener(updateSticky);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
