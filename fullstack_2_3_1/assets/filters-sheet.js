class FiltersSheetComponent extends HTMLElement {
  constructor() {
    super();
    this.toggle = null;
    this.overlay = null;
    this.panel = null;
    this.closeBtn = null;
    this.applyBtn = null;
    this.resetBtn = null;
    this.filterEl = null;
  }

  connectedCallback() {
    this.toggle = this.querySelector('[data-ref="sheet-toggle"]');
    this.overlay = this.querySelector('[data-ref="sheet-overlay"]');
    this.panel = this.querySelector('[data-ref="sheet-panel"]');
    this.closeBtn = this.querySelector('[data-ref="sheet-close"]');
    this.applyBtn = this.querySelector('[data-ref="sheet-apply"]');
    this.resetBtn = this.querySelector('[data-ref="sheet-reset"]');
    this.filterEl = this.querySelector('filter-component');
    this._isOpen = false;

    this.toggle?.addEventListener('click', this.#open);
    this.closeBtn?.addEventListener('click', this.#close);
    this.overlay?.addEventListener('click', this.#onOverlayClick);
    this.applyBtn?.addEventListener('click', this.#onApply);
    this.resetBtn?.addEventListener('click', this.#onReset);
    document.addEventListener('keydown', this.#onKey);
  }

  disconnectedCallback() {
    this.toggle?.removeEventListener('click', this.#open);
    this.closeBtn?.removeEventListener('click', this.#close);
    this.overlay?.removeEventListener('click', this.#onOverlayClick);
    this.applyBtn?.removeEventListener('click', this.#onApply);
    this.resetBtn?.removeEventListener('click', this.#onReset);
    document.removeEventListener('keydown', this.#onKey);

    if (this._isOpen) {
      this._isOpen = false;
      document.body.classList.remove('overflow-hidden');
      document.documentElement.classList.remove('filters-sheet-open');
    }

    this.#unportalOverlay();
  }

  #portalOverlay = () => {
    if (!this.overlay) return;
    if (this.overlay.parentElement === document.body) return;
    this._overlayHomeMarker = document.createComment('filters-sheet-overlay');
    this.overlay.parentElement.insertBefore(this._overlayHomeMarker, this.overlay);
    document.body.appendChild(this.overlay);
  };

  #unportalOverlay = () => {
    if (!this.overlay) return;
    if (this._overlayHomeMarker?.parentElement) {
      this._overlayHomeMarker.parentElement.insertBefore(this.overlay, this._overlayHomeMarker);
      this._overlayHomeMarker.remove();
      this._overlayHomeMarker = null;
    } else if (this.overlay.parentElement === document.body) {
      this.overlay.remove();
    }
  };

  #open = (event) => {
    if (event) event.preventDefault();
    if (this._isOpen) return;
    this._isOpen = true;

    this.#portalOverlay();
    this.classList.add('is-open');
    this.overlay?.removeAttribute('hidden');
    document.body.classList.add('overflow-hidden');
    document.documentElement.classList.add('filters-sheet-open');
    requestAnimationFrame(() => {
      this.panel?.classList.add('is-visible');
    });
    setTimeout(() => this.closeBtn?.focus(), 80);
  };

  #close = () => {
    if (!this._isOpen) return;
    this._isOpen = false;

    this.panel?.classList.remove('is-visible');
    this.classList.remove('is-open');
    document.body.classList.remove('overflow-hidden');
    document.documentElement.classList.remove('filters-sheet-open');
    setTimeout(() => {
      if (this._isOpen) return;
      this.overlay?.setAttribute('hidden', '');
      this.#unportalOverlay();
    }, 220);
    this.toggle?.focus();
  };

  #onOverlayClick = (event) => {
    if (event.target === this.overlay) this.#close();
  };

  #onKey = (event) => {
    if (event.key === 'Escape' && this.classList.contains('is-open')) this.#close();
  };

  #resetSort() {
    const root = this.overlay || this;
    const sortSelect = root.querySelector('[data-ref="sorting-select"]');
    const defaultSort = root.querySelector('sort-component')?.dataset.defaultSort;
    if (sortSelect && defaultSort) {
      sortSelect.value = defaultSort;
    }

    const sortInput = root.querySelector('sort-inline-component input[name="sort-by"]');
    if (sortInput && defaultSort) {
      sortInput.value = defaultSort;
    }

    root.querySelectorAll('.sorting__select--selected').forEach((item) => {
      item.classList.remove('sorting__select--selected');
    });

    const defaultItem = root.querySelector(`.sorting__select[data-value="${defaultSort}"]`);
    defaultItem?.classList.add('sorting__select--selected');
  }

  async #ensureFilterModules() {
    if (typeof window.__rlLoadFilterModules === 'function') {
      await window.__rlLoadFilterModules();
    }
  }

  #onApply = async () => {
    await this.#ensureFilterModules();
    this.#applyFiltersAndSort();
    this.#close();
  };

  #onReset = async (event) => {
    event.preventDefault();
    await this.#ensureFilterModules();
    const filterEl = this.filterEl || this.overlay?.querySelector('filter-component');
    filterEl?.reset?.();
    this.#resetSort();
    this.#applyFiltersAndSort();
    this.#close();
  };

  #applyFiltersAndSort() {
    const wrapper =
      this.closest('filter-and-sort-component') ||
      document.querySelector('filter-and-sort-component');

    const filterEl = this.filterEl || this.overlay?.querySelector('filter-component');

    if (filterEl?.apply) {
      filterEl.apply();
      return;
    }

    if (!wrapper || typeof wrapper.getCurrentSortingParams !== 'function') return;

    const sortingParams = wrapper.getCurrentSortingParams();
    if (!sortingParams) return;

    document.dispatchEvent(
      new CustomEvent('filters:changed', {
        bubbles: true,
        detail: {
          filter_params: filterEl?.getFiltersParams?.() || '',
          sorting_params: sortingParams,
        },
      })
    );
  }
}

if (!customElements.get('filters-sheet-component')) {
  customElements.define('filters-sheet-component', FiltersSheetComponent);
}
