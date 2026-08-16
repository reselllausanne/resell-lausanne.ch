import { ThemeEvents, FiltersUpdatedEvent } from '@theme/events';
import { eventTargetElement } from '@theme/utilities';

class FilterAndSortComponent extends HTMLElement {
  constructor() {
    super();

    this.filters = null;
    this.sorting = null;
    this.section = null;
    this.abortController = null;
  }

  connectedCallback() {
    this.filters = this.querySelector('filter-component');
    this.#refreshSortingRef();
    this.section = this.closest('.shopify-section');

    document.addEventListener(ThemeEvents.filtersChanged, this.#onFiltersChanged);
    this.section.addEventListener('click', this.#onPaginationClick);
    window.addEventListener('popstate', this.#onPopState);
  }

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.filtersChanged, this.#onFiltersChanged);
    this.section?.removeEventListener('click', this.#onPaginationClick);
    window.removeEventListener('popstate', this.#onPopState);
  }

  #onFiltersChanged = (event) => {
    this.toggleLoading(true);

    const filterParams = event.detail.filter_params;
    const sortingParams = event.detail.sorting_params;
    const newUrl = this.#buildUrl(filterParams, sortingParams);

    this.#renderSection(newUrl);

    history.pushState({}, '', newUrl);
  };

  #onPaginationClick = (event) => {
    const clickTarget = eventTargetElement(event);
    const link = clickTarget ? clickTarget.closest('.pagination a[href]') : null;
    if (!link || link.hasAttribute('disabled')) return;

    event.preventDefault();
    this.#scrollToPageTop();
    this.toggleLoading(true);
    this.#renderSection(link.href, { pagination: true });
    history.pushState({}, '', link.href);
  };

  #onPopState = () => {
    this.toggleLoading(true);
    this.#renderSection(window.location.href, { pagination: true });
  };

  #getSectionId() {
    return this.section?.id?.replace(/^shopify-section-/, '') || '';
  }

  #buildSectionRequestUrl(pageUrl) {
    const sectionId = this.#getSectionId();
    if (!sectionId) return pageUrl;

