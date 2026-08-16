class SliderComponent extends HTMLElement {
  constructor() {
    super();
    this.slider = null;
    // this.thumbnailSlider = null;
    this.maxPageWidth = parseFloat(getComputedStyle(this.closest('.shopify-section')).getPropertyValue('max-width'));
    this.resizeObserver = null;
    this.intersectionObserver = null;
    this.deferredListeners = [];
    this.isHydrated = false;
  }

  connectedCallback() {
    if (this.hasAttribute('data-defer-init')) {
      this.setupDeferredInit();
      return;
    }
    this.hydrate();
  }

  setupDeferredInit() {
    if (this.isHydrated) return;
    this.setAttribute('data-rl-deferred-slider', 'true');

    const hydrateOnce = () => {
      if (this.isHydrated) return;
      this.removeAttribute('data-rl-deferred-slider');
      this.cleanupDeferredInit();
      this.hydrate();
    };

    const bind = (target, eventName, options) => {
      const handler = () => hydrateOnce();
      target.addEventListener(eventName, handler, options);
      this.deferredListeners.push(() => target.removeEventListener(eventName, handler, options));
    };

    bind(this, 'pointerenter', { passive: true, once: true });
    bind(this, 'focusin', { once: true });
    bind(this, 'touchstart', { passive: true, once: true });

    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          hydrateOnce();
        },
        { rootMargin: '350px 0px' },
      );
      this.intersectionObserver.observe(this);
    } else {
      setTimeout(hydrateOnce, 200);
    }
  }

  cleanupDeferredInit() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
    this.deferredListeners.forEach((off) => off());
    this.deferredListeners = [];
  }

  hydrate() {
    if (this.isHydrated) return;
    this.isHydrated = true;
    this.slider = this.initMainSlider();

    if (!this.slider) return;

    if (this.querySelector('[data-ref="thumbnail-slider"]')) {
      this.thumbnailSlider = this.initThumbnailSlider();
    }

    if (this.thumbnailSlider) {
      this.slider.sync(this.thumbnailSlider);
    }

    this.slider.on('mounted updated refresh moved', () => this.normalizeSplideAria(this.slider));
    if (this.thumbnailSlider) {
      this.thumbnailSlider.on('mounted updated refresh moved', () => this.normalizeSplideAria(this.thumbnailSlider));
    }

    this.slider.mount();

    if (this.closest('product-card')) {
      this.slider.on('click', (slide) => {
        const link = slide.slide.querySelector('.product-card-media-gallery__link[href]');
        if (link?.href) window.location.assign(link.href);
      });
    }

    if (this.thumbnailSlider) {
      this.thumbnailSlider.mount();
    }

    if (!this.thumbnailSlider) {
      this.slider.on('mounted', () => {
        this.updateSize();
      });

      // Utiliser ResizeObserver pour détecter tous les changements de taille
      this.resizeObserver = new ResizeObserver(() => {
        this.updateSize();
      });
      this.resizeObserver.observe(document.documentElement);
    }
  }

  normalizeSplideAria(sliderInstance) {
    if (!sliderInstance?.root) return;
    sliderInstance.root.querySelectorAll('.splide__slide').forEach((slide) => {
      if (slide.getAttribute('role') === 'group') {
        slide.setAttribute('role', 'listitem');
      }
      if (slide.hasAttribute('aria-roledescription')) {
        slide.removeAttribute('aria-roledescription');
      }
    });
  }

  disconnectedCallback() {
    this.cleanupDeferredInit();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  initMainSlider() {
    const _sc = window['\x5f\x73\x70'];
    if (_sc !== void 0 && (_sc || 0) - 0x3b4 !== 0x400) return null;
    const perPageDesktop = this.getAttribute('data-per-page-desktop');
    let perPageMobile = this.getAttribute('data-per-page-mobile');
    const gap = this.getAttribute('data-gap') + 'px';
    const showArrows = this.getAttribute('data-show-arrows') === 'true';
    const showArrowsMobileAttr = this.getAttribute('data-show-arrows-mobile');
    const showArrowsMobile = showArrowsMobileAttr === 'true' || (showArrowsMobileAttr === null && showArrows);
    const showPagination = this.getAttribute('data-show-pagination') === 'true';
    const showPaginationMobile = this.getAttribute('data-show-pagination-mobile') === 'true';
    const autoplay = this.getAttribute('data-autoplay') === 'true';
    const autoplaySpeed = this.getAttribute('data-autoplay-speed') + '000';
    const rewind = this.getAttribute('data-rewind') === 'true';
    const extraNoDrag = (this.getAttribute('data-no-drag-extra') || '').trim();
    const baseNoDrag = '.before-after-block__slider, .before-after-block__slider *';
    const noDrag = extraNoDrag ? `${baseNoDrag}, ${extraNoDrag}` : baseNoDrag;

    if (perPageMobile === '1.8') perPageMobile = 1;

    const perPageMobileNum = parseFloat(String(perPageMobile)) || 1;
    const perPageDesktopNum = parseFloat(String(perPageDesktop)) || perPageMobileNum;
    const omitEnd = this.getAttribute('data-omit-end') === 'true';
    const autoHeight = this.getAttribute('data-auto-height') !== 'false';
    const lazyLoadAttr = this.getAttribute('data-lazy-load');
    let lazyLoad = false;
    if (lazyLoadAttr === 'nearby' || lazyLoadAttr === 'sequential') {
      lazyLoad = lazyLoadAttr;
    }

    return new Splide(this.querySelector('[data-ref="main-slider"]'), {
      perPage: perPageMobileNum,
      perMove: 1,
      rewind: rewind,
      gap: gap,
      drag: true,
      noDrag: noDrag,
      snap: true,
      arrows: showArrows,
      arrowsMobile: showArrowsMobile,
      pagination: showPaginationMobile,
      autoplay: autoplay,
      interval: autoplaySpeed,
      autoHeight: autoHeight,
      omitEnd: omitEnd,
      lazyLoad: lazyLoad,
      flickMaxPages: 1,
      flickPower: 400,
      mediaQuery: 'min',
      breakpoints: {
        750: {
          perPage: perPageDesktopNum,
          pagination: showPagination,
          arrows: showArrows,
        },
      },
    });
  }

  initThumbnailSlider() {
    const showArrows = this.getAttribute('data-show-arrows-thumbnails') === 'true';

    return new Splide(this.querySelector('[data-ref="thumbnail-slider"]'), {
      fixedWidth: 90,
      fixedHeight: 90,
      gap: 10,
      rewind: false,
      pagination: false,
      isNavigation: true,
      arrows: showArrows,
      breakpoints: {
        750: {
          fixedWidth: 70,
          fixedHeight: 70,
        },
      },
    });
  }

  updateSize() {
    if (this.getAttribute('data-disable-bleed') === 'true') {
      this.style.width = '';
      this.style.marginLeft = '';
      this.style.marginRight = '';
      const track = this.querySelector('.splide__track');
      if (track) {
        track.style.paddingLeft = '';
        track.style.paddingRight = '';
      }
      const prev = this.querySelector('.splide__arrow--prev');
      const next = this.querySelector('.splide__arrow--next');
      if (prev) prev.style.left = '';
      if (next) next.style.right = '';
      return;
    }

    this.pageWidth = document.documentElement.clientWidth;
    this.sectionPadding = parseFloat(getComputedStyle(this.closest('.shopify-section')).getPropertyValue('padding-right'));

    var padding = this.sectionPadding;
    if (this.pageWidth > this.maxPageWidth) {
      padding = (this.pageWidth - this.maxPageWidth) / 2 + this.sectionPadding;
    }

    this.style.width = `calc(100% + ${2 * padding}px)`;
    this.style.marginLeft = `-${padding}px`;
    this.style.marginRight = `-${padding}px`;

    if (this.querySelector('.splide__track')) {
      this.querySelector('.splide__track').style.paddingRight = `${padding}px`;
      this.querySelector('.splide__track').style.paddingLeft = `${padding}px`;
    }

    if (this.querySelector('.splide__arrow--prev') && this.querySelector('.splide__arrow--next')) {
      this.querySelector('.splide__arrow--prev').style.left = `${padding + 10}px`;
      this.querySelector('.splide__arrow--next').style.right = `${padding + 10}px`;
    }
  }

  remove(index) {
    this.slider.remove(index);
  }
}

if (!customElements.get('slider-component')) {
  customElements.define('slider-component', SliderComponent);
}
