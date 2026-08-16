const SEARCH_RECENTS_KEY = 'fullstack_search_recents_v1';
const SEARCH_RECENTS_MAX = 3;

function eventTargetElement(event) {
  const target = event?.target;
  if (target instanceof Element) return target;
  if (target?.parentElement instanceof Element) return target.parentElement;
  return null;
}

function readRecents() {
  try {
    const raw = localStorage.getItem(SEARCH_RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string' && s.trim()) : [];
    if (list.length > SEARCH_RECENTS_MAX) {
      const trimmed = list.slice(0, SEARCH_RECENTS_MAX);
      writeRecents(trimmed);
      return trimmed;
    }
    return list;
  } catch {
    return [];
  }
}

function writeRecents(list) {
  try {
    localStorage.setItem(SEARCH_RECENTS_KEY, JSON.stringify(list.slice(0, SEARCH_RECENTS_MAX)));
  } catch {
    /* ignore */
  }
}

function pushRecent(term) {
  const t = term.trim();
  if (!t) return;
  const tLower = t.toLowerCase();
  // Drop exact match (move to front) and any existing prefix of the new term
  // (so typing "jor" → "jord" → "jordan" yields just "jordan").
  const next = [
    t,
    ...readRecents().filter((x) => {
      const xLower = x.toLowerCase();
      if (xLower === tLower) return false;
      if (tLower.startsWith(xLower)) return false;
      return true;
    }),
  ];
  writeRecents(next);
}

function removeRecent(term) {
  const t = term.trim().toLowerCase();
  if (!t) return;
  writeRecents(readRecents().filter((x) => x.toLowerCase() !== t));
}

function renderRecentsInto(landing) {
  const wrap = landing.querySelector('[data-ref="search-landing-recent-wrap"]');
  const list = landing.querySelector('[data-ref="search-landing-recent-list"]');
  if (!wrap || !list) return;
  const items = readRecents();
  list.innerHTML = '';
  items.forEach((text) => {
    const li = document.createElement('li');
    li.className = 'search-landing__item search-landing__item--recent';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-landing__chip';
    btn.dataset.searchChip = text;
    btn.textContent = text;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'search-landing__chip-remove';
    remove.setAttribute('aria-label', 'Retirer');
    remove.dataset.searchChipRemove = text;
    remove.textContent = '\u00d7';
    li.appendChild(btn);
    li.appendChild(remove);
    list.appendChild(li);
  });
  wrap.hidden = items.length === 0;
}

function findSearchLanding(predictiveEl) {
  if (!predictiveEl) return null;
  return (
    predictiveEl.querySelector('[data-ref="search-landing"]') ||
    document.querySelector('[data-ref="search-landing-wrap"] [data-ref="search-landing"]')
  );
}

function bindSearchPageLanding(predictiveEl) {
  const landing = findSearchLanding(predictiveEl);
  const input = predictiveEl?.querySelector('input[name="q"]') || document.querySelector('[data-ref="search-input"]');
  if (!landing || !input) return;

  if (landing.dataset.searchLandingBound !== '1') {
    landing.dataset.searchLandingBound = '1';
    bindLandingChips(landing, input, () => syncLandingForInput(landing, input));
    const form = predictiveEl?.querySelector('form[action*="search"], form') || input.closest('form');
    if (form && !form.dataset.searchRecentsBound) {
      form.dataset.searchRecentsBound = '1';
      form.addEventListener('submit', () => {
        if (input.value.trim()) pushRecent(input.value);
      });
    }
  }

  renderRecentsInto(landing);
  syncLandingForInput(landing, input);
}

function syncLandingForInput(landing, input) {
  const wrap = document.querySelector('[data-ref="search-landing-wrap"]');
  const hasQuery = input.value.trim().length > 0;
  landing.hidden = hasQuery;
  if (wrap) wrap.hidden = hasQuery;
}

function bindLandingChips(landing, input, onChip) {
  landing.addEventListener('click', (event) => {
    const clickTarget = eventTargetElement(event);
    const removeBtn = clickTarget ? clickTarget.closest('[data-search-chip-remove]') : null;
    if (removeBtn && landing.contains(removeBtn)) {
      event.preventDefault();
      const term = removeBtn.getAttribute('data-search-chip-remove') || '';
      removeRecent(term);
      renderRecentsInto(landing);
      return;
    }
    const chip = clickTarget ? clickTarget.closest('[data-search-chip]') : null;
    if (!chip || !landing.contains(chip)) return;
    const q = chip.getAttribute('data-search-chip') || chip.textContent || '';
    if (!q.trim()) return;
    event.preventDefault();
    input.value = q;
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof onChip === 'function') onChip();
  });
}

