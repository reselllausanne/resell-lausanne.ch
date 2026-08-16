class SeeMoreComponent extends HTMLElement {
  constructor() {
    super();
    this.isExpanded = false;
    this.maxHeight = 220;
    this.contentElement = null;
    this.toggleButton = null;
    this.toggleText = null;
    this.resizeObserver = null;
    this.boundToggle = this.#toggle.bind(this);
  }

  connectedCallback() {
    this.maxHeight =
      parseInt(this.dataset.readMoreLength, 10) ||
      parseInt(getComputedStyle(this).getPropertyValue('--plp-seo-collapsed-h'), 10) ||
      220;

    this.contentElement = this.querySelector('[data-ref="see-more-content"]');
    this.toggleButton = this.querySelector('[data-ref="see-more-toggle"]');
    this.toggleText = this.querySelector('[data-ref="see-more-toggle-text"]');

    if (!this.contentElement || !this.toggleButton) return;

    this.#setCollapsed();
    this.toggleButton.addEventListener('click', this.boundToggle);
    this.#checkIfToggleNeeded();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.isExpanded) this.#checkIfToggleNeeded();
      });
      this.resizeObserver.observe(this.contentElement);
    }
  }

  disconnectedCallback() {
    this.toggleButton?.removeEventListener('click', this.boundToggle);
    this.resizeObserver?.disconnect();
  }

  #setCollapsed() {
    this.contentElement.style.maxHeight = `${this.maxHeight}px`;
    this.contentElement.style.overflow = 'hidden';
    this.contentElement.classList.remove('see-more__content--expanded');
    this.isExpanded = false;
    this.toggleButton.setAttribute('aria-expanded', 'false');
    if (this.toggleText) {
      this.toggleText.textContent = this.toggleText.dataset.moreText || 'Voir plus';
    }
  }

  #checkIfToggleNeeded() {
    const originalMaxHeight = this.contentElement.style.maxHeight;
    this.contentElement.style.maxHeight = 'none';

    const actualHeight = this.contentElement.scrollHeight;

    this.contentElement.style.maxHeight = this.isExpanded
      ? `${actualHeight}px`
      : originalMaxHeight;

    const needsToggle = actualHeight > this.maxHeight + 8;

    if (needsToggle) {
      this.toggleButton.style.display = '';
      this.toggleButton.hidden = false;
      this.contentElement.classList.remove('see-more__content--no-overflow');
    } else {
      this.toggleButton.style.display = 'none';
      this.toggleButton.hidden = true;
      this.contentElement.classList.add('see-more__content--no-overflow');
      this.contentElement.style.maxHeight = 'none';
      this.classList.add('is-expanded');
    }
  }

  #toggle() {
    this.isExpanded = !this.isExpanded;

    if (this.isExpanded) {
      this.contentElement.style.maxHeight = `${this.contentElement.scrollHeight}px`;
      this.contentElement.classList.add('see-more__content--expanded');
      this.classList.add('is-expanded');
      this.toggleButton.setAttribute('aria-expanded', 'true');
      if (this.toggleText) {
        this.toggleText.textContent = this.toggleText.dataset.lessText || 'Voir moins';
      }
    } else {
      this.#setCollapsed();
      this.classList.remove('is-expanded');
      this.contentElement.style.maxHeight = `${this.maxHeight}px`;
    }

    this.dispatchEvent(
      new CustomEvent('see-more:toggle', {
        detail: { isExpanded: this.isExpanded },
        bubbles: true,
      }),
    );
  }
}

if (!customElements.get('see-more-component')) {
  customElements.define('see-more-component', SeeMoreComponent);
}
