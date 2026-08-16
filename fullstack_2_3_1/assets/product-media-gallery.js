import { ThemeEvents } from '@theme/events';

class ProductMediaGallery extends HTMLElement {
  #lightboxAbort = null;

  connectedCallback() {
    const closestSection = this.closest('.shopify-section, dialog');
    if (!closestSection) return;
    closestSection.addEventListener(ThemeEvents.variantUpdated, this.updateMediaGallery);
    this.#initLightbox();
  }

  disconnectedCallback() {
    const closestSection = this.closest('.shopify-section, dialog');
    if (!closestSection) return;
    closestSection.removeEventListener(ThemeEvents.variantUpdated, this.updateMediaGallery);
    this.#teardownLightbox();
  }

  updateMediaGallery = (event) => {
    const newMediaGallery = event.detail.data.html.querySelector('product-media-gallery');
    if (!newMediaGallery) return;

    if (this.innerHTML !== newMediaGallery.innerHTML) {
      this.#teardownLightbox();
      this.innerHTML = newMediaGallery.innerHTML;
      this.#initLightbox();
    }
  };

  #teardownLightbox() {
    this.#lightboxAbort?.abort();
    this.#lightboxAbort = null;
  }

  #initLightbox() {
    this.#teardownLightbox();

    const dialog = this.querySelector('.pdp-lightbox');
    if (!dialog) return;

    const img = dialog.querySelector('.pdp-lightbox__img');
    const closeBtn = dialog.querySelector('.pdp-lightbox__close');
    const prevBtn = dialog.querySelector('.pdp-lightbox__nav--prev');
    const nextBtn = dialog.querySelector('.pdp-lightbox__nav--next');
    if (!img) return;

    const abort = new AbortController();
    this.#lightboxAbort = abort;
    const { signal } = abort;

    let images = [];
    let currentIndex = 0;

    const uniq = (list) => {
      const seen = new Set();
      return list.filter((entry) => {
        if (!entry?.src || seen.has(entry.src)) return false;
        seen.add(entry.src);
        return true;
      });
    };

    const collectTriggerImages = () =>
      uniq(
        [...this.querySelectorAll('.pdp-lightbox-trigger')].map((t) => ({
          src: t.dataset.lightboxSrc,
          alt: t.dataset.lightboxAlt || '',
        })),
      );

    const updateNav = () => {
      const multi = images.length > 1;
      if (prevBtn) {
        prevBtn.hidden = !multi;
        prevBtn.setAttribute('aria-hidden', multi ? 'false' : 'true');
      }
      if (nextBtn) {
        nextBtn.hidden = !multi;
        nextBtn.setAttribute('aria-hidden', multi ? 'false' : 'true');
      }
    };

    const showAt = (index) => {
      if (!images.length) return;
      currentIndex = ((index % images.length) + images.length) % images.length;
      img.src = images[currentIndex].src;
      img.alt = images[currentIndex].alt;
      updateNav();
    };

    const open = (list, startIndex = 0) => {
      images = uniq(list);
      if (!images.length) return;
      showAt(startIndex);
      updateNav();
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    };

    this.querySelectorAll('.pdp-lightbox-trigger').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const list = collectTriggerImages();
          const start = Math.max(
            0,
            list.findIndex((entry) => entry.src === btn.dataset.lightboxSrc),
          );
          open(list, start);
        },
        { signal },
      );
    });

    // Click 360 (no drag) → lightbox with current frame + secondary gallery images.
    // Drag still spins; arrows only when ≥2 unique images.
    this.addEventListener(
      'spin360:tap',
      (event) => {
        const current = {
          src: event.detail?.src || '',
          alt: event.detail?.alt || '',
        };
        const gallery = uniq([current, ...collectTriggerImages()]);
        open(gallery, 0);
      },
      { signal },
    );

    prevBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      showAt(currentIndex - 1);
    }, { signal });

    nextBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      showAt(currentIndex + 1);
    }, { signal });

    closeBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      dialog.close();
    }, { signal });

    dialog.addEventListener(
      'click',
      (event) => {
        if (event.target === dialog) dialog.close();
      },
      { signal },
    );

    dialog.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') dialog.close();
        if (images.length <= 1) return;
        if (event.key === 'ArrowLeft') showAt(currentIndex - 1);
        if (event.key === 'ArrowRight') showAt(currentIndex + 1);
      },
      { signal },
    );
  }
}

if (!customElements.get('product-media-gallery')) {
  customElements.define('product-media-gallery', ProductMediaGallery);
}