function setupStandaloneDialogLanding() {
  document.querySelectorAll('dialog-component.search-popup dialog').forEach((dialog) => {
    if (dialog.dataset.searchLandingBound) return;
    const landing = dialog.querySelector('[data-ref="search-landing"]');
    const predictive = dialog.querySelector('predictive-search');
    if (!landing || predictive) return;
    const input = dialog.querySelector('input[name="q"]');
    const form = dialog.querySelector('form[action*="search"], form.search-form');
    if (!input || !form) return;
    dialog.dataset.searchLandingBound = '1';

    const sync = () => {
      const has = input.value.trim().length > 0;
      landing.hidden = has;
    };

    bindLandingChips(landing, input, sync);
    form.addEventListener('submit', () => {
      pushRecent(input.value);
    });

    input.addEventListener('input', sync);
    dialog.addEventListener('toggle', () => {
      if (!dialog.open) return;
      renderRecentsInto(landing);
      sync();
    });
  });
}

// ── Defer results swap while user is interacting with current results ──
// Avoids a race where mousedown lands on an old product link, then a fetch
// completes and replaceWith() detaches the link before mouseup fires.
let _pointerDownInResults = false;
let _pendingSwap = null;

function isResultsRootTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(target.closest('[data-ref="search-results-root"]'));
}

document.addEventListener(
  'pointerdown',
  (event) => {
    if (!isResultsRootTarget(event.target)) return;
    _pointerDownInResults = true;
  },
  true,
);

const _releasePointer = () => {
  _pointerDownInResults = false;
  if (!_pendingSwap) return;
  setTimeout(() => {
    if (!_pendingSwap) return;
    const { next, current } = _pendingSwap;
    _pendingSwap = null;
    if (current.isConnected) {
      current.replaceWith(next);
      if (typeof customElements?.upgrade === 'function') {
        try { customElements.upgrade(next); } catch (_) { /* ignore */ }
      }
      document.dispatchEvent(new CustomEvent('rl:search-results-updated'));
      ensureSearchFilterModules();
    }
  }, 250);
};
document.addEventListener('pointerup', _releasePointer, true);
document.addEventListener('pointercancel', _releasePointer, true);

let _searchFilterModulesPromise = null;

function themeModuleUrl(file) {
  try {
    return new URL(file, import.meta.url).href;
  } catch {
    return null;
  }
}

function ensureSearchFilterModules() {
  if (!document.querySelector('filters-sheet-component, filter-and-sort-component')) {
    return Promise.resolve();
  }
  if (
    customElements.get('filters-sheet-component') &&
    customElements.get('filter-and-sort-component')
  ) {
    const root = document.querySelector('[data-ref="search-results-root"]');
    if (root && typeof customElements.upgrade === 'function') {
      try {
        customElements.upgrade(root);
      } catch (_) {
        /* ignore */
      }
    }
    return Promise.resolve();
  }
  if (_searchFilterModulesPromise) return _searchFilterModulesPromise;

  const files = ['filter-and-sort.js', 'filter.js', 'filters-sheet.js', 'sort.js'];
  _searchFilterModulesPromise = Promise.all(
    files.map((file) => {
      const url = themeModuleUrl(file);
      return url ? import(url) : Promise.resolve();
    }),
  )
    .then(() => {
      const root = document.querySelector('[data-ref="search-results-root"]');
      if (root && typeof customElements.upgrade === 'function') {
        try {
          customElements.upgrade(root);
        } catch (_) {
          /* ignore */
        }
      }
    })
    .catch(() => {
      _searchFilterModulesPromise = null;
    });

  return _searchFilterModulesPromise;
}

