import { FiltersChangedEvent } from '@theme/events';

class FilterComponent extends HTMLElement {
  constructor() {
    super();

    this.form = null;
    this.staged = false;
  }

  connectedCallback() {
    this.form = this.querySelector('[data-ref="filters-form"]');
    this.staged = this.dataset.staged === 'true';

    this.addEventListener('change', this.#onFiltersChanged);
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.#onFiltersChanged);
  }

  #onFiltersChanged = (event) => {
    event.preventDefault();

    if (this.staged) {
      this.dispatchEvent(new CustomEvent('filters:dirty', { bubbles: true }));
      return;
    }

    const filterParams = this.getFiltersParams();
    const wrapper = this.closest('filter-and-sort-component');
    const sortingParams = wrapper ? wrapper.getCurrentSortingParams() : '';

    document.dispatchEvent(new FiltersChangedEvent(filterParams, sortingParams));
  };

  getFiltersParams() {
    const formData = new FormData(this.form);
    // Rebuild via append so multi-checked facets keep every value.
    const newParameters = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (value === '') continue;
      newParameters.append(key, value);
    }

    newParameters.delete('page');

    return newParameters.toString();
  }

  apply() {
    if (!this.form) return;
    const filterParams = this.getFiltersParams();
    const wrapper =
      this.closest('filter-and-sort-component') ||
      document.querySelector('filter-and-sort-component');
    const sortingParams = wrapper && typeof wrapper.getCurrentSortingParams === 'function'
      ? wrapper.getCurrentSortingParams()
      : '';

    document.dispatchEvent(new FiltersChangedEvent(filterParams, sortingParams));
  }

  reset() {
    if (!this.form) return;
    this.form.reset();
    this.form.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((input) => {
      input.checked = false;
    });
    this.form.querySelectorAll('input[type="text"], input[type="number"], input[type="search"]').forEach((input) => {
      input.value = '';
    });
  }

  renderFilters(newFiltersHtml) {
    this.innerHTML = newFiltersHtml.innerHTML;
    this.form = this.querySelector('[data-ref="filters-form"]');
  }
}

if (!customElements.get('filter-component')) {
  customElements.define('filter-component', FilterComponent);
}
