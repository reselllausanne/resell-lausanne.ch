import { FiltersChangedEvent } from '@theme/events';

class SortInlineComponent extends HTMLElement {
  constructor() {
    super();

    this.sortingInput = null;
    this.sortingList = null;
    this.sortingListItems = null;
    this.dropdown = null;
  }

  connectedCallback() {
    this.sortingListItems = this.querySelectorAll('[data-ref="sorting-list"] li');
    this.sortingInput = this.querySelector('input[name="sort-by"]');
    this.dropdown = this.querySelector('dropdown-component');

    this.sortingListItems.forEach((item) => {
      item.addEventListener('click', this.#onClick);
    });
  }

  disconnectedCallback() {
    this.sortingListItems.forEach((item) => {
      item.removeEventListener('click', this.#onClick);
    });
  }

  #onClick = (event) => {
    const sortOptionClicked = event.target.closest('[data-value]');
    const sortOptionValue = sortOptionClicked?.dataset?.value;

    if (
      sortOptionValue &&
      sortOptionClicked &&
      !sortOptionClicked.classList.contains('sorting__select--selected')
    ) {
      this.resetSelectedItem();

      sortOptionClicked.classList.add('sorting__select--selected');

      if (this.sortingInput) {
        this.sortingInput.value = sortOptionValue;
      }

      if (this.#isStagedContext()) return;

      this.#dispatchSortChange();
      this.dropdown?.close();
    }
  };

  #isStagedContext() {
    return Boolean(this.closest('filters-sheet-component'));
  }

  #dispatchSortChange() {
    const wrapper = this.closest('filter-and-sort-component');
    if (!wrapper) return;

    const filterParams = wrapper.getCurrentFiltersParams();
    const sortingParams = this.getSortingParams();
    if (!sortingParams) return;

    document.dispatchEvent(new FiltersChangedEvent(filterParams, sortingParams));
  }

  getSortingParams() {
    if (!this.sortingInput?.value) return '';
    return `sort_by=${this.sortingInput.value}`;
  }

  resetSelectedItem() {
    this.sortingListItems.forEach((item) => {
      item.classList.remove('sorting__select--selected');
    });
  }
}

if (!customElements.get('sort-inline-component')) {
  customElements.define('sort-inline-component', SortInlineComponent);
}

class SortComponent extends HTMLElement {
  constructor() {
    super();

    this.sortingSelect = null;
  }

  connectedCallback() {
    this.sortingSelect = this.querySelector('[data-ref="sorting-select"]');
    if (!this.sortingSelect) return;

    this.sortingSelect.addEventListener('change', this.#onChange);
  }

  disconnectedCallback() {
    this.sortingSelect?.removeEventListener('change', this.#onChange);
  }

  #isStagedContext() {
    return Boolean(this.closest('filters-sheet-component'));
  }

  #onChange = (event) => {
    const sortOptionValue = event.target.value;

    if (!sortOptionValue || this.#isStagedContext()) return;

    const wrapper = this.closest('filter-and-sort-component');
    if (!wrapper) return;

    const filterParams = wrapper.getCurrentFiltersParams();
    const sortingParams = this.getSortingParams();
    if (!sortingParams) return;

    document.dispatchEvent(new FiltersChangedEvent(filterParams, sortingParams));
  };

  getSortingParams() {
    if (!this.sortingSelect?.value) return '';
    return `sort_by=${this.sortingSelect.value}`;
  }
}

if (!customElements.get('sort-component')) {
  customElements.define('sort-component', SortComponent);
}
