/**
 * PASTE INTO: Swish → Settings → Code Editor → Custom Wishlist Page
 *
 * Default Swish page component — keep as-is unless you need markup changes.
 * Theme handles page title via sections/main-wishlist.liquid (H1 hidden in CSS).
 */

export function define({
  lit: { html, repeat },
  WishlistElement,
}) {
  return class WishlistPage extends WishlistElement {
    static get properties() {
      return {
        moveToCart: { type: Boolean, attribute: "move-to-cart" },
        loginCtaMode: { type: String, attribute: "login-cta-mode" },
        variantAutoSelectMode: {
          type: String,
          attribute: "variant-auto-select-mode",
        },
        showVendor: { type: Boolean, attribute: "show-vendor" },
        showProductTitle: { type: Boolean, attribute: "show-product-title" },
        showPrice: { type: Boolean, attribute: "show-price" },
        showShareButton: { type: Boolean, attribute: "show-share-button" },
        showBuyAllButton: { type: Boolean, attribute: "show-buy-all-button" },
        showClearButton: { type: Boolean, attribute: "show-clear-button" },
        ctaButton: { type: String, attribute: "cta-button" },
        productOptions: { type: String, attribute: "product-options" },
        wishlistEmptyLink: { type: String, attribute: "wishlist-empty-link" },
        removeButtonStyle: { type: String, attribute: "remove-button-style" },
      };
    }

    getStateConfig() {
      return {
        wishlist: true,
      };
    }

    render() {
      if (!this.wishlist) {
        return;
      }

      return html`
        <section class="wk-page notranslate">
          ${this.renderHeader()}
          <div class="wk-body">${this.renderWishlistItems()}</div>
        </section>
      `;
    }

    renderHeader() {
      return html`
        <div class="wk-header">
          <h1 class="wk-title">
            ${this.getTranslation("wishlist_page.title")}
          </h1>
          ${this.renderWishlistEmptyCallout()} ${this.renderLoginCallout()}
          ${this.renderControls()}
        </div>
      `;
    }

    renderControls() {
      if (!this.wishlist.items.length) {
        return;
      }
      if (!this.showShareButton && !this.showBuyAllButton && !this.showClearButton) {
        return;
      }

      return html`
        <div class="wk-controls">
          ${this.showShareButton
          ? html`
              <wishlist-share
                data-wishlist-id="${this.wishlist.id}"
                .showIcon=${true}
              ></wishlist-share>
            `
          : undefined}
          ${this.showBuyAllButton
          ? html`
              <wishlist-add-to-cart
                data-wishlist-id="${this.wishlist.id}"
                .moveToCart=${this.moveToCart}
                .showIcon=${true}
              ></wishlist-add-to-cart>
            `
          : undefined}
          ${this.showClearButton
          ? html`
              <wishlist-clear
                data-wishlist-id="${this.wishlist.id}"
                .showIcon=${true}
              ></wishlist-clear>
            `
          : undefined}
        </div>
      `;
    }

    renderWishlistEmptyCallout() {
      if (this.wishlist.items.length) {
        return;
      }

      return html`
        <div class="wk-wishlist-empty-callout">
          <p>
            ${this.getTranslation("wishlist_page.wishlist_empty_callout_html")}
          </p>
          <a href=${this.wishlistEmptyLink} class="wk-callout-cta">
            ${this.getTranslation("wishlist_page.wishlist_empty_cta")}
          </a>
        </div>
      `;
    }

    renderLoginCallout() {
      if (
        this.app.customer ||
        !this.wishlist.isMine ||
        !this.wishlist.items.length ||
        !this.app.config.shop.customerAccountsEnabled
      ) {
        return;
      }
      if (this.loginCtaMode === "DISABLED") {
        return;
      }

      return html`
        <div class="wk-login-callout">
          <p>
            ${this.getTranslation("wishlist_page.login_callout_html", {
              login_url: this.app.routes.accountLoginUrl,
              register_url: this.app.routes.accountRegisterUrl,
            })}
          </p>
        </div>
      `;
    }

    renderWishlistItems() {
      if (!this.wishlist.items.length) {
        return;
      }

      const wishlistItems = this.wishlist.items.slice().reverse();

      return html`
        <div class="wk-grid">
          ${repeat(
            wishlistItems,
            (wishlistItem) => wishlistItem.id,
            (wishlistItem) => html`
              <wishlist-product-card
                data-wishlist-id=${this.wishlist.id}
                data-wishlist-item-id=${wishlistItem.id}
                .wishlist=${this.wishlist}
                .moveToCart=${this.moveToCart}
                .showVendor=${this.showVendor}
                .showProductTitle=${this.showProductTitle}
                .showPrice=${this.showPrice}
                .ctaButton=${this.ctaButton}
                .productOptions=${this.productOptions}
                .removeButtonStyle=${this.removeButtonStyle}
              ></wishlist-product-card>
            `
          )}
        </div>
      `;
    }

    connectedCallback() {
      if (!this.dataset.wishlistId) {
        this.dataset.wishlistId = this.app.theme.getWishlistId(window.location.pathname);
      }

      if (this.dataset.wishlistId && this.dataset.wishlistId !== "mine") {
        this.loadWithoutSession = true;
      }

      super.connectedCallback();
    }
  };
}
