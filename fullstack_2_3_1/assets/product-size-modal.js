(() => {
  if (window.__productSizeModalInitialized) return;
  window.__productSizeModalInitialized = true;

  const OPEN_BODY_CLASS = 'product-size-modal-open';
  const escSelector = (value) =>
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');

  const getOpenModal = () => document.querySelector('[data-size-modal][aria-hidden="false"]');

  const closeModal = (modal) => {
    if (!modal) return;

    const rawReturnFocusEl = modal.__lastFocusedElement;
    const sourceSelectionModal =
      rawReturnFocusEl instanceof HTMLElement ? rawReturnFocusEl.closest('[data-rs-size-modal]') : null;
    const sourceSelectionTrigger =
      sourceSelectionModal instanceof HTMLElement && sourceSelectionModal.id
        ? document.querySelector(`[data-rs-size-modal-open="${escSelector(sourceSelectionModal.id)}"]`)
        : null;

    let returnFocusEl = rawReturnFocusEl;
    if (
      sourceSelectionModal instanceof HTMLElement &&
      sourceSelectionModal.getAttribute('aria-hidden') === 'true' &&
      sourceSelectionTrigger instanceof HTMLElement
    ) {
      returnFocusEl = sourceSelectionTrigger;
    }

    const canRestoreFocus =
      returnFocusEl instanceof HTMLElement && document.contains(returnFocusEl) && !modal.contains(returnFocusEl);

    if (canRestoreFocus) {
      returnFocusEl.focus();
    }

    if (document.activeElement instanceof HTMLElement && modal.contains(document.activeElement)) {
      if (sourceSelectionTrigger instanceof HTMLElement && document.contains(sourceSelectionTrigger)) {
        sourceSelectionTrigger.focus();
      }
    }

    if (document.activeElement instanceof HTMLElement && modal.contains(document.activeElement)) {
      // Prevent aria-hidden + focused-descendant warning on close.
      document.activeElement.blur();
    }

    modal.setAttribute('aria-hidden', 'true');

    const openModal = getOpenModal();
    if (!openModal) {
      document.body.classList.remove(OPEN_BODY_CLASS);
    }

    if (canRestoreFocus && document.activeElement !== returnFocusEl) {
      returnFocusEl.focus();
    }
  };

  const openModal = (modal, trigger) => {
    if (!modal) return;

    const currentOpenModal = getOpenModal();
    if (currentOpenModal && currentOpenModal !== modal) {
      closeModal(currentOpenModal);
    }

    modal.__lastFocusedElement = trigger instanceof HTMLElement ? trigger : null;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add(OPEN_BODY_CLASS);

    const closeButton = modal.querySelector('[data-size-modal-close]');
    if (closeButton instanceof HTMLElement) {
      closeButton.focus();
    }
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-size-modal-open]');
    if (trigger) {
      event.preventDefault();
      const modalId = trigger.getAttribute('data-size-modal-open');
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
    closeModal(getOpenModal());
  });
})();
