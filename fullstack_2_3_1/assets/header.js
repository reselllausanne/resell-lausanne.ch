const MENU_PANEL_ANIM_MS = 180;

class HeaderComponent extends HTMLElement {
  #scrollHandler = null;

  constructor() {
    super();

    this.menuToggles = [];
    this.activeMenuToggle = null;
    this.menuClose = null;
    this.menuToolbarBack = null;
    this.menuToolbarBackLabel = null;
    this.menuToolbarTitle = null;
    this.mobileMenuOverlay = null;
    this.mobileMenu = null;
    this.mobileMenuPanels = null;
    this.activeMenuPanel = null;
    this.panelScrollPositions = new Map();
    this.hasDrawerIntentPrepared = false;
    this.hydratedMenuBranches = new Set();
    this.handlePanelTargetClickBound = this.#handlePanelTargetClick.bind(this);
    this.handlePanelBackClickBound = this.#handlePanelBackClick.bind(this);
    this.handleMenuLinkClickBound = this.#handleMenuLinkClick.bind(this);
    this.handleDrawerIntentBound = this.prepareMobileMenuIntent.bind(this);
  }

  connectedCallback() {
    this.menuToggles = Array.from(this.querySelectorAll('[data-ref="menu-toggle"]'));
    this.menuClose = this.querySelector('[data-ref="menu-close"]');
    this.menuToolbarBack = this.querySelector('[data-ref="menu-toolbar-back"]');
    this.menuToolbarBackLabel = this.querySelector('[data-ref="menu-toolbar-back-label"]');
    this.menuToolbarTitle = this.querySelector('[data-ref="menu-toolbar-title"]');
    this.mobileMenuOverlay = this.querySelector('[data-ref="mobile-menu-overlay"]');
    this.mobileMenu = this.querySelector('[data-ref="mobile-menu"]');
    this.mobileMenuPanels = this.querySelector('[data-ref="menu-panels"]');
    this.activeMenuPanel = this.mobileMenuPanels?.querySelector('.header__mobile-menu-panel.is-active') || null;

    this.menuToggles.forEach((toggle) => {
      toggle.addEventListener('click', this.#handleMenuOpen);
      toggle.addEventListener('pointerenter', this.handleDrawerIntentBound, { passive: true });
      toggle.addEventListener('pointerdown', this.handleDrawerIntentBound, { passive: true });
      toggle.addEventListener('touchstart', this.handleDrawerIntentBound, { passive: true });
      toggle.addEventListener('focus', this.handleDrawerIntentBound);
    });

    if (this.menuClose) {
      this.menuClose.addEventListener('click', this.#handleMenuClose);
    }

    if (this.mobileMenuOverlay) {
      this.mobileMenuOverlay.addEventListener('click', this.#handleOverlayClick);
    }

    if (this.mobileMenu) {
      this.mobileMenu.addEventListener('click', this.handlePanelTargetClickBound);
      this.mobileMenu.addEventListener('click', this.handlePanelBackClickBound);
      this.mobileMenu.addEventListener('click', this.handleMenuLinkClickBound);
    }

    document.addEventListener('keydown', this.#handleKeyDown);
    this.#initStickyObserver();
  }

  disconnectedCallback() {
    this.menuToggles.forEach((toggle) => {
      toggle.removeEventListener('click', this.#handleMenuOpen);
      toggle.removeEventListener('pointerenter', this.handleDrawerIntentBound);
      toggle.removeEventListener('pointerdown', this.handleDrawerIntentBound);
      toggle.removeEventListener('touchstart', this.handleDrawerIntentBound);
      toggle.removeEventListener('focus', this.handleDrawerIntentBound);
    });

    if (this.menuClose) {
      this.menuClose.removeEventListener('click', this.#handleMenuClose);
    }

    if (this.mobileMenuOverlay) {
      this.mobileMenuOverlay.removeEventListener('click', this.#handleOverlayClick);
    }

    if (this.mobileMenu) {
      this.mobileMenu.removeEventListener('click', this.handlePanelTargetClickBound);
      this.mobileMenu.removeEventListener('click', this.handlePanelBackClickBound);
      this.mobileMenu.removeEventListener('click', this.handleMenuLinkClickBound);
    }

    document.removeEventListener('keydown', this.#handleKeyDown);
    this.#cleanupStickyObserver();
  }

  prepareMobileMenuIntent() {
    if (this.hasDrawerIntentPrepared) {
      return;
    }
    this.hasDrawerIntentPrepared = true;

    this.#hydrateLegacyDeferredPanels();
    this.#preloadDrawerHeroOnIntent();
    this.#boostVisibleMenuThumbs(this.#rootMenuPanel(), 8);
    document.dispatchEvent(new CustomEvent('rl:drawer-intent'));
  }

  #handleMenuOpen = (event) => {
    this.activeMenuToggle = event.currentTarget;
    this.openMobileMenu();
  };

  #handleMenuClose = () => {
    this.closeMobileMenu();
  };

  #handleOverlayClick = (event) => {
    if (event.target === this.mobileMenuOverlay) {
      this.closeMobileMenu();
    }
  };

  #handleKeyDown = (event) => {
    if (event.key !== 'Escape' || !this.mobileMenuOverlay.classList.contains('is-open')) {
      return;
    }

    const depth = parseInt(this.activeMenuPanel?.getAttribute('data-panel-depth') || '0', 10);
    if (depth > 0) {
      event.preventDefault();
      this.menuToolbarBack?.click();
      return;
    }

    this.closeMobileMenu();
  };

  openMobileMenu() {
    const isProductPage =
      (typeof Theme !== 'undefined' && Theme.template && Theme.template.name === 'product') ||
      document.querySelector('sticky-add-to-cart');
    if (isProductPage) {
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event('scroll'));
    }

    if (!this.hasDrawerIntentPrepared) {
      this.prepareMobileMenuIntent();
    }

    this.#resetMenuPanels();
    this.#resetMenuScroll();

    this.mobileMenuOverlay.classList.remove('is-closing');
    this.mobileMenuOverlay.classList.add('is-open');
    document.body.classList.add('overflow-hidden');
    this.menuToggles.forEach((toggle) => toggle.setAttribute('aria-expanded', 'true'));

    this.#syncMenuToolbar(this.activeMenuPanel);
    this.#boostVisibleMenuThumbs(this.activeMenuPanel, 8);

    setTimeout(() => {
      this.menuClose?.focus();
    }, 150);
  }

  closeMobileMenu() {
    this.#resetMenuPanels();

    this.mobileMenuOverlay.classList.add('is-closing');

    setTimeout(() => {
      this.mobileMenuOverlay.classList.remove('is-open', 'is-closing');
      document.body.classList.remove('overflow-hidden');
      this.menuToggles.forEach((toggle) => toggle.setAttribute('aria-expanded', 'false'));
      this.activeMenuToggle?.focus();
    }, 125);
  }

  #handlePanelTargetClick(event) {
    if (!(event.target instanceof Element)) {
      return;
    }
    const targetButton = event.target.closest('[data-panel-target]');
    if (!targetButton || !this.mobileMenuPanels) {
      return;
    }

    event.preventDefault();
    const panelId = targetButton.getAttribute('data-panel-target');
    if (!panelId) {
      return;
    }

    const branch = this.#resolveMenuBranch(panelId);
    if (branch) {
      this.#hydrateMenuBranch(branch);
    }

    this.#switchMenuPanel(panelId, 'forward');
  }

  #handlePanelBackClick(event) {
    if (!(event.target instanceof Element)) {
      return;
    }
    const backButton = event.target.closest('[data-panel-back]');
    if (!backButton || !this.mobileMenuPanels || !this.activeMenuPanel) {
      return;
    }

    event.preventDefault();
    const parentPanelId = this.activeMenuPanel.getAttribute('data-parent-panel');
    if (!parentPanelId) {
      return;
    }
    this.#switchMenuPanel(parentPanelId, 'backward');
  }

  #handleMenuLinkClick(event) {
    if (!(event.target instanceof Element)) {
      return;
    }
    const link = event.target.closest('a[href]');
    if (!link || !this.mobileMenuOverlay || !this.mobileMenuOverlay.classList.contains('is-open')) {
      return;
    }

    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
      return;
    }

