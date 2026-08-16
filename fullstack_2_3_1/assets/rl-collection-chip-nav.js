/**
 * Fast collection navigation: PLP chips, desktop header, menu drawer.
 * - fetch() + in-memory cache (stronger than rel=prefetch on desktop)
 * - Partial DOM swap on PLP when destination is a collection
 * - Progressive home → collection swap from menu drawer only
 * - Menu drawer: prefetch visible panel links (mobile + laptop)
 */
(function () {
  if (typeof Theme === 'undefined') return;

  const CHIP =
    '[data-collection-plp-subcollection-chips] a.collection-plp-brand-chips__chip[href], [data-collection-plp-brand-chips] a.collection-plp-brand-chips__chip[href]';
  const HEADER_COLLECTION_LINK =
    'a.rl-desktop-header__link[data-rl-fast-collection-link][href]';
  const MENU_LINK = 'a.header__mobile-menu-link[href]';
  const MENU_OVERLAY = '.header__mobile-menu-overlay';
  const MENU_SCROLL = '[data-ref="menu-scroll"]';
  const MENU_PANEL = '.header__mobile-menu-panel.is-active';
  const SCROLLER =
    '[data-collection-plp-subcollection-chips] [data-collection-plp-brand-scroller], [data-collection-plp-brand-chips] [data-collection-plp-brand-scroller]';
  const SNEAKERS_PANEL_TARGET = '[data-panel-target="demo-sneakers"]';
  const SNEAKERS_BRANCH_PREFETCH_RE =
    /nike|adidas|new balance|jordan|yeezy|asics|salomon|mizuno|dunk|air max|samba/i;
  const BLOCKED_NAV_PATH_RE =
    /\/(?:cart|checkout|account|search|products|policies|apps|gift_cards)(?:\/|$)/i;
  const CACHE = new Map();
  const PREFETCHING = new Set();
  const QUEUED = new Set();
  const queue = [];
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection && connection.saveData);
  const effectiveType = (connection && connection.effectiveType ? connection.effectiveType : '').toLowerCase();
  const verySlowNetwork = saveData || effectiveType.includes('slow-2g') || effectiveType.includes('2g');
  const weakNetwork = verySlowNetwork || effectiveType.includes('3g');
  const CACHE_MAX = weakNetwork ? 16 : 28;
  const MAX_CONCURRENT = verySlowNetwork ? 2 : 4;
  const IDLE_LIMIT = weakNetwork ? 0 : 12;
  let idleScheduled = false;
  let activeFetches = 0;
  let abortCtrl = null;
  let homeSnapshots = null;
  let homeHeaderChrome = null;
  let collectionModulesPromise = null;
  let sneakersBranchIntentWarmed = false;

  function canPartialSwap() {
    return Theme.template?.name === 'collection' && document.querySelector('[data-ref="main-collection-results-root"]');
  }

  function canPartialSwapFromHome() {
    return Theme.template?.name === 'index' && Boolean(document.querySelector('#main-content'));
  }

  function getLocalePrefix(pathname) {
    const match = String(pathname || '').match(/^\/([a-z]{2})(?=\/|$)/i);
    if (!match) return '';
    const code = (match[1] || '').toLowerCase();
    if (!code || code === 'fr') return '';
    return `/${code}`;
  }

  function isSameLocalePath(url) {
    return getLocalePrefix(normPath(window.location.href)) === getLocalePrefix(normPath(url));
  }

  function isSafeCollectionNavUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.origin !== window.location.origin) return false;
      if (!isSameLocalePath(url)) return false;

      const path = normPath(parsed.href);
      if (!isCollectionPath(path)) return false;
      if (BLOCKED_NAV_PATH_RE.test(path)) return false;

      const parts = path.split('/').filter(Boolean);
      const collectionsIndex = parts.indexOf('collections');
      if (collectionsIndex === -1 || !parts[collectionsIndex + 1]) return false;

      return true;
    } catch {
      return false;
    }
  }

  function isHomePath(path) {
    const normalized = normPath(path || window.location.href);
    const root = normPath(Theme.routes?.root || '/');
    return !normalized || normalized === '/' || normalized === root;
  }

  function publishChipNavPageView() {
    try {
      if (window.ShopifyAnalytics?.lib?.page) {
        window.ShopifyAnalytics.lib.page(null, { shopifyEmitted: false });
      }
      if (window.Shopify?.analytics?.publish) {
        window.Shopify.analytics.publish('page_viewed', {});
      }
      if (typeof window.clarity === 'function') {
        window.clarity('set', 'page', window.location.href);
      }
    } catch (_err) {
      /* tracking optional */
    }
  }

  function normPath(url) {
    try {
      return new URL(url, window.location.origin).pathname.replace(/\/$/, '');
    } catch {
      return '';
    }
  }

  /** Cache/nav key must keep query (e.g. ?brand_strip=other) or Autres marques reuses primary HTML. */
  function cacheKey(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.pathname.replace(/\/$/, '') + parsed.search;
    } catch {
      return '';
    }
  }

  function chipMatchesUrl(chipHref, pageUrl) {
    try {
      const chip = new URL(chipHref, window.location.origin);
      const page = new URL(pageUrl, window.location.origin);
      const chipPath = chip.pathname.replace(/\/$/, '');
      const pagePath = page.pathname.replace(/\/$/, '');
      if (chipPath !== pagePath) return false;
      const chipStrip = (chip.searchParams.get('brand_strip') || '').toLowerCase();
      const pageStrip = (page.searchParams.get('brand_strip') || '').toLowerCase();
      return chipStrip === pageStrip;
    } catch {
      return false;
    }
  }

  function allChipLinks() {
    return [...document.querySelectorAll(CHIP)].filter((a) => !a.closest('[hidden]'));
  }

  function isCatalogChipPage() {
    return Boolean(document.querySelector('[data-collection-plp-brand-chips][data-rl-catalog-chips]'));
  }

  function allHeaderCollectionLinks() {
    return [...document.querySelectorAll(HEADER_COLLECTION_LINK)];
  }

  function isCollectionPath(path) {
    return Boolean(path && path.includes('/collections/'));
  }

  function chipLink(el) {
    if (!(el instanceof Element)) return null;
    const a = el.closest('a.collection-plp-brand-chips__chip[href]');
    if (!a || !a.closest('[data-collection-plp-subcollection-chips], [data-collection-plp-brand-chips]')) return null;
    // Allow click even if styled active when href targets another page
    // (e.g. Autres marques on other-strip → Toutes nos paires).
    if (chipMatchesUrl(a.href, window.location.href)) return null;
    const path = normPath(a.href);
    if (!isCollectionPath(path)) return null;
    return a;
  }

  function chipLinkSource(a) {
    if (a.closest('[data-collection-plp-brand-chips]')) return 'brand';
    return 'chip';
  }

  function headerCollectionLink(el) {
    if (!(el instanceof Element)) return null;
    const a = el.closest('a');
    if (!a || !a.matches(HEADER_COLLECTION_LINK)) return null;
    const path = normPath(a.href);
    if (!isCollectionPath(path)) return null;
    if (path === normPath(window.location.href)) return null;
    return a;
  }

  function menuDrawerLink(el) {
    if (!(el instanceof Element)) return null;
    const overlay = document.querySelector(MENU_OVERLAY);
    if (!overlay || !overlay.classList.contains('is-open')) return null;
    const a = el.closest(MENU_LINK);
    if (!a || !a.closest(MENU_PANEL)) return null;
    const path = normPath(a.href);
    if (!path || path === normPath(window.location.href)) return null;
    return a;
  }

  function getNavTarget(el) {
    const chip = chipLink(el);
    if (chip) return { anchor: chip, source: chipLinkSource(chip) };
    const headerLink = headerCollectionLink(el);
    if (headerLink) return { anchor: headerLink, source: 'header' };
    const menuLink = menuDrawerLink(el);
    if (menuLink) return { anchor: menuLink, source: 'menu' };
    return null;
  }

  function menuOverlayOpen() {
    const overlay = document.querySelector(MENU_OVERLAY);
    return Boolean(overlay && overlay.classList.contains('is-open'));
  }

  function closeMobileMenuForNavigation() {
    const header = document.querySelector('header-component');
    if (header && typeof header.closeMobileMenu === 'function') {
      header.closeMobileMenu();
      return;
    }

    const overlay = document.querySelector(MENU_OVERLAY);
    if (!overlay || !overlay.classList.contains('is-open')) return;
    overlay.classList.remove('is-open', 'is-closing');
    document.body.classList.remove('overflow-hidden');
  }

  function isMenuLinkVisible(link, scrollRoot) {
    if (!(link instanceof Element) || !(scrollRoot instanceof Element)) return false;
    const linkRect = link.getBoundingClientRect();
    const rootRect = scrollRoot.getBoundingClientRect();
    if (linkRect.height <= 0 || linkRect.width <= 0) return false;
    return linkRect.bottom > rootRect.top + 6 && linkRect.top < rootRect.bottom - 6;
  }

  function warmRootMenuLinksOnIntent() {
    if (weakNetwork) return;

    const root = document.querySelector(MENU_OVERLAY + ' [data-panel-id="root"]');
    if (!root) return;

    const max = weakNetwork ? 4 : 8;
    let count = 0;

    root.querySelectorAll(MENU_LINK).forEach((a) => {
      if (count >= max) return;
      const path = normPath(a.href);
      if (!isCollectionPath(path)) return;
      enqueuePrefetch(a.href, 25, { hint: true });
      count += 1;
    });
  }

  function sneakersBranchLinkRoots() {
    const roots = [];
    const template = document.querySelector('template[data-menu-branch="sneakers"]');
    if (template?.content) roots.push(template.content);
    const panel = document.querySelector('[data-panel-id="demo-sneakers"]');
    if (panel) roots.push(panel);
    return roots;
  }

  function warmSneakersBranchOnIntent() {
    if (weakNetwork || sneakersBranchIntentWarmed) return;

    const links = [];
    sneakersBranchLinkRoots().forEach((root) => {
      root.querySelectorAll('a.header__mobile-menu-link[href*="/collections/"]').forEach((a) => {
        if (!isSafeCollectionNavUrl(a.href)) return;
        if (!links.some((existing) => normPath(existing.href) === normPath(a.href))) {
          links.push(a);
        }
      });
    });

    if (!links.length) return;
    sneakersBranchIntentWarmed = true;

    const prioritized = [];
    const rest = [];
    links.forEach((a) => {
      if (SNEAKERS_BRANCH_PREFETCH_RE.test(a.textContent || '')) prioritized.push(a);
      else rest.push(a);
    });

    let count = 0;
    [...prioritized, ...rest].forEach((a) => {
      if (count >= 8) return;
      enqueuePrefetch(a.href, 32, { hint: true });
      count += 1;
    });
  }

  function warmVisibleMenuLinks() {
    if (weakNetwork || !menuOverlayOpen()) return;

    const panel = document.querySelector(MENU_OVERLAY + ' ' + MENU_PANEL);
    const scrollRoot = document.querySelector(MENU_OVERLAY + ' ' + MENU_SCROLL);
    if (!panel || !scrollRoot) return;

    const max = weakNetwork ? 6 : 12;
    let count = 0;

    panel.querySelectorAll(MENU_LINK).forEach((a) => {
      if (count >= max) return;
      if (!isMenuLinkVisible(a, scrollRoot)) return;
      if (!isCollectionPath(normPath(a.href))) return;
      enqueuePrefetch(a.href, 30, { hint: true });
      count += 1;
    });
  }

  function boostAboveFoldChipImages(scope) {
    const root = scope || document;
    root.querySelectorAll(SCROLLER).forEach((scroller) => {
      let boosted = 0;
      scroller.querySelectorAll('img[data-chip-image]').forEach((img) => {
        if (boosted >= 6) return;
        const chip = img.closest('a.collection-plp-brand-chips__chip[href]');
        if (chip && !isChipVisible(chip)) return;
        img.loading = 'eager';
        if ('fetchPriority' in img) img.fetchPriority = 'low';
        boosted += 1;
      });
    });
  }

  function hydrateDeferredSubcollectionChips(scope) {
    const root = scope || document;
    root.querySelectorAll('[data-collection-plp-subcollection-chips][data-rl-subcollection-has-deferred]').forEach((wrap) => {
      if (wrap.dataset.rlSubcolDeferredHydrated === '1') return;
      const track = wrap.querySelector('[data-rl-subcollection-atf]');
      const tpl = wrap.querySelector('[data-rl-subcollection-chips-deferred]');
      if (!track || !tpl) return;

      wrap.dataset.rlSubcolDeferredHydrated = '1';
      track.insertAdjacentHTML('beforeend', tpl.innerHTML);
      tpl.remove();
      wrap.classList.add('is-deferred-hydrated');

      const scroller = wrap.querySelector('[data-rl-subcollection-scroller]');
      if (scroller) {
        scroller.dispatchEvent(new CustomEvent('rl:subcollection-chips-expanded', { bubbles: true }));
      }
    });
  }

  function bindDeferredSubcollectionChips(scope) {
    const root = scope || document;
    root.querySelectorAll('[data-collection-plp-subcollection-chips][data-rl-subcollection-has-deferred]').forEach((wrap) => {
      if (wrap.dataset.rlSubcolDeferredBound === '1') return;
      wrap.dataset.rlSubcolDeferredBound = '1';

      const scroller = wrap.querySelector('[data-rl-subcollection-scroller]');
      if (!scroller) return;

      const tpl = wrap.querySelector('[data-rl-subcollection-chips-deferred]');
      const currentPath = normPath(window.location.href);
      const activeInDeferred = Boolean(
        tpl &&
          (tpl.innerHTML.includes(`href="${currentPath}"`) ||
            tpl.innerHTML.includes(`href="${currentPath}/"`))
      );

      let hydrated = false;
      const hydrate = () => {
        if (hydrated) return;
        hydrated = true;
        hydrateDeferredSubcollectionChips(wrap);
        initObservers();
        warmVisibleChips();
        const active = wrap.querySelector('a.collection-plp-brand-chips__chip.is-active');
        if (active) {
          active.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
        }
      };

      if (activeInDeferred) {
        hydrate();
        return;
      }

      scroller.addEventListener(
        'scroll',
        () => {
          if (scroller.scrollLeft > 16) hydrate();
        },
        { passive: true }
      );

      scroller.addEventListener(
        'pointerenter',
        () => {
          hydrate();
        },
        { passive: true }
      );

      if ('requestIdleCallback' in window) {
        requestIdleCallback(hydrate, { timeout: 2800 });
      } else {
        setTimeout(hydrate, 1600);
      }
    });
  }

  function scheduleMenuWarm() {
    const run = () => warmVisibleMenuLinks();
    if (window.matchMedia && window.matchMedia('(min-width: 768px)').matches) {
      run();
      return;
    }
    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 350 });
    } else {
      setTimeout(run, 100);
    }
  }

  function bindMenuScrollRoot() {
    const scrollRoot = document.querySelector(MENU_OVERLAY + ' ' + MENU_SCROLL);
    if (!scrollRoot || scrollRoot.dataset.rlMenuWarmBound) return;
    scrollRoot.dataset.rlMenuWarmBound = '1';

    let timer;
    scrollRoot.addEventListener(
      'scroll',
      () => {
        clearTimeout(timer);
        timer = setTimeout(warmVisibleMenuLinks, 70);
      },
      { passive: true }
    );
  }

  function observeMenuDrawer() {
    const overlay = document.querySelector(MENU_OVERLAY);
    if (!overlay || overlay.dataset.rlMenuWarmObserved) return;
    overlay.dataset.rlMenuWarmObserved = '1';

    const mo = new MutationObserver(() => {
      if (!menuOverlayOpen()) return;
      bindMenuScrollRoot();
      scheduleMenuWarm();
    });

    mo.observe(overlay, { attributes: true, attributeFilter: ['class'] });

    const panels = overlay.querySelector('[data-ref="menu-panels"]');
    if (panels) {
      mo.observe(panels, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
  }

  function cachePut(key, text) {
    if (!key || !text) return;
    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, text);
  }

  function linkPrefetch(url) {
    const key = cacheKey(url);
    if (!key || CACHE.has(key)) return;
    const attrKey = encodeURIComponent(key);
    if (document.querySelector('link[data-rl-plp-prefetch="' + attrKey + '"]')) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = url;
    link.setAttribute('data-rl-plp-prefetch', attrKey);
    document.head.appendChild(link);
  }

  function flushQueue() {
    while (activeFetches < MAX_CONCURRENT && queue.length) {
      const item = queue.shift();
      const url = item.url;
      const key = cacheKey(url);
      QUEUED.delete(key);
      if (!key || CACHE.has(key) || PREFETCHING.has(key)) continue;

      PREFETCHING.add(key);
      activeFetches += 1;
      fetch(url, { credentials: 'same-origin' })
        .then((res) => (res.ok ? res.text() : null))
        .then((text) => {
          if (text) cachePut(key, text);
        })
        .catch(() => {})
        .finally(() => {
          PREFETCHING.delete(key);
          activeFetches -= 1;
          flushQueue();
        });
    }
  }

  function enqueuePrefetch(url, priority, options) {
    const key = cacheKey(url);
    if (!key || CACHE.has(key) || PREFETCHING.has(key) || QUEUED.has(key)) return;
    if (options && options.skipOnWeak && weakNetwork) return;

    if (options && options.hint) {
      linkPrefetch(url);
    }

    queue.push({ url, priority: Number(priority) || 0 });
    queue.sort((a, b) => b.priority - a.priority);
    QUEUED.add(key);
    flushQueue();
  }

  function isChipVisible(a) {
    const scroller = a.closest('[data-collection-plp-brand-scroller]');
    if (!scroller) return true;
    const chip = a.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    return chip.right > box.left - 40 && chip.left < box.right + 40;
  }

  function warmNeighbors() {
    const active = document.querySelector(
      '[data-collection-plp-subcollection-chips] a.collection-plp-brand-chips__chip.is-active, [data-collection-plp-brand-chips] a.collection-plp-brand-chips__chip.is-active'
    );
    if (!active) return;

    const items = active.closest('ul')?.querySelectorAll('a.collection-plp-brand-chips__chip[href]');
    if (!items) return;
    const list = [...items];
    const idx = list.indexOf(active);
    [-2, -1, 1, 2].forEach((offset) => {
      const neighbor = list[idx + offset];
      if (neighbor && !neighbor.classList.contains('is-active')) {
        enqueuePrefetch(neighbor.href, 30, { hint: true });
      }
    });
  }

  function warmVisibleChips() {
    allChipLinks().forEach((a) => {
      if (a.classList.contains('is-active')) return;
      if (!isChipVisible(a)) return;
      enqueuePrefetch(a.href, 20, { hint: true });
    });
  }

  function isLinkRenderedVisible(a) {
    if (!(a instanceof Element)) return false;
    const rect = a.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(a);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  }

  function warmHeaderCollectionLinks() {
    if (weakNetwork) return;
    if (!window.matchMedia || !window.matchMedia('(min-width: 768px)').matches) return;
    allHeaderCollectionLinks().forEach((a) => {
      const path = normPath(a.href);
      if (path === normPath(window.location.href)) return;
      if (!isLinkRenderedVisible(a)) return;
      enqueuePrefetch(a.href, 24, { hint: true });
    });
  }

  function warmHiddenChipsIdle() {
    if (IDLE_LIMIT <= 0) return;
    if (idleScheduled) return;
    const isDesktop = window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
    const idleLimit = isDesktop ? IDLE_LIMIT : Math.min(IDLE_LIMIT, 4);
    if (!isDesktop && weakNetwork) return;
    idleScheduled = true;

    const run = function () {
      idleScheduled = false;
      let queued = 0;
      const links = allChipLinks();
      for (let i = 0; i < links.length; i += 1) {
        if (queued >= idleLimit) break;
        const a = links[i];
        if (a.classList.contains('is-active') || isChipVisible(a)) continue;
        enqueuePrefetch(a.href, 4, { skipOnWeak: true });
        queued += 1;
      }
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 2200 });
    } else {
      setTimeout(run, 900);
    }
  }

  function replaceFromDoc(selector, doc) {
    const current = document.querySelector(selector);
    const incoming = doc.querySelector(selector);
    if (!current || !incoming) return false;
    current.replaceWith(incoming);
    return true;
  }

  function syncSeoBlock(doc) {
    const wrap = document.querySelector('.main-collection');
    if (!wrap) return;
    const current = wrap.querySelector('.main-collection__inner--seo');
    const incoming = doc.querySelector('.main-collection__inner--seo');
    if (incoming && current) current.replaceWith(incoming);
    else if (incoming && !current) wrap.appendChild(incoming);
    else if (!incoming && current) current.remove();
  }

  function validateIncomingCollectionDoc(doc) {
    if (!doc?.body?.classList.contains('template-collection')) return false;
    const incomingMain = doc.querySelector('#main-content');
    if (!incomingMain) return false;
    if (!incomingMain.querySelector('[data-ref="main-collection-results-root"]')) return false;
    if (!incomingMain.querySelector('[data-ref="main-collection"], .main-collection')) return false;
    return true;
  }

  function captureHomeSnapshots() {
    if (homeSnapshots) return;
    const main = document.querySelector('#main-content');
    if (!main) return;

    const mainClone = main.cloneNode(true);
    mainClone.classList.remove('rl-collection-nav-loading');
    mainClone.removeAttribute('aria-busy');

    const bodyClass = document.body.className
      .split(/\s+/)
      .filter((name) => name && name !== 'overflow-hidden')
      .join(' ');

    homeSnapshots = {
      main: mainClone,
      bodyClass,
    };
  }

  function cleanupTransientNavigationState() {
    setPageNavLoading(false);
    setLoading(false);
    document.body.classList.remove('overflow-hidden');

    document.querySelectorAll('filters-sheet-component.is-open').forEach((sheet) => {
      sheet.classList.remove('is-open');
    });

    document.querySelectorAll('.filters-sheet__overlay').forEach((overlay) => {
      overlay.setAttribute('hidden', '');
      if (overlay.parentElement === document.body) {
        overlay.remove();
      }
    });

    document.querySelectorAll('.filters-sheet__panel.is-visible').forEach((panel) => {
      panel.classList.remove('is-visible');
    });

    closeMobileMenuForNavigation();
  }

  function clearHomeInitMarkers(scope) {
    if (!scope) return;
    scope.querySelectorAll('[data-rl-home-init]').forEach((el) => {
      delete el.dataset.rlHomeInit;
    });
  }

  function rerunInlineScripts(scope) {
    if (!scope) return;
    scope.querySelectorAll('script:not([src])').forEach((oldScript) => {
      const script = document.createElement('script');
      if (oldScript.type) script.type = oldScript.type;
      script.text = oldScript.textContent;
      oldScript.replaceWith(script);
    });
  }

  function reinitHomeSurface() {
    const main = document.querySelector('#main-content');
    if (!main) return;

    clearHomeInitMarkers(main);
    rerunInlineScripts(main);
    document.dispatchEvent(new CustomEvent('rl:home-restored', { bubbles: true }));
  }

  function restoreHomeFromSnapshot() {
    if (!homeSnapshots?.main) {
      cleanupTransientNavigationState();
      window.location.assign(Theme.routes?.root || '/');
      return false;
    }

    const currentMain = document.querySelector('#main-content');
    if (!currentMain) {
      cleanupTransientNavigationState();
      window.location.assign(Theme.routes?.root || '/');
      return false;
    }

    cleanupTransientNavigationState();

    const restoredMain = homeSnapshots.main.cloneNode(true);
    restoredMain.classList.remove('rl-collection-nav-loading');
    restoredMain.removeAttribute('aria-busy');

    currentMain.replaceWith(restoredMain);
    document.body.className = homeSnapshots.bodyClass;
    Theme.template.name = 'index';
    restoreHomeHeaderChrome();
    reinitHomeSurface();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    publishChipNavPageView();
    return true;
  }

  function deriveAssetsBase() {
    const chipNav = document.querySelector('script[src*="rl-collection-chip-nav.js"]');
    if (chipNav?.src) {
      return chipNav.src.replace(/rl-collection-chip-nav\.js(\?v=[^&]+)?(\?.*)?$/, '');
    }
    const headerJs = document.querySelector('script[src*="header.js"]');
    if (headerJs?.src) {
      return headerJs.src.replace(/header\.js(\?v=[^&]+)?(\?.*)?$/, '');
    }
    return null;
  }

  function themeAssetSrc(assetFile) {
    const script = document.querySelector(`script[src*="/${assetFile}"]`);
    if (script?.src) return script.src;
    const link = document.querySelector(`link[href*="/${assetFile}"]`);
    if (link?.href) return link.href;
    const base = deriveAssetsBase();
    if (base) {
      const versionMatch = (document.querySelector('script[src*="rl-collection-chip-nav.js"]')?.src || '').match(/[?&]v=([^&]+)/);
      const version = versionMatch ? `?v=${versionMatch[1]}` : '';
      return `${base}${assetFile}${version}`;
    }
    return null;
  }

  function ensureStylesheet(assetFile) {
    if (document.querySelector(`link[href*="/${assetFile}"]`)) return;
    const href = themeAssetSrc(assetFile);
    if (!href) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.media = 'all';
    document.head.appendChild(link);
  }

  function ensureScript(assetFile) {
    if (document.querySelector(`script[src*="/${assetFile}"]`)) {
      return Promise.resolve();
    }
    const src = themeAssetSrc(assetFile);
    if (!src) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`failed to load ${assetFile}`));
      document.head.appendChild(script);
    });
  }

  function importThemeModule(assetFile) {
    const src = themeAssetSrc(assetFile);
    if (!src) return Promise.resolve();
    return import(src);
  }

  function hasSliderSurface() {
    return Boolean(document.querySelector('slider-component, .splide, [data-ref="main-slider"]'));
  }

  function ensureCollectionModules() {
    if (collectionModulesPromise) return collectionModulesPromise;

    collectionModulesPromise = (async () => {
      ensureStylesheet('base-plp.css');
      ensureStylesheet('collection-plp-seo-readmore.css');

      await Promise.all([
        ensureScript('rl-search-grid-perf.js'),
        ensureScript('rl-product-image-preload.js'),
        importThemeModule('product-card.js'),
        importThemeModule('product-price.js'),
        importThemeModule('filter-and-sort.js'),
        importThemeModule('filter.js'),
        importThemeModule('filters-sheet.js'),
        importThemeModule('sort.js'),
      ]);

      if (hasSliderSurface()) {
        await importThemeModule('splide.js');
        await importThemeModule('slider.js');
      }
    })().catch(() => {
      collectionModulesPromise = null;
    });

    return collectionModulesPromise;
  }

  function replaceMainContentFromDoc(doc) {
    const currentMain = document.querySelector('#main-content');
    const incomingMain = doc.querySelector('#main-content');
    if (!currentMain || !incomingMain) return false;
    currentMain.replaceChildren(...incomingMain.cloneNode(true).childNodes);
    return true;
  }

  function setPageNavLoading(on) {
    const main = document.querySelector('#main-content');
    if (!main) return;
    main.classList.toggle('rl-collection-nav-loading', on);
    if (on) main.setAttribute('aria-busy', 'true');
    else main.removeAttribute('aria-busy');
  }

  function setLoading(on) {
    document.querySelector('.main-collection')?.classList.toggle('main-collection--chip-loading', on);
  }

  function applyDocumentTitle(doc) {
    const title = doc.querySelector('title');
    if (title?.textContent) document.title = title.textContent;
  }

  // The header group is kept across the home → collection swap, so its
  // homepage-only overlay classes have to be dropped: `header--transparent`
  // pulls the header out of flow and the logo then paints over the PLP title.
  function applyCollectionHeaderChrome() {
    const header = document.querySelector('header-component');
    if (!header?.classList.contains('header--transparent')) return;

    homeHeaderChrome = {
      className: header.className,
      stickyState: header.getAttribute('data-sticky-state'),
    };
    header.classList.remove('header--transparent');
    Array.from(header.classList)
      .filter((name) => name.startsWith('color-scheme-'))
      .forEach((name) => header.classList.remove(name));
    header.removeAttribute('data-sticky-state');
  }

  function restoreHomeHeaderChrome() {
    if (!homeHeaderChrome) return;
    const header = document.querySelector('header-component');
    if (header) {
      header.className = homeHeaderChrome.className;
      if (homeHeaderChrome.stickyState) {
        header.setAttribute('data-sticky-state', homeHeaderChrome.stickyState);
      }
    }
    homeHeaderChrome = null;
  }

  function markCollectionTemplate() {
    Theme.template.name = 'collection';
    document.body.classList.remove('template-index');
    document.body.classList.add('template-collection');
    applyCollectionHeaderChrome();
  }

  function reinitCollectionSurface() {
    initBrandScroller(document);
    bindDeferredSubcollectionChips(document);
    boostAboveFoldChipImages(document);
    initScrollWarm();
    initObservers();
    warmNeighbors();
    warmVisibleChips();
    warmHiddenChipsIdle();
    warmHeaderCollectionLinks();
    document.dispatchEvent(new Event('rl:collection-results-updated'));
  }

  function updateChips(url) {
    document.querySelectorAll(CHIP).forEach((a) => {
      const active = chipMatchesUrl(a.href, url);
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    warmNeighbors();
    warmVisibleChips();
    warmHiddenChipsIdle();
  }

  function initBrandScroller(scope) {
    const root = scope || document;
    root.querySelectorAll('[data-collection-plp-brand-scroller]').forEach((el) => {
      if (el.dataset.rlPlpBrandInit) return;
      el.dataset.rlPlpBrandInit = '1';

      function overflows() {
        return el.scrollWidth > el.clientWidth + 2;
      }

      el.addEventListener(
        'wheel',
        function (e) {
          if (!overflows()) return;
          const dx = e.deltaX;
          const dy = e.deltaY;
          if (Math.abs(dx) < Math.abs(dy) && !e.shiftKey) return;
          e.preventDefault();
          el.scrollLeft += dx || dy;
        },
        { passive: false }
      );

      let pid;
      let down;
      let sx;
      let ss;
      let moved;
      let dragChip;
      let captured;

      el.addEventListener(
        'dragstart',
        function (e) {
          if (e.target.closest('a.collection-plp-brand-chips__chip, img')) e.preventDefault();
        },
        true
      );

      el.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        if (!overflows()) return;
        down = true;
        moved = false;
        captured = false;
        dragChip = e.target.closest('a.collection-plp-brand-chips__chip[href]');
        sx = e.clientX;
        ss = el.scrollLeft;
        pid = e.pointerId;
      });

      el.addEventListener('pointermove', function (e) {
        if (!down || e.pointerId !== pid) return;
        const dx = e.clientX - sx;
        if (Math.abs(dx) <= 8) return;
        if (!moved) {
          moved = true;
          el.classList.add('is-dragging');
          if (dragChip) dragChip.classList.add('is-dragging');
          try {
            el.setPointerCapture(pid);
            captured = true;
          } catch (_) {}
        }
        e.preventDefault();
        el.scrollLeft = ss - dx;
      });

      function end(e) {
        if (!down || e.pointerId !== pid) return;
        down = false;
        el.classList.remove('is-dragging');
        if (dragChip) dragChip.classList.remove('is-dragging');
        if (captured) {
          try {
            el.releasePointerCapture(pid);
          } catch (_) {}
        }
        if (moved) {
          const dragChipRef = dragChip;
          const eat = function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            el.removeEventListener('click', eat, true);
            if (dragChipRef) dragChipRef.removeEventListener('click', eat, true);
          };
          el.addEventListener('click', eat, true);
          if (dragChipRef) dragChipRef.addEventListener('click', eat, true);
        }
        dragChip = null;
        captured = false;
      }

      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });
  }

  async function fetchCollectionHtml(url, signal) {
    const key = cacheKey(url);
    let html = CACHE.get(key);
    if (!html) {
      const res = await fetch(url, { signal, credentials: 'same-origin' });
      if (!res.ok) throw new Error('fetch failed');
      html = await res.text();
      cachePut(key, html);
    }
    return html;
  }

  async function navigateFromHome(url, push) {
    if (!canPartialSwapFromHome() || !isSafeCollectionNavUrl(url)) {
      window.location.assign(url);
      return;
    }

    const key = cacheKey(url);
    abortCtrl?.abort();
    abortCtrl = new AbortController();
    captureHomeSnapshots();
    setPageNavLoading(true);

    try {
      const html = await fetchCollectionHtml(url, abortCtrl.signal);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (!validateIncomingCollectionDoc(doc)) {
        throw new Error('invalid collection document');
      }

      await ensureCollectionModules();
      if (!replaceMainContentFromDoc(doc)) {
        throw new Error('main content swap failed');
      }

      markCollectionTemplate();
      applyDocumentTitle(doc);
      reinitCollectionSurface();

      if (push !== false) {
        history.pushState({ rlChipNav: key, rlFromHome: true }, '', url);
      }
      publishChipNavPageView();
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    } catch (err) {
      if (err.name !== 'AbortError') window.location.assign(url);
    } finally {
      setPageNavLoading(false);
    }
  }

  async function navigate(url, push, source) {
    if (canPartialSwapFromHome()) {
      if (source === 'menu') {
        return navigateFromHome(url, push);
      }
      window.location.assign(url);
      return;
    }

    if (!canPartialSwap()) {
      window.location.assign(url);
      return;
    }

    const key = cacheKey(url);
    abortCtrl?.abort();
    abortCtrl = new AbortController();
    setLoading(true);

    try {
      const html = await fetchCollectionHtml(url, abortCtrl.signal);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (!validateIncomingCollectionDoc(doc)) {
        throw new Error('invalid collection document');
      }

      if (source === 'header' || source === 'brand' || source === 'menu') {
        replaceFromDoc('.collection-plp-header', doc);
        initBrandScroller(document);
        bindDeferredSubcollectionChips(document);
        boostAboveFoldChipImages(document);
      } else {
        replaceFromDoc('.collection-plp-header__title-block', doc);
      }
      replaceFromDoc('[data-ref="main-collection-results-root"]', doc);
      syncSeoBlock(doc);
      replaceFromDoc('.shopify-section-collection-plp-seo-readmore', doc);
      document.dispatchEvent(new Event('rl:collection-results-updated'));

      applyDocumentTitle(doc);

      updateChips(url);
      warmHeaderCollectionLinks();
      if (push !== false) history.pushState({ rlChipNav: key }, '', url);
      publishChipNavPageView();
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    } catch (err) {
      if (err.name !== 'AbortError') window.location.assign(url);
    } finally {
      setLoading(false);
    }
  }

  function initObservers() {
    const scroller = document.querySelector(SCROLLER);
    if (!scroller || scroller.dataset.rlChipIoBound || !('IntersectionObserver' in window)) return;
    scroller.dataset.rlChipIoBound = '1';

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const a = entry.target.closest('a.collection-plp-brand-chips__chip[href]');
          if (a && !a.classList.contains('is-active')) {
            enqueuePrefetch(a.href, 22, { hint: true });
          }
        });
      },
      { root: scroller, rootMargin: '72px', threshold: 0.01 }
    );
    allChipLinks().forEach((a) => io.observe(a));
  }

  function initScrollWarm() {
    const scroller = document.querySelector(SCROLLER);
    if (!scroller || scroller.dataset.rlScrollWarmBound) return;
    scroller.dataset.rlScrollWarmBound = '1';
    let scrollTimer;
    scroller.addEventListener(
      'scroll',
      () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          warmVisibleChips();
          warmHiddenChipsIdle();
        }, 70);
      },
      { passive: true }
    );
  }

  function bindSneakersBranchIntent() {
    const warm = () => warmSneakersBranchOnIntent();
    document.addEventListener('pointerenter', (e) => {
      if (e.target instanceof Element && e.target.closest(SNEAKERS_PANEL_TARGET)) warm();
    }, true);
    document.addEventListener('pointerdown', (e) => {
      if (e.target instanceof Element && e.target.closest(SNEAKERS_PANEL_TARGET)) warm();
    }, true);
    document.addEventListener('touchstart', (e) => {
      if (e.target instanceof Element && e.target.closest(SNEAKERS_PANEL_TARGET)) warm();
    }, { capture: true, passive: true });
  }

  document.addEventListener(
    'pointerenter',
    (e) => {
      const target = getNavTarget(e.target);
      if (target) enqueuePrefetch(target.anchor.href, 28, { hint: true });
    },
    true
  );

  document.addEventListener(
    'focusin',
    (e) => {
      const target = getNavTarget(e.target);
      if (target) enqueuePrefetch(target.anchor.href, 28, { hint: true });
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = getNavTarget(e.target);
      if (target) enqueuePrefetch(target.anchor.href, 36, { hint: true });
    },
    true
  );

  document.addEventListener(
    'click',
    (e) => {
      const target = getNavTarget(e.target);
      if (!target) return;

      const path = normPath(target.anchor.href);
      const partialFromHome = canPartialSwapFromHome() && target.source === 'menu';

      if ((target.source === 'header' || target.source === 'menu') && !canPartialSwap() && !partialFromHome) {
        return;
      }

      if (target.source === 'header' && canPartialSwapFromHome()) {
        return;
      }

      if (target.source === 'menu' && !isSafeCollectionNavUrl(target.anchor.href)) {
        return;
      }

      if (target.source === 'menu' || target.source === 'header') {
        closeMobileMenuForNavigation();
      }

      e.preventDefault();
      e.stopImmediatePropagation();
      navigate(target.anchor.href, true, target.source);
    },
    true
  );

  window.addEventListener('popstate', () => {
    if (isHomePath(window.location.href)) {
      if (Theme.template?.name === 'collection' && homeSnapshots) {
        closeMobileMenuForNavigation();
        restoreHomeFromSnapshot();
      }
      return;
    }

    if (!canPartialSwap()) {
      if (canPartialSwapFromHome() && isSafeCollectionNavUrl(window.location.href)) {
        closeMobileMenuForNavigation();
        navigateFromHome(window.location.href, false);
      }
      return;
    }

    if (
      document.querySelector('[data-collection-plp-subcollection-chips]') ||
      document.querySelector('[data-collection-plp-brand-chips]') ||
      document.querySelector(HEADER_COLLECTION_LINK)
    ) {
      closeMobileMenuForNavigation();
      navigate(window.location.href, false, 'header');
    }
  });

  function scheduleHeaderPrefetch() {
    const run = function () {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(warmHeaderCollectionLinks, { timeout: 2400 });
      } else {
        setTimeout(warmHeaderCollectionLinks, 1200);
      }
    };
    if (document.readyState === 'complete') {
      run();
    } else {
      window.addEventListener('load', run, { once: true });
    }
  }

  function init() {
    window.addEventListener('pageshow', () => {
      const main = document.querySelector('#main-content');
      if (main?.classList.contains('rl-collection-nav-loading') && Theme.template?.name === 'index') {
        cleanupTransientNavigationState();
      }
    });

    observeMenuDrawer();
    bindSneakersBranchIntent();
    scheduleHeaderPrefetch();

    document.addEventListener(
      'rl:drawer-intent',
      () => {
        warmRootMenuLinksOnIntent();
      },
      { passive: true }
    );

    if (document.querySelector(CHIP)) {
      initBrandScroller(document);
      bindDeferredSubcollectionChips(document);
      boostAboveFoldChipImages(document);

      const deferChipPrefetch = function () {
        warmNeighbors();
        warmVisibleChips();
        warmHiddenChipsIdle();
        initScrollWarm();
        initObservers();
      };

      const isDesktop = window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
      const deferCatalogPrefetch = isCatalogChipPage();

      if (isDesktop && !weakNetwork && !deferCatalogPrefetch) {
        deferChipPrefetch();
      } else {
        document.addEventListener('pointerdown', deferChipPrefetch, { once: true, passive: true });
        document.addEventListener(
          'scroll',
          function () {
            deferChipPrefetch();
          },
          { once: true, passive: true }
        );
        if ('requestIdleCallback' in window) {
          requestIdleCallback(deferChipPrefetch, { timeout: deferCatalogPrefetch ? 10000 : 8000 });
        } else {
          setTimeout(deferChipPrefetch, deferCatalogPrefetch ? 8000 : 6000);
        }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
