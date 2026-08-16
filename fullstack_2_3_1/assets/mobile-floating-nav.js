/* Bridges floating mobile nav clicks to existing theme drawers/triggers. */
(function () {
  if (window.__rlMobileFloatingNavInit) return;
  window.__rlMobileFloatingNavInit = true;

  const SELECTOR_NAV = '[data-rl-mobile-floating-nav]';

  function findFooterElement() {
    return (
      document.querySelector('#shopify-section-footer-group') ||
      document.querySelector('[id*="footer-group"]') ||
      document.querySelector('.shopify-section-group-footer-group') ||
      document.querySelector('footer')
    );
  }

  function findHeaderMenuToggle() {
    const headerComponent = document.querySelector('header-component');
    if (!headerComponent) return null;
    return headerComponent.querySelector('[data-ref="menu-toggle"]');
  }

  function findHeaderSearchToggle() {
    const scoped = document.querySelector('dialog-component.search-popup [data-ref="popup-toggle"]');
    if (scoped) return scoped;
    return document.querySelector('[data-ref="popup-toggle"]');
  }

  function getThemeRoutes() {
    try {
      // Theme is a script-scoped const in scripts.liquid, accessible by bare name.
      // eslint-disable-next-line no-undef
      return typeof Theme !== 'undefined' ? Theme.routes : null;
    } catch (_) {
      return null;
    }
  }

  function getLocalePrefixFromPath() {
    const match = window.location.pathname.match(/^\/([a-z]{2})(?:\/|$)/i);
    if (!match) return '';
    const locale = match[1].toLowerCase();
    if (locale === 'fr') return '';
    return `/${locale}`;
  }

  function getSearchPath() {
    const routes = getThemeRoutes();
    const rawPath = (routes && routes.search_url) || '/search';
    const localePrefix = getLocalePrefixFromPath();
    if (!localePrefix) return rawPath;
    if (rawPath === localePrefix || rawPath.startsWith(`${localePrefix}/`)) return rawPath;
    if (rawPath === '/search' || rawPath.startsWith('/search?')) return `${localePrefix}${rawPath}`;
    return rawPath;
  }

  function openMenu() {
    const toggle = findHeaderMenuToggle();
    if (toggle) {
      toggle.click();
      return true;
    }
    return false;
  }

  function isOnSearchPage() {
    if (document.body.classList.contains('template-search')) return true;
    if (document.querySelector('.main-search')) return true;
    const path = getSearchPath();
    const normalized = path.replace(/\/$/, '') || '/search';
    const current = window.location.pathname.replace(/\/$/, '') || '/';
    return current === normalized || current.endsWith(`${normalized}`);
  }

  function closeSearchPage() {
    if (window.history.length > 1) {
      window.history.back();
      return true;
    }
    const routes = getThemeRoutes();
    window.location.href = (routes && routes.root_url) || '/';
    return true;
  }

  function setSearchNavMode(nav, mode) {
    const btn = nav.querySelector('[data-rl-search-trigger], .rl-mobile-floating-nav__item--search');
    if (!btn) return;
    const isClose = mode === 'close';
    btn.setAttribute('data-rl-search-mode', isClose ? 'close' : 'open');
    btn.setAttribute('data-rl-action', isClose ? 'search-close' : 'search');
    btn.setAttribute('aria-label', isClose ? 'Close search' : 'Search');
  }

  function syncSearchNavMode(nav) {
    setSearchNavMode(nav, isOnSearchPage() ? 'close' : 'open');
  }

  function openSearch() {
    if (isOnSearchPage()) return true;
    const dialog = document.querySelector('dialog-component.search-popup');
    if (dialog && typeof dialog.open === 'function') {
      dialog.open();
      return true;
    }
    const toggle = findHeaderSearchToggle();
    if (toggle) {
      toggle.click();
      return true;
    }
    const url = getSearchPath();
    window.location.href = url;
    return true;
  }

  function openWishlist(fallbackUrl) {
    const drawer = document.querySelector('[data-ref="wishlist-drawer"]');
    if (drawer && typeof drawer.open === 'function') {
      drawer.open();
      return;
    }
    if (fallbackUrl) {
      window.location.href = fallbackUrl;
      return;
    }
    const bodyUrl = document.body?.dataset?.rlWishlistUrl;
    if (bodyUrl) {
      window.location.href = bodyUrl;
      return;
    }
    const localePrefix = getLocalePrefixFromPath();
    window.location.href = `${localePrefix}/pages/liste-de-souhaits`;
  }

  function syncCartCount(event) {
    const badges = document.querySelectorAll('[data-rl-cart-count]');
    if (!badges.length) return;

    let count = null;
    if (event?.detail?.data?.itemCount != null) {
      count = event.detail.data.itemCount;
    } else {
      const countEl = document.querySelector('[data-ref="cart-count"]');
      if (countEl) {
        const parsed = parseInt(countEl.textContent, 10);
        if (!Number.isNaN(parsed)) count = parsed;
      }
    }

    if (count == null) return;

    badges.forEach((b) => {
      b.textContent = String(count);
      b.setAttribute('data-rl-cart-count', String(count));
    });
  }

  function bindNav(nav) {
    if (nav.dataset.rlBound !== '1') {
      nav.dataset.rlBound = '1';
      nav.addEventListener('click', onNavClick);
    }
    syncSearchNavMode(nav);
    bindFooterVisibility(nav);
  }

  function bindFooterVisibility(nav) {
    if (nav.dataset.rlFooterWatchBound === '1') return;
    const footer = findFooterElement();
    if (!footer || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const isNearFooter = entries.some((entry) => entry.isIntersecting);
        nav.classList.toggle('rl-mobile-floating-nav--hidden-near-footer', isNearFooter);
      },
      {
        root: null,
        rootMargin: '0px 0px 140px 0px',
        threshold: 0,
      },
    );

    observer.observe(footer);
    nav.dataset.rlFooterWatchBound = '1';
  }

  function eventTargetElement(event) {
    const target = event && event.target;
    if (target instanceof Element) return target;
    if (target && target.parentElement instanceof Element) return target.parentElement;
    return null;
  }

  function onNavClick(event) {
      const nav = event.currentTarget;
      const clickTarget = eventTargetElement(event);
      const target = clickTarget ? clickTarget.closest('[data-rl-action]') : null;
      if (!target || !nav.contains(target)) return;
      const action = target.getAttribute('data-rl-action');

      switch (action) {
        case 'menu': {
          event.preventDefault();
          event.stopPropagation();
          if (!openMenu()) {
            console.warn('[rl-mobile-floating-nav] no menu toggle found');
          }
          break;
        }
        case 'search': {
          event.preventDefault();
          event.stopPropagation();
          if (!openSearch()) {
            console.warn('[rl-mobile-floating-nav] no search toggle found');
          }
          break;
        }
        case 'search-close': {
          event.preventDefault();
          event.stopPropagation();
          closeSearchPage();
          break;
        }
        case 'cart': {
          event.stopPropagation();
          break;
        }
        case 'wishlist': {
          event.stopPropagation();
          if (target.tagName === 'BUTTON') {
            event.preventDefault();
            openWishlist(target.getAttribute('data-rl-wishlist-url'));
          }
          break;
        }
        case 'account': {
          event.stopPropagation();
          break;
        }
        default:
          break;
      }
  }

  function init() {
    document.querySelectorAll(SELECTOR_NAV).forEach(bindNav);
    syncCartCount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('cart:updated', (event) => syncCartCount(event));
  document.addEventListener('shopify:section:load', init);
  document.addEventListener('shopify:section:reorder', init);
  window.addEventListener('popstate', init);
  document.addEventListener('rl:search-results-updated', init);
})();