    this.closeMobileMenu();
  }

  #switchMenuPanel(nextPanelId, direction) {
    if (!this.mobileMenuPanels) {
      return;
    }

    const nextPanel = this.mobileMenuPanels.querySelector(`[data-panel-id="${nextPanelId}"]`);
    const currentPanel = this.activeMenuPanel;
    const menuScroll = this.querySelector('[data-ref="menu-scroll"]');

    if (!nextPanel || !currentPanel || nextPanel === currentPanel) {
      return;
    }

    if (menuScroll) {
      const currentPanelId = currentPanel.getAttribute('data-panel-id');
      if (currentPanelId) {
        this.panelScrollPositions.set(currentPanelId, menuScroll.scrollTop);
      }
    }

    const enteringClass = direction === 'backward' ? 'is-animating-in-left' : 'is-animating-in-right';
    const leavingClass = direction === 'backward' ? 'is-animating-out-right' : 'is-animating-out-left';
    const animClasses = ['is-animating-in-right', 'is-animating-out-left', 'is-animating-in-left', 'is-animating-out-right'];

    nextPanel.classList.remove(...animClasses);
    currentPanel.classList.remove(...animClasses);

    const skipBackwardAnimation = direction === 'backward';
    if (!skipBackwardAnimation) {
      nextPanel.classList.add(enteringClass);
      currentPanel.classList.add(leavingClass);
    }
    nextPanel.setAttribute('aria-hidden', 'false');
    nextPanel.removeAttribute('inert');
    nextPanel.style.pointerEvents = 'auto';

    const finalizePanelSwitch = () => {
      currentPanel.classList.remove('is-active', leavingClass, ...animClasses);
      currentPanel.style.willChange = '';
      currentPanel.setAttribute('aria-hidden', 'true');
      currentPanel.setAttribute('inert', '');
      currentPanel.style.pointerEvents = '';

      nextPanel.classList.remove(enteringClass);
      nextPanel.style.willChange = '';
      nextPanel.classList.add('is-active');
      nextPanel.setAttribute('aria-hidden', 'false');
      nextPanel.removeAttribute('inert');
      this.activeMenuPanel = nextPanel;
      this.#syncMenuToolbar(nextPanel);
      this.#boostVisibleMenuThumbs(nextPanel, 8);

      if (menuScroll) {
        const nextPanelSavedTop = this.panelScrollPositions.get(nextPanelId) || 0;
        menuScroll.scrollTo(0, nextPanelSavedTop);
      }
    };

    if (skipBackwardAnimation) {
      finalizePanelSwitch();
      return;
    }

    window.setTimeout(finalizePanelSwitch, MENU_PANEL_ANIM_MS);
  }

  #resolveMenuBranch(panelId) {
    if (!panelId || panelId === 'root') {
      return null;
    }

    const branchPrefixes = [
      ['selections', 'demo-selections'],
      ['sneakers', 'demo-sneakers'],
      ['streetwear', 'demo-streetwear'],
      ['active', 'demo-active'],
      ['chaussures', 'demo-chaussures'],
      ['collectibles', 'demo-collectibles'],
      ['misc', 'demo-wellness'],
      ['misc', 'demo-discover'],
      ['misc', 'demo-accessoires'],
    ];

    for (const [branch, prefix] of branchPrefixes) {
      if (panelId === prefix || panelId.startsWith(`${prefix}-`)) {
        return branch;
      }
    }

    return null;
  }

  #hydrateMenuBranch(branch) {
    if (!branch || this.hydratedMenuBranches.has(branch)) {
      return;
    }

    const template = this.querySelector(`template[data-menu-branch="${branch}"]`);
    const panels = this.querySelector('[data-ref="menu-panels"]');
    if (!template || !panels) {
      return;
    }

    panels.appendChild(template.content.cloneNode(true));
    template.remove();
    this.hydratedMenuBranches.add(branch);
  }

  #hydrateLegacyDeferredPanels() {
    const tpl = this.querySelector('template[data-ref="deferred-demo-panels"]');
    if (!tpl) {
      return;
    }
    const panels = this.querySelector('[data-ref="menu-panels"]');
    if (!panels) {
      return;
    }
    panels.appendChild(tpl.content.cloneNode(true));
    tpl.remove();
    this.activeMenuPanel = panels.querySelector('.header__mobile-menu-panel.is-active') || this.activeMenuPanel;
  }

  #preloadDrawerHeroOnIntent() {
    const heroSrc = this.mobileMenu?.getAttribute('data-drawer-hero-src');
    if (!heroSrc || document.querySelector('link[data-rl-drawer-hero-preload]')) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = heroSrc;
    link.setAttribute('data-rl-drawer-hero-preload', '');
    document.head.appendChild(link);
  }

  #rootMenuPanel() {
    return this.mobileMenuPanels?.querySelector('[data-panel-id="root"]') || null;
  }

  #boostVisibleMenuThumbs(panel, maxCount) {
    if (!panel || maxCount <= 0) {
      return;
    }

    let boosted = 0;
    panel.querySelectorAll('.header__mobile-menu-link-image').forEach((img) => {
      if (!(img instanceof HTMLImageElement) || boosted >= maxCount) {
        return;
      }
      img.loading = 'eager';
      img.decoding = 'async';
      if (boosted < 2 && 'fetchPriority' in img) {
        img.fetchPriority = 'low';
      }
      boosted += 1;
    });
  }

  #resetMenuScroll() {
    this.querySelector('[data-ref="menu-scroll"]')?.scrollTo(0, 0);
  }

  #resetMenuPanels() {
    if (!this.mobileMenuPanels) {
      return;
    }

    const panels = this.mobileMenuPanels.querySelectorAll('.header__mobile-menu-panel');
    const rootPanel = this.mobileMenuPanels.querySelector('[data-panel-id="root"]');

    panels.forEach((panel) => {
      panel.classList.remove(
        'is-active',
        'is-animating-in-right',
        'is-animating-out-left',
        'is-animating-in-left',
        'is-animating-out-right'
      );
      panel.style.willChange = '';
      panel.setAttribute('aria-hidden', 'true');
      panel.setAttribute('inert', '');
      panel.style.pointerEvents = '';
    });

    if (rootPanel) {
      rootPanel.classList.add('is-active');
      rootPanel.setAttribute('aria-hidden', 'false');
      rootPanel.removeAttribute('inert');
      this.activeMenuPanel = rootPanel;
      this.panelScrollPositions.clear();
      this.#resetMenuScroll();
      this.#syncMenuToolbar(rootPanel);
    }
  }

  #syncMenuToolbar(panel) {
    if (!panel || !this.menuToolbarBack) {
      return;
    }

    const depth = parseInt(panel.getAttribute('data-panel-depth') || '0', 10);
    const breadcrumb = panel.querySelector('.header__mobile-menu-breadcrumb');

    if (depth === 0) {
      this.menuToolbarBack.hidden = true;
      if (this.menuToolbarBackLabel) {
        this.menuToolbarBackLabel.textContent = '';
      }
      if (this.menuToolbarTitle) {
        this.menuToolbarTitle.hidden = true;
        this.menuToolbarTitle.textContent = '';
      }
      return;
    }

    const backLabel = breadcrumb?.querySelector('.header__mobile-menu-back-label');
    const panelTitle = breadcrumb?.querySelector('.header__mobile-menu-breadcrumb-title');

    this.menuToolbarBack.hidden = false;
    if (this.menuToolbarBackLabel) {
      this.menuToolbarBackLabel.textContent = backLabel?.textContent?.trim() || '';
    }
    if (this.menuToolbarTitle) {
      this.menuToolbarTitle.hidden = false;
      this.menuToolbarTitle.textContent = panelTitle?.textContent?.trim() || '';
    }
  }

  #initStickyObserver() {
    if (!this.classList.contains('header--transparent')) {
      return;
    }

    const sectionHeader = this.closest('.section-header');
    if (!sectionHeader) {
      return;
    }

    this.#scrollHandler = this.#throttle(() => {
      this.#checkStickyState(sectionHeader);
    }, 10);

    window.addEventListener('scroll', this.#scrollHandler, { passive: true });
    this.#checkStickyState(sectionHeader);
  }

  #checkStickyState(sectionHeader) {
    const isSticky = sectionHeader.getBoundingClientRect().top <= 0;
    this.dataset.stickyState = isSticky ? 'active' : 'inactive';
  }

  #throttle(func, limit) {
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  #cleanupStickyObserver() {
    if (this.#scrollHandler) {
      window.removeEventListener('scroll', this.#scrollHandler);
      this.#scrollHandler = null;
    }
  }
}

if (!customElements.get('header-component')) {
  customElements.define('header-component', HeaderComponent);
}