function commitSearchResults(next, current) {
  if (_pointerDownInResults) {
    _pendingSwap = { next, current };
    return;
  }
  current.replaceWith(next);
  if (typeof customElements?.upgrade === 'function') {
    try { customElements.upgrade(next); } catch (_) { /* ignore */ }
  }
  document.dispatchEvent(new CustomEvent('rl:search-results-updated'));
  ensureSearchFilterModules();
}

function getSearchPath() {
  const rawPath = (window.Theme && Theme.routes && Theme.routes.search_url) || '/search';
  const localePrefix = getLocalePrefixFromPath();
  if (!localePrefix) return rawPath;
  if (rawPath === localePrefix || rawPath.startsWith(`${localePrefix}/`)) return rawPath;
  if (rawPath === '/search' || rawPath.startsWith('/search?')) return `${localePrefix}${rawPath}`;
  return rawPath;
}

function getLocalePrefixFromPath() {
  const match = window.location.pathname.match(/^\/([a-z]{2})(?:\/|$)/i);
  if (!match) return '';
  const locale = match[1].toLowerCase();
  if (locale === 'fr') return '';
  return `/${locale}`;
}

function isOnSearchPage() {
  const path = getSearchPath();
  return window.location.pathname === path || window.location.pathname.startsWith(path + '/');
}

function buildSearchUrl(term) {
  const path = getSearchPath();
  if (!term) return path;
  return `${path}?q=${encodeURIComponent(term)}&options%5Bprefix%5D=last`;
}

function getCurrentSearchSectionId() {
  const root = document.querySelector('[data-ref="search-results-root"]');
  const section = root?.closest('[id^="shopify-section-"]');
  if (!section?.id) return null;
  return section.id.replace('shopify-section-', '');
}

