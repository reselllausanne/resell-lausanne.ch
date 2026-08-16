(() => {
  if (window.__productSizeModalInitialized) return;
  window.__productSizeModalInitialized = true;

  const OPEN_BODY_CLASS = 'product-size-modal-open';
  const escSelector = (value) =>
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');

  let scrollLockDepth = 0;
  let scrollLockY = 0;
  let mobileTouchLockHandler = null;
  let viewportListenersAttached = false;

  const setStableVh = () => {
    const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    const unit = `${h * 0.01}px`;
    document.documentElement.style.setProperty('--rs-stable-vh', unit);
    document.querySelectorAll('[data-size-modal][aria-hidden="false"]').forEach((el) => {
      el.style.setProperty('--rs-stable-vh', unit);
    });
  };

  const attachViewportListeners = () => {
    setStableVh();
    if (viewportListenersAttached) return;
    viewportListenersAttached = true;
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setStableVh);
      window.visualViewport.addEventListener('scroll', setStableVh);
    }
    window.addEventListener('resize', setStableVh);
    window.addEventListener('orientationchange', setStableVh);
  };

  const detachViewportListeners = () => {
    if (!viewportListenersAttached) return;
    // Size selector modal still owns viewport tracking while stacked.
    if (document.querySelector('[data-rs-size-modal][aria-hidden="false"]')) return;
    viewportListenersAttached = false;
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', setStableVh);
      window.visualViewport.removeEventListener('scroll', setStableVh);
    }
    window.removeEventListener('resize', setStableVh);
    window.removeEventListener('orientationchange', setStableVh);
  };

  const lockBackgroundScroll = () => {
    if (scrollLockDepth > 0) {
      scrollLockDepth += 1;
      return;
    }
    scrollLockDepth = 1;
    document.documentElement.classList.add(OPEN_BODY_CLASS);
    document.body.classList.add(OPEN_BODY_CLASS);

    const sizeSelectorOpen = document.querySelector('[data-rs-size-modal][aria-hidden="false"]');
    if (sizeSelectorOpen) return;

    scrollLockY = window.scrollY || window.pageYOffset || 0;

    if (window.innerWidth < 750) {
      mobileTouchLockHandler = (e) => {
        const target = e.target;
        const inScrollable =
          target &&
          typeof target.closest === 'function' &&
          target.closest('.product-size-modal__body');
        if (!inScrollable) e.preventDefault();
      };
      document.addEventListener('touchmove', mobileTouchLockHandler, { passive: false });
    } else {
      document.body.style.top = `-${scrollLockY}px`;
    }
  };

  const unlockBackgroundScroll = () => {
    if (scrollLockDepth === 0) return;
    scrollLockDepth -= 1;
    if (scrollLockDepth > 0) return;
    document.documentElement.classList.remove(OPEN_BODY_CLASS);
    document.body.classList.remove(OPEN_BODY_CLASS);

    const sizeSelectorStillOpen = document.querySelector('[data-rs-size-modal][aria-hidden="false"]');

    if (mobileTouchLockHandler) {
      document.removeEventListener('touchmove', mobileTouchLockHandler);
      mobileTouchLockHandler = null;
    } else if (!sizeSelectorStillOpen) {
      document.body.style.removeProperty('top');
      window.scrollTo(0, scrollLockY);
    }
  };

  const getOpenModal = () => document.querySelector('[data-size-modal][aria-hidden="false"]');

  const closeModal = (modal) => {
    if (!modal) return;

    const rawReturnFocusEl = modal.__lastFocusedElement;
    const sourceSelectionModal =
      rawReturnFocusEl instanceof HTMLElement ? rawReturnFocusEl.closest('[data-rs-size-modal]') : null;
    const sizeModalStillOpen =
      sourceSelectionModal instanceof HTMLElement &&
      sourceSelectionModal.getAttribute('aria-hidden') === 'false';

    let returnFocusEl = rawReturnFocusEl;
    if (!sizeModalStillOpen) {
      const sourceSelectionTrigger =
        sourceSelectionModal instanceof HTMLElement && sourceSelectionModal.id
          ? document.querySelector(`[data-rs-size-modal-open="${escSelector(sourceSelectionModal.id)}"]`)
          : null;
      if (
        sourceSelectionModal instanceof HTMLElement &&
        sourceSelectionModal.getAttribute('aria-hidden') === 'true' &&
        sourceSelectionTrigger instanceof HTMLElement
      ) {
        returnFocusEl = sourceSelectionTrigger;
      }
    }

    const canRestoreFocus =
      returnFocusEl instanceof HTMLElement && document.contains(returnFocusEl) && !modal.contains(returnFocusEl);

    modal.setAttribute('aria-hidden', 'true');

    if (!getOpenModal()) {
      unlockBackgroundScroll();
      detachViewportListeners();
    }

    if (canRestoreFocus) {
      returnFocusEl.focus();
    } else if (document.activeElement instanceof HTMLElement && modal.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  };

  const openModal = (modal, trigger) => {
    if (!modal) return;

    const currentOpenModal = getOpenModal();
    if (currentOpenModal && currentOpenModal !== modal) {
      closeModal(currentOpenModal);
    }

    modal.__lastFocusedElement = trigger instanceof HTMLElement ? trigger : null;

    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }

    modal.setAttribute('aria-hidden', 'false');
    attachViewportListeners();
    lockBackgroundScroll();

    const closeButton = modal.querySelector('[data-size-modal-close]');
    if (closeButton instanceof HTMLElement) {
      closeButton.focus();
    }
  };

  const hydrateTemplate = (modalId) => {
    const tpl = document.getElementById(modalId + '-tpl');
    if (tpl && tpl.tagName === 'TEMPLATE') {
      tpl.parentNode.insertBefore(tpl.content, tpl);
      tpl.remove();
    }
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-size-modal-open]');
    if (trigger) {
      event.preventDefault();
      const modalId = trigger.getAttribute('data-size-modal-open');
      if (modalId) hydrateTemplate(modalId);
      const modal = modalId ? document.getElementById(modalId) : null;
      openModal(modal, trigger);
      return;
    }

    const closeButton = event.target.closest('[data-size-modal-close]');
    if (closeButton) {
      event.preventDefault();
      closeModal(closeButton.closest('[data-size-modal]'));
      return;
    }

    const overlay = event.target.closest('[data-size-modal-overlay]');
    if (overlay) {
      event.preventDefault();
      closeModal(overlay.closest('[data-size-modal]'));
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openGuide = getOpenModal();
    if (!openGuide) return;
    event.stopPropagation();
    closeModal(openGuide);
  });
})();
