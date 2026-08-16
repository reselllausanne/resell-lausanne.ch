(() => {
  if (customElements.get('product-360-spin')) return;

  class Product360Spin extends HTMLElement {
    connectedCallback() {
      this.stage = this.querySelector('[data-spin-stage]');
      this.slider = this.querySelector('[data-spin-slider]');
      this.frames = this.#readFrames();
      this.cache = new Map();
      this.pointerId = null;
      this.lastX = 0;
      this.remainingDelta = 0;
      this.currentIndex = 0;
      this.stepPx = Math.max(6, Number.parseFloat(this.dataset.stepPx || '14'));
      this.fallbackSrc = this.dataset.fallbackSrc || this.stage?.currentSrc || this.stage?.src || '';

      if (!this.stage) return;
      this.stage.draggable = false;
      // srcset on LCP frame wins over JS src swaps → spin looks dead. Drop it once.
      this.stage.removeAttribute('srcset');
      this.stage.removeAttribute('sizes');

      if (this.frames.length < 2) {
        this.classList.add('is-fallback');
        if (this.slider) this.slider.hidden = true;
        return;
      }

      if (this.slider) {
        this.slider.min = '0';
        this.slider.max = String(this.frames.length - 1);
        this.slider.step = '1';
        this.slider.value = '0';
      }

      this.mobileMq = window.matchMedia('(max-width: 750px)');
      this.onMobileMqChange = () => this.#syncSliderVisibility();
      this.#syncSliderVisibility();
      this.mobileMq.addEventListener('change', this.onMobileMqChange);

      const frame0 = this.frames[0];
      const currentSrc = this.stage.currentSrc || this.stage.src || '';
      if (frame0 && currentSrc === frame0) {
        this.currentIndex = 0;
        this.cache.set(frame0, this.stage);
        if (this.slider) this.slider.value = '0';
        this.#preloadNear(0);
      } else {
        this.#setFrame(0, true);
      }

      this.#bindEvents();
      this.#lazyWarmup();
    }

    disconnectedCallback() {
      this.removeEventListener('pointerdown', this.onPointerDown);
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
      window.removeEventListener('pointercancel', this.onPointerUp);
      this.removeEventListener('keydown', this.onKeyDown);
      if (this.slider) this.slider.removeEventListener('input', this.onSliderInput);
      if (this.mobileMq) this.mobileMq.removeEventListener('change', this.onMobileMqChange);
      if (this.io) this.io.disconnect();
    }

    #syncSliderVisibility() {
      if (!this.slider || this.frames.length < 2) return;
      const wrap = this.slider.closest('.product-360-spin__slider-wrap');
      const hideOnTouch = this.mobileMq?.matches;
      this.slider.hidden = hideOnTouch;
      if (hideOnTouch) {
        wrap?.setAttribute('hidden', '');
        this.classList.add('is-touch-only');
      } else {
        wrap?.removeAttribute('hidden');
        this.classList.remove('is-touch-only');
      }
    }

    #readFrames() {
      const source = this.querySelector('[data-spin-frames]');
      if (!source?.textContent) return [];

      try {
        const parsed = JSON.parse(source.textContent);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((entry) => typeof entry === 'string' && entry.trim() !== '');
      } catch {
        return [];
      }
    }

    #bindEvents() {
      this.tabIndex = 0;

      this.onPointerDown = (event) => {
        if (event.button !== 0) return;
        // Range slider owns its own drag — don't steal pointer / preventDefault.
        if (event.target.closest('[data-spin-slider], .product-360-spin__slider-wrap')) return;
        event.preventDefault();
        this.pointerId = event.pointerId;
        this.lastX = event.clientX;
        this._tapStartX = event.clientX;
        this.remainingDelta = 0;
        this._didSpin = false;
        this.classList.add('is-dragging');
        try {
          this.setPointerCapture(event.pointerId);
        } catch {
          /* pointer already gone — ignore */
        }
      };

      this.onPointerMove = (event) => {
        if (this.pointerId !== event.pointerId) return;

        const delta = event.clientX - this.lastX;
        this.lastX = event.clientX;
        this.remainingDelta += delta;

        while (Math.abs(this.remainingDelta) >= this.stepPx) {
          const frameDelta = this.remainingDelta > 0 ? 1 : -1;
          this.remainingDelta -= frameDelta * this.stepPx;
          this._didSpin = true;
          this.#setFrame(this.currentIndex + frameDelta, false);
        }
      };

      this.onPointerUp = (event) => {
        if (this.pointerId !== event.pointerId) return;
        const moved = Math.abs(event.clientX - (this._tapStartX || event.clientX));
        const didSpin = this._didSpin;
        const pointerId = event.pointerId;
        this.pointerId = null;
        this.remainingDelta = 0;
        this._didSpin = false;
        this.classList.remove('is-dragging');
        try {
          if (this.hasPointerCapture(pointerId)) this.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }

        // Drag → spin only. Clean click/tap → open media lightbox (gallery browse).
        // pointercancel also ends here so mobile taps still open zoom.
        if (!didSpin && moved < 12 && event.type !== 'pointercancel') {
          this.dispatchEvent(new CustomEvent('spin360:tap', {
            bubbles: true,
            detail: {
              src: this.stage?.currentSrc || this.stage?.src || this.fallbackSrc,
              alt: this.getAttribute('aria-label') || ''
            }
          }));
        }
      };

      this.onKeyDown = (event) => {
        if (event.target !== this) return;
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          this.#setFrame(this.currentIndex + 1, false);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          this.#setFrame(this.currentIndex - 1, false);
        }
      };

      this.onSliderInput = (event) => {
        const next = Number.parseInt(event.target.value, 10);
        if (Number.isNaN(next)) return;
        this.#setFrame(next, true);
      };

      this.addEventListener('pointerdown', this.onPointerDown);
      window.addEventListener('pointermove', this.onPointerMove, { passive: true });
      window.addEventListener('pointerup', this.onPointerUp, { passive: true });
      window.addEventListener('pointercancel', this.onPointerUp, { passive: true });
      this.addEventListener('keydown', this.onKeyDown);
      if (this.slider) this.slider.addEventListener('input', this.onSliderInput);
    }

    #clamp(index) {
      const n = this.frames.length;
      if (!n) return 0;
      return ((index % n) + n) % n;
    }

    #setFrame(nextIndex, immediate) {
      if (!this.frames.length) return;
      const clamped = this.#clamp(nextIndex);
      const src = this.frames[clamped];
      if (!src) return;

      const apply = () => {
        this.currentIndex = clamped;
        if (this.stage.hasAttribute('srcset')) {
          this.stage.removeAttribute('srcset');
          this.stage.removeAttribute('sizes');
        }
        this.stage.src = src;
        if (this.slider) this.slider.value = String(clamped);
        this.#preloadNear(clamped);
      };

      const cached = this.cache.get(src);
      if (immediate || (cached && cached.complete)) {
        apply();
        return;
      }

      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      this.cache.set(src, img);
      img.onload = apply;
      img.onerror = () => {
        if (this.fallbackSrc) this.stage.src = this.fallbackSrc;
      };
    }

    #preloadNear(centerIndex) {
      const saveData = navigator.connection && navigator.connection.saveData;
      const maxDistance = saveData ? 1 : 4;
      for (let i = 1; i <= maxDistance; i += 1) {
        this.#preload(this.#clamp(centerIndex + i));
        this.#preload(this.#clamp(centerIndex - i));
      }
    }

    #preload(index) {
      const src = this.frames[index];
      if (!src || this.cache.has(src)) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      this.cache.set(src, img);
    }

    #lazyWarmup() {
      const saveData = navigator.connection && navigator.connection.saveData;
      if (saveData) return;

      const queue = this.frames.slice(0);
      const warm = () => {
        const src = queue.shift();
        if (!src) return;
        if (!this.cache.has(src)) {
          const img = new Image();
          img.decoding = 'async';
          img.src = src;
          this.cache.set(src, img);
        }
        if (queue.length) {
          if (window.requestIdleCallback) {
            window.requestIdleCallback(warm, { timeout: 250 });
          } else {
            window.setTimeout(warm, 48);
          }
        }
      };

      this.io = new IntersectionObserver((entries) => {
        if (!entries[0]?.isIntersecting) return;
        this.io.disconnect();
        warm();
      });
      this.io.observe(this);
    }
  }

  customElements.define('product-360-spin', Product360Spin);
})();