function buildSearchSectionUrl(term) {
  const sectionId = getCurrentSearchSectionId();
  if (!sectionId) return null;
  const url = buildSearchUrl(term);
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}section_id=${encodeURIComponent(sectionId)}`;
}

class PredictiveSearch extends HTMLElement {
  constructor() {
    super();
    this.abortController = null;
  }

  connectedCallback() {
    this.input = this.querySelector('input[name="q"]');
    if (!this.input) return;

    // Mode: 'live_page' navigates to /search; 'dropdown' renders predictive section inline.
    this.mode = this.dataset.mode === 'live_page' ? 'live_page' : 'dropdown';
    this.liveRegion = this.querySelector('[data-ref="predictive-live"]');
    this.predictiveSearchResults = this.querySelector('[data-ref="predictive-search"]');
    this.landing = findSearchLanding(this);

    if (this.mode === 'dropdown' && !this.predictiveSearchResults) {
      // No results container present; treat as live_page to avoid silent breakage.
      this.mode = 'live_page';
    }

    this._onInput = this.debounce(() => {
      this.onChange();
    }, 120).bind(this);
    this.input.addEventListener('input', this._onInput);

    this._onPointerDownInResults = () => {
      this.classList.add('is-open');
    };
    this.addEventListener('pointerdown', this._onPointerDownInResults);

    this._onFocusIn = () => {
      this.classList.add('is-open');
    };
    this.addEventListener('focusin', this._onFocusIn);

    this._onFocusOut = (event) => {
      const next = event.relatedTarget;
      if (next && this.contains(next)) return;
      setTimeout(() => {
        if (!this.contains(document.activeElement)) {
          this.classList.remove('is-open');
        }
      }, 180);
    };
    this.addEventListener('focusout', this._onFocusOut);

    this._onKeydown = (event) => {
      if (event.key === 'Escape') {
        this.hide();
        this.input.blur();
      }
    };
    this.input.addEventListener('keydown', this._onKeydown);

    this._onFocus = () => {
      this.syncLandingVisibility();
      if (this.mode === 'live_page' && !isOnSearchPage()) {
        try {
          sessionStorage.setItem('rl:search-autofocus', '1');
          sessionStorage.setItem('rl:search-caret', String(this.input.value.length));
        } catch (_) {
          /* ignore */
        }
        window.location.assign(getSearchPath());
      }
    };
    this.input.addEventListener('focus', this._onFocus);

    this._onDocClick = (event) => {
      if (!this.contains(event.target)) {
        this.classList.remove('is-open');
        if (this.mode === 'dropdown') this.hide();
      }
    };
    document.addEventListener('click', this._onDocClick);

    const form = this.querySelector('form[action*="search"], form');
    if (form) {
      this._onSubmit = () => {
        if (this.input.value.trim()) pushRecent(this.input.value);
      };
      form.addEventListener('submit', this._onSubmit);
    }

    if (this.landing && isOnSearchPage()) {
      bindSearchPageLanding(this);
    } else if (this.landing) {
      bindLandingChips(this.landing, this.input, () => this.syncLandingVisibility());
      renderRecentsInto(this.landing);
      this.syncLandingVisibility();
    }

    const dialog = this.closest('dialog');
    if (dialog && this.landing) {
      this._onDialogToggle = () => {
        if (!dialog.open) return;
        renderRecentsInto(this.landing);
        this.syncLandingVisibility();
      };
      dialog.addEventListener('toggle', this._onDialogToggle);
    }
  }

  disconnectedCallback() {
    if (this.input && this._onInput) {
      this.input.removeEventListener('input', this._onInput);
      this.input.removeEventListener('keydown', this._onKeydown);
      this.input.removeEventListener('focus', this._onFocus);
    }
    if (this._onPointerDownInResults) this.removeEventListener('pointerdown', this._onPointerDownInResults);
    if (this._onFocusIn) this.removeEventListener('focusin', this._onFocusIn);
    if (this._onFocusOut) this.removeEventListener('focusout', this._onFocusOut);
    if (this._onDocClick) {
      document.removeEventListener('click', this._onDocClick);
    }
    const form = this.querySelector('form[action*="search"], form');
    if (form && this._onSubmit) {
      form.removeEventListener('submit', this._onSubmit);
    }
    const dialog = this.closest('dialog');
    if (dialog && this._onDialogToggle) {
      dialog.removeEventListener('toggle', this._onDialogToggle);
    }
  }

  syncLandingVisibility() {
    if (!this.landing) return;
    syncLandingForInput(this.landing, this.input);
  }

  onChange() {
    const searchTerm = this.input.value.trim();
    this.syncLandingVisibility();

    if (this.mode === 'live_page') {
      this.handleLivePage(searchTerm);
      return;
    }

    if (!searchTerm.length) {
      if (this.predictiveSearchResults) this.predictiveSearchResults.innerHTML = '';
      this.hide();
      return;
    }

    this.getSearchResults(searchTerm);
  }

  /**
   * live_page mode: keep typing fluid by either navigating to /search?q=…
   * or, when already on the search template, swapping the results region in place.
   */
  handleLivePage(searchTerm) {
    const onSearch = isOnSearchPage();
    const url = buildSearchUrl(searchTerm);
    const sectionUrl = buildSearchSectionUrl(searchTerm);

    if (searchTerm.length >= 2) pushRecent(searchTerm);

    if (!onSearch) {
      if (!searchTerm.length) return;
      window.location.assign(url);
      return;
    }

    try {
      window.history.replaceState({}, '', url);
    } catch (_) {
      /* ignore */
    }

    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();

    fetch(sectionUrl || url, { signal: this.abortController.signal, headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then((text) => {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const next =
          doc.querySelector('[data-ref="search-results-root"]') ||
          (doc.body && doc.body.firstElementChild?.querySelector?.('[data-ref="search-results-root"]'));
        const current = document.querySelector('[data-ref="search-results-root"]');
        if (!next || !current) return;
        commitSearchResults(next, current);
      })
      .catch((error) => {
        if (error && error.name === 'AbortError') return;
        window.location.assign(url);
      });
  }

  getSearchResults(searchTerm) {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    const url =
      Theme.routes.predictive_search_url +
      `?q=${encodeURIComponent(searchTerm)}` +
      `&section_id=predictive-search` +
      `&resources[type]=product,collection,page,article`;

    fetch(url, { signal: this.abortController.signal })
      .then((response) => {
        if (!response.ok) {
          this.hide();
          throw new Error(String(response.status));
        }
        return response.text();
      })
      .then((text) => {
        const section = new DOMParser()
          .parseFromString(text, 'text/html')
          .querySelector('#shopify-section-predictive-search');
        if (!section) {
          this.hide();
          return;
        }
        this.predictiveSearchResults.innerHTML = section.innerHTML;
        this.show();
        document.dispatchEvent(new CustomEvent('rl:predictive-search-updated'));
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        this.hide();
      });
  }

  show() {
    if (this.liveRegion) {
      this.liveRegion.style.display = 'block';
    } else if (this.predictiveSearchResults) {
      this.predictiveSearchResults.style.display = 'block';
    }
  }

  hide() {
    if (this.liveRegion) {
      this.liveRegion.style.display = 'none';
    } else if (this.predictiveSearchResults) {
      this.predictiveSearchResults.style.display = 'none';
    }
  }

  debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
}

if (!customElements.get('predictive-search')) {
  customElements.define('predictive-search', PredictiveSearch);
}

const MOBILE_SEARCH_BAR_MQ = window.matchMedia('(min-width: 768px)');

/** Keep /search page bar mobile-only; sync on resize + AJAX swaps (CSS backup via [hidden]). */
function syncMobileSearchBarVisibility() {
  const bar = document.querySelector('[data-ref="search-mobile-bar"]');
  if (!bar) return;
  const hideOnLaptop = MOBILE_SEARCH_BAR_MQ.matches;
  bar.hidden = hideOnLaptop;
  bar.setAttribute('aria-hidden', hideOnLaptop ? 'true' : 'false');
}

function initMobileSearchBarViewportSync() {
  syncMobileSearchBarVisibility();
  if (MOBILE_SEARCH_BAR_MQ.addEventListener) {
    MOBILE_SEARCH_BAR_MQ.addEventListener('change', syncMobileSearchBarVisibility);
  } else {
    MOBILE_SEARCH_BAR_MQ.addListener(syncMobileSearchBarVisibility);
  }
  window.addEventListener('resize', syncMobileSearchBarVisibility);
  window.addEventListener('orientationchange', syncMobileSearchBarVisibility);
}

function restoreSearchFocusIfRequested() {
  if (!isOnSearchPage()) return;
  let shouldFocus = false;
  let caret = null;
  try {
    shouldFocus = sessionStorage.getItem('rl:search-autofocus') === '1';
    if (shouldFocus) {
      const c = sessionStorage.getItem('rl:search-caret');
      caret = c == null ? null : parseInt(c, 10);
      sessionStorage.removeItem('rl:search-autofocus');
      sessionStorage.removeItem('rl:search-caret');
    }
  } catch (_) {
    /* ignore */
  }
  if (!shouldFocus) return;

  const candidates = Array.from(document.querySelectorAll('input[name="q"]'));
  const input =
    candidates.find((el) => el.offsetParent !== null && !el.disabled) ||
    candidates[0];
  if (!input) return;

  try {
    input.focus({ preventScroll: true });
    const len = input.value.length;
    const pos = Number.isFinite(caret) ? Math.min(Math.max(caret, 0), len) : len;
    if (typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(pos, pos);
    }
  } catch (_) {
    /* ignore */
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupStandaloneDialogLanding();
  initMobileSearchBarViewportSync();
  if (isOnSearchPage()) {
    const predictive = document.querySelector('.main-search predictive-search[data-mode="live_page"]');
    if (predictive) bindSearchPageLanding(predictive);
  }
  restoreSearchFocusIfRequested();
});

document.addEventListener('rl:search-results-updated', () => {
  syncMobileSearchBarVisibility();
  ensureSearchFilterModules();
  if (!isOnSearchPage()) return;
  const predictive = document.querySelector('.main-search predictive-search[data-mode="live_page"]');
  if (predictive) bindSearchPageLanding(predictive);
});

// First tap on Filtrer after live AJAX can race module load (CE not defined yet).
// Retry open once modules upgrade.
document.addEventListener(
  'click',
  (event) => {
    const target = eventTargetElement(event);
    const toggle = target?.closest?.('[data-ref="sheet-toggle"]');
    if (!toggle || !toggle.closest('[data-ref="search-results-root"]')) return;
    if (customElements.get('filters-sheet-component')) return;

    event.preventDefault();
    event.stopPropagation();
    ensureSearchFilterModules().then(() => {
      requestAnimationFrame(() => {
        const sheet = toggle.closest('filters-sheet-component');
        if (sheet?.isConnected) toggle.click();
      });
    });
  },
  true,
);