    const url = new URL(pageUrl, window.location.origin);
    url.searchParams.set('section_id', sectionId);
    return url.toString();
  }

  #parseSectionHtml(responseText) {
    const trimmed = responseText.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      return new DOMParser().parseFromString(trimmed, 'text/html');
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = trimmed;
    return wrapper;
  }

  #buildUrl(filterParams, sortingParams) {
    const next = new URLSearchParams();

    const preserveKeys = ['q', 'options[prefix]', 'type'];
    const current = new URLSearchParams(window.location.search);
    preserveKeys.forEach((key) => {
      const v = current.get(key);
      if (v != null && v !== '') next.set(key, v);
    });

    // IMPORTANT: use append — filter facets (size/color/…) are multi-value.
    // set() kept only the last checkbox and made multi-select look broken.
    if (filterParams) {
      const fp = new URLSearchParams(filterParams);
      fp.forEach((value, key) => {
        if (value === '') return;
        next.append(key, value);
      });
    }

    if (sortingParams) {
      const sp = new URLSearchParams(sortingParams);
      sp.forEach((value, key) => {
        if (value === '') return;
        next.set(key, value);
      });
    }

    const queryString = next.toString();
    return `${window.location.pathname}${queryString ? '?' + queryString : ''}`;
  }

  #renderSection(requestUrl, options = {}) {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const sectionRequestUrl = this.#buildSectionRequestUrl(requestUrl);

    fetch(sectionRequestUrl, { signal, credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`Section fetch failed (${response.status})`);
        return response.text();
      })
      .then((responseText) => {
        const html = this.#parseSectionHtml(responseText);
        if (!html) throw new Error('Empty section response');

        const productsSelector = this.section.querySelector('[data-ref="main-collection-products"]')
          ? '[data-ref="main-collection-products"]'
          : '[data-ref="search-products"]';

        const newProducts = html.querySelector(productsSelector);
        const currentProducts = this.section.querySelector(productsSelector);

        if (!newProducts || !currentProducts) {
          throw new Error('Aucune nouvelle source de page de collection trouvée');
        }

        const filterRef = this.filters?.getAttribute('data-ref');

        currentProducts.replaceWith(newProducts);

        if (filterRef) {
          this.filters = this.section.querySelector(`filter-component[data-ref="${filterRef}"]`);
        }

        if (!options.pagination && this.filters && filterRef) {
          const newFiltersHtml = html.querySelector(`filter-component[data-ref="${filterRef}"]`);

          if (newFiltersHtml) {
            this.filters.renderFilters(newFiltersHtml);
          }
        }

        this.#syncToolbarFromResponse(html);
        this.#refreshSortingRef();

        this.dispatchEvent(new FiltersUpdatedEvent());

        if (!options.pagination) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => this.#scrollToPageTop());
          });
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        console.error(error);
        window.location.assign(requestUrl);
      })
      .finally(() => {
        if (!signal.aborted) this.toggleLoading(false);
      });
  }

  #syncToolbarFromResponse(html) {
    const newCount = html.querySelector('[data-commerce-result-count]');
    const currentCount = this.section.querySelector('[data-commerce-result-count]');
    if (newCount && currentCount) {
      currentCount.innerHTML = newCount.innerHTML;
    }

    const newFilterCount = html.querySelector('[data-commerce-filter-count]');
    const currentFilterCount = this.section.querySelector('[data-commerce-filter-count]');
    if (newFilterCount && currentFilterCount) {
      currentFilterCount.innerHTML = newFilterCount.innerHTML;
      if (newFilterCount.hasAttribute('hidden')) {
        currentFilterCount.setAttribute('hidden', '');
      } else {
        currentFilterCount.removeAttribute('hidden');
      }
    }

    const newApplied = html.querySelector('.filters-sheet__applied');
    const currentApplied = this.section.querySelector('.filters-sheet__applied');
    if (newApplied && currentApplied) {
      currentApplied.replaceWith(newApplied.cloneNode(true));
    } else if (newApplied && !currentApplied) {
      const body = this.section.querySelector('.filters-sheet__body');
      body?.insertBefore(newApplied.cloneNode(true), body.firstChild);
    } else if (!newApplied && currentApplied) {
      currentApplied.remove();
    }

    const newSortSelect = html.querySelector('[data-ref="sorting-select"]');
    const currentSortSelect = this.querySelector('[data-ref="sorting-select"]');
    if (newSortSelect && currentSortSelect) {
      currentSortSelect.value = newSortSelect.value;
    }

    const newSortInput = html.querySelector('sort-inline-component input[name="sort-by"]');
    const currentSortInput = this.querySelector('sort-inline-component input[name="sort-by"]');
    if (newSortInput && currentSortInput) {
      currentSortInput.value = newSortInput.value;
    }

    const activeSortValue = newSortSelect?.value || newSortInput?.value;
    if (activeSortValue) {
      this.querySelectorAll('.sorting__select').forEach((item) => {
        item.classList.toggle('sorting__select--selected', item.dataset.value === activeSortValue);
      });
    }
  }

  toggleLoading(isLoading) {
    const nextState =
      typeof isLoading === 'boolean'
        ? isLoading
        : !this.classList.contains('filter-and-sort--loading');

    this.classList.toggle('filter-and-sort--loading', nextState);

    const productsWrap =
      this.section?.querySelector('[data-ref="main-collection-products"]') ||
      this.section?.querySelector('[data-ref="search-products"]');

    productsWrap?.classList.toggle('main-collection__product-grid-wrap--loading', nextState);
    this.section?.classList.toggle('main-collection--paginating', nextState);
  }

  getCurrentFiltersParams() {
    return this.filters?.getFiltersParams() || '';
  }

  #refreshSortingRef() {
    this.sorting =
      this.querySelector('sort-component') ||
      this.querySelector('sort-inline-component');
  }

  #scrollToPageTop() {
    const scrollBehavior = 'instant' in window ? 'instant' : 'auto';
    const anchor =
      this.section?.querySelector('[data-commerce-collection-header]') ||
      this.section?.querySelector('.main-search__header') ||
      document.getElementById('main-content');

    if (anchor) {
      const top = anchor.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior });
      return;
    }

    window.scrollTo({ top: 0, behavior: scrollBehavior });
  }

  getCurrentSortingParams() {
    this.#refreshSortingRef();

    if (typeof this.sorting?.getSortingParams === 'function') {
      return this.sorting.getSortingParams();
    }

    const select = this.querySelector('[data-ref="sorting-select"]');
    if (select?.value) return `sort_by=${select.value}`;

    const input = this.querySelector('input[name="sort-by"]');
    if (input?.value) return `sort_by=${input.value}`;

    return '';
  }
}

if (!customElements.get('filter-and-sort-component')) {
  customElements.define('filter-and-sort-component', FilterAndSortComponent);
}
