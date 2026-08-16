import { shouldShowStickyAfterAnchor } from '@theme/utilities';

class StickyAddToCart extends HTMLElement {
  constructor() {
    super();

    this.form = null;
    this.footer = null;
    this.onScroll = () => this.#displayStickyAddToCart();
  }

  connectedCallback() {
    this.form = this.closest('[data-ref="product-form"]');
    this.footer = document.querySelector('[data-ref="footer"]');

    this.#displayStickyAddToCart();
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
  }

  #getStickyAnchor() {
    if (!this.form) return null;
    return (
      this.form.querySelector('.rs-size-modal__trigger') ||
      this.form.querySelector('[data-ref="add-to-cart-button-container"]') ||
      this.form.querySelector('[data-ref="add-to-cart-button"]')
    );
  }

  #displayStickyAddToCart() {
    const shouldShow = shouldShowStickyAfterAnchor(this.#getStickyAnchor(), this.footer, this);

    this.dataset.active = shouldShow ? 'true' : 'false';
    this.classList.toggle('color-scheme-1', shouldShow);
  }
}

if (!customElements.get('sticky-add-to-cart')) {
  customElements.define('sticky-add-to-cart', StickyAddToCart);
}
