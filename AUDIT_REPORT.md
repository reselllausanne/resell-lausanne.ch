# Resell Lausanne — Shopify Theme Audit Report

**Branch:** `audit-cleanup-shopify-theme`
**Scope:** Read-only audit + minimal, safe stabilization of the live theme before deeper CRO work.
**Live theme root:** `fullstack_2_3_1/` (confirmed via `.shopifyignore` + Shopify CLI `--path fullstack_2_3_1`).
**Date:** 2026-07-01

> Companion files: `CLEANUP_CHANGELOG.md`, `DELETE_CANDIDATES.md`, `SEO_TECHNICAL_NOTES.md`, `QA_CHECKLIST.md`.

---

## 0. Headline conclusions

1. **Theme integrity is solid.** A full reference-integrity scan found **zero broken references**: no missing snippets, sections, assets, or section/block `type`s referenced by any template or section group.
2. **SEO implementation is unusually strong** for an AI-assisted build: per-page-type + per-handle i18n titles/descriptions that respect Shopify SEO metafields, advanced faceted canonical + `noindex` logic, custom hreflang with native hreflang stripped to avoid duplicates, per-variant Product JSON-LD with shipping details, and Judge.me owning all rating schema (no duplicate `AggregateRating`).
3. **Performance is aggressively engineered** (per-template LCP preload, critical-CSS inlining, deferred stylesheets, intent/idle-loaded JS, cart drawer removed in favor of `/cart`).
4. **Main risks are maintainability + fragility, not correctness:** a stale duplicate theme tree at repo root, ~16 orphaned/leftover theme files, and a fragile-by-design `content_for_header` string-surgery snippet.
5. **Changes made this pass are intentionally minimal and low-risk** (2 fixes). No deletions were performed. All uncertain files are logged in `DELETE_CANDIDATES.md`.

---

## 1. Architecture map (Phase 1)

### 1.1 Repository layout — two theme trees

| Tree | Files | Role |
|---|---|---|
| `fullstack_2_3_1/` | assets 163, blocks 94, sections 53, snippets 212, templates 29, locales 10 | **LIVE theme** (Fullstack 2.3.1 base + large custom Resell layer) |
| Repo root (`/layout`, `/sections`, `/snippets`, `/blocks`, `/templates`, `/config`, `/locales`, `/assets`) | assets 7, sections 17, snippets 4, templates 15, locales 2 | **Stale/secondary tree** — not pushed (CLI uses `--path fullstack_2_3_1`). Needs owner confirmation before removal. |
| `apps/allin-one-code/` | Shopify app | **Express-price Cart Transform Function** (+ terms-acknowledgement). Commercial/checkout-critical — **DO NOT TOUCH.** |

### 1.2 `layout/theme.liquid` orchestration
Head: per-template LCP preload → `rl-defer-non-critical` → `meta-tags` → `preconnect cdn.shopify.com` → critical CSS (`rl-header.css`, `base.css` preloaded; `base-plp.css`/`pdp.css`/`cart.css`/`search.css`/`resell-blog.css` template-scoped; `base-overlays.css`/`slider.css`/seo-readmore deferred) → inline hero CSS (home) → `material-icons-header`, `fonts`, `scripts`, `css-variables`, `color-schemes` → `content-for-header` (processes Shopify `content_for_header`) → `head-favicon` → idle-loaded Ahrefs analytics → `llms.txt` + `agents.md` alternates.
Body: skip link → `toast-notification` → optional `wishlist-drawer` section → `header-group` → `breadcrumbs-group` → `content_for_layout` → `prefooter-group` → `footer-group` → `mobile-floating-nav` → idle mobile-nav JS → `material-icons-body`.

### 1.3 Templates → top-level section types

| Template | Section `type`s |
|---|---|
| `index.json` | home-hero-premium, image-tag-slider (×5), home-partner-trust, custom-section (newsletter) |
| `product.json` | main-product, product-recommendations (“Sélectionné pour toi”, max 4), image-tag-slider (cross-sell rails), custom-section (see-also, newsletter) |
| `collection.json` | collection-plp-header, main-collection, collection-plp-seo-readmore |
| `search.json` | main-search (+ shared product-card blocks + filters-and-sort) |
| `cart.json` | cart (+ cart-* blocks) |
| `blog*.json` | resell-blog-hub, resell-blog-grid |
| `article.json` | resell-article, resell-blog-related |
| `page.*.json` | main-page / main-wishlist / resell-reviews-hub / static-sitemap-products |
| `customers/*` | main-account/-login/-register/-addresses/-order/-activate-account/-reset-password |
| `password.json` | password (+ countdown, powered-by-fullstack) |

### 1.4 Reusable systems (files that own behavior)
- **SEO head:** `snippets/meta-tags.liquid` (title/desc/canonical/robots + Product/Breadcrumb/FAQ JSON-LD orchestration) → renders `site-schema.liquid` (Organization / LocalBusiness / WebSite+SearchAction / MerchantReturnPolicy) + `hreflang-tags.liquid`.
- **content_for_header processor:** `snippets/content-for-header.liquid` (strips native hreflang; template-scoped stripping of wallets/review/perf scripts; keeps analytics/Web Pixels).
- **Breadcrumbs:** `snippets/product-breadcrumb.liquid` (+ `-auto-handle`, `breadcrumb-taxonomy-map`, `breadcrumb-taxonomy-collection-url`, `collection-breadcrumb-*`). HTML + schema modes.
- **Product card (PLP/search/rails):** `blocks/_product-card*`, `snippets/product-media.liquid`, `product-card.js`, `product-price.js`, `rl-product-image-preload.js`.
- **PDP:** `sections/main-product.liquid` + `blocks/_product-form`, `_product-variant-picker`, `_product-variant-popup`, `_product-add-to-cart-button`, `_product-media-gallery`, `_quantity-breaks`; sticky ATC via `sticky-add-to-cart.js`; size modal `product-size-selection-modal.*`.
- **Express pricing (CRITICAL):** `snippets/rs-product-has-express-pricing.liquid`, `rs-variant-effective-price.liquid`, `blocks/_fake-variant-picker.liquid`, `_fake-variant-link.liquid` + cart-transform app in `apps/allin-one-code`. Gated on `variant.metafields.custom.express_price`.
- **Header/nav:** `sections/header.liquid` + `header-group.json` + `header-drawer-menu`, `menu-*`, `mobile-floating-nav.*`.
- **Footer:** `sections/footer.liquid` + `footer-group.json` + `footer-resell-*` snippets.
- **Filters/facets:** `blocks/filters-and-sort.liquid`, `snippets/filters-sidebar.liquid`, `filters-modal.liquid`, `filter-and-sort.js`, `filter.js`.
- **Reviews:** Judge.me (`resell-judgeme-*`, `judgeme_widgets.liquid`, `reviews.liquid`, `rating-stars.liquid`) + Trustpilot trustbox snippet.
- **Wishlist:** Wishlist King app (`wishlist-king*.css`, `wishlist-king.liquid`) + native `wishlist-drawer` section + `wishlist.js`.

---

## 2. Automated checks (Phase 2)

### 2.1 `shopify theme check` — BLOCKED (environment, not theme)
- Installed CLI: `3.94.3` (offline theme-check engine).
- Error: `Expected a plain object value for ChecksExcludePatterns but got object` when loading `theme-check:recommended`.
- **Diagnosis:** config-schema incompatibility between this CLI version's bundled theme-check engine and the extended ruleset — **not** a theme defect. Reproduced with an explicit minimal config.
- **Remediation (owner/env):** upgrade CLI (`npm i -g @shopify/cli@latest`, ≥4.x) then re-run `shopify theme check` from `fullstack_2_3_1/`. No code change required.

### 2.2 Custom reference-integrity scan (substitute static analysis)
Script: `.cursor/audit-tmp/refscan.sh` (ripgrep-based, searches liquid/json across layout/templates/sections/snippets/blocks/config/locales).
- **Broken snippet references (`render`/`include` → missing):** 0
- **Broken section references (`{% section %}` → missing):** 0
- **Section-group / template `type` → missing section/block file:** 0
- **Missing asset references (`… | asset_url` → missing):** 0
- **Unreferenced snippets:** 8 · **Unreferenced sections:** 7 · **Unreferenced CSS:** 1 → all triaged in `DELETE_CANDIDATES.md`.
- Note: scan accounts for dynamic renders (`{% render brand_faq_snippet %}`, `{% render brand_seo_snippet %}`) confirmed in `main-collection.liquid` / `collection-plp-seo-readmore.liquid`.

### 2.3 Issue scan (`.cursor/audit-tmp/issuescan.sh`)
- No `debugger`/`alert`. `console.error` used legitimately for error handling. One real `console.log` (French debug string on fetch-abort) in `assets/variant-picker.js:114` → P3.
- No invalid multi-H1 (see §4).
- `wethenew` appeared only in 2 dev comments → fixed this pass.
- TODOs are design-contract notes, not bugs.

---

## 3. Shopify OS 2.0 health (Phase 3)

| Area | Result |
|---|---|
| Broken section refs in JSON | **None** |
| Missing sections referenced by templates | **None** |
| Snippets rendered but missing | **None** |
| Assets referenced but missing | **None** |
| Invalid schema `type`s | **None** (all `type`s resolve to section/block files) |
| Snippets present but unreferenced | 8 (candidates) |
| Sections present but unreferenced | 7 (candidates — all theme-editor-addable via `presets`) |
| Assets present but unreferenced | 1 css (candidate) |
| Duplicate/leftover systems | Base-theme sections superseded by Resell equivalents: `main-blog`/`blog-featured` → `resell-blog-hub`/`-grid`; `main-article` → `resell-article`; `product-featured` (unused). `demo-design-system` = dev demo. |
| Empty/junk dirs | `templates/customers 2/` (empty macOS-style duplicate) |
| Root duplicate theme tree | Present, not pushed — see DELETE_CANDIDATES |

**Classification key:** P0 (breaks checkout/ATC/PDP/collection/indexing/render) · P1 (SEO/perf/UX w/ business impact) · P2 (maintainability / minor UX-perf) · P3 (cleanup/naming/docs).

- No **P0** issues found in theme code.
- **P1:** product-card `<img alt>` had no product-title fallback (blank when merchant left alt empty) → **fixed** this pass.
- **P2:** stale root theme tree; 16 orphaned files; `content_for_header` string-surgery fragility; large blocks of hardcoded FAQ JSON-LD in `meta-tags.liquid` (works, but should migrate to metaobjects — the code already prefers metaobjects with hardcoded fallback).
- **P3:** `templates/customers 2/` empty dir; one debug `console.log`; a few non-passive `visualViewport`/`touchstart` listeners; root scratch artifacts (`css wethenew.css`, `resell-homepage.png`, `size-modal-local-mobile.png`).

Full list in the Issue Register (§7) and `DELETE_CANDIDATES.md`.

---

## 4. Technical SEO (Phase 4) — full detail in `SEO_TECHNICAL_NOTES.md`

Summary of verified-correct behavior:
- **Titles/meta:** respect `collection/product` SEO metafields (`global.title_tag`/`description_tag`); i18n fr/de/en per-handle overrides; product vendor prepend guarded against duplication. One `<title>` per page.
- **Canonical:** uses Shopify `canonical_url`; homepage → origin; alias collections canonicalized to their primary handle; custom canonicals via metafield; pagination NOT double-appended (past `?page=2?page=2` bug documented + fixed).
- **Robots:** `noindex,follow` for `/collections/all`, search, non-whitelisted collection facets, `?category=` pages, `demande-retour`; facet index whitelist via `shop.metafields.seo.facet_index_whitelist`.
- **Hreflang:** custom (`hreflang-tags.liquid`), native hreflang **stripped** in `content-for-header.liquid` (no duplicates); gated off on noindex/404/alias-collection pages; x-default + per-language, fr→fr-CH.
- **Structured data:** Organization + LocalBusiness + WebSite(SearchAction) + MerchantReturnPolicy (site-wide), per-variant Product with Offer/shipping/express, BreadcrumbList (collection/article/page + product via taxonomy snippet), FAQPage (metaobject-driven with hardcoded fallback). **No duplicate rating schema** (Judge.me owns it). Product schema emits **no** standalone `Review`/`AggregateRating`/`Brand` (brand nested in Product).
- **H1:** exactly one per main template — home hero `visually-hidden` H1; collection H1 from `collection-plp-header` (main-collection H1 disabled via `show_plp_heading:false`); PDP `<h1>{{ product.title }}</h1>`; accordions default to `<p>` (verified no caller passes `heading_tag:'h1'`).
- **Image alt:** product cards now fall back to `product.title` when `media.alt` is blank (fixed). Rails already used titles.

Minor SEO notes (P2/P3): hardcoded FAQ JSON-LD blocks in `meta-tags.liquid`; `article | structured_data` (Shopify native) used for articles (fine, but less controllable).

---

## 5. Performance (Phase 5)

Verified-good patterns:
- Per-template LCP preload snippets; `preconnect` limited to `cdn.shopify.com`.
- Critical CSS preloaded/inlined; non-critical deferred via print→media trick (`deferred-stylesheet`).
- JS: importmap + `modulepreload fetchpriority=low`; product-card/price/slider/wishlist/toast/accordion/dropdown/popup all **intent + idle** loaded, gated on DOM surface presence.
- Images: `fetchpriority`/`loading`/`decoding` computed by grid rank (first collection card = `high`+`sync`); responsive `widths`/`sizes`.
- Cart drawer removed → `/cart` (less global JS).
- `content_for_header` trims wallet/review/perf scripts on fast templates; **keeps analytics/Web Pixels always** and Shop Pay where needed (cart/PDP).

Watch-items (do not "fix" blindly):
- **P2 — `content-for-header.liquid` fragility:** manipulates Shopify's `content_for_header` via string `split`. Powerful but brittle if Shopify markup or an app's injected tags change. Keep under regression watch; do not extend patterns without testing wallets/analytics.
- **P3 — non-passive listeners:** `product-size-modal.js:29`, `product-size-selection-modal.js:342` (`visualViewport scroll`), `rl-collection-chip-nav.js:1083` (`touchstart`). Low frequency; verify `touchstart` isn't calling `preventDefault` before adding `passive`.

---

## 6. CRO / UX (Phase 6) — audit-level (deep CRO is the next pass)

Observed (no bugs actioned this pass):
- **PDP:** single `_product-form` + one ATC button + optional sticky ATC (`enable_sticky_add_to_cart:true`) — expected, not duplicated. Variant picker `buttons` + size popup + size-guide link; single-size handling (`rs-pdp-single-size`); express vs standard pricing gated strictly on `express_price` metafield (recent commits hardened this). Trust: Judge.me badge + store rating + accordions + payment methods (currently `disabled` blocks kept for editor). Recommendations capped at 4.
- **Collection/search:** shared `_product-card` blocks; sticky filter toolbar; result count; `products_per_page` clamped to 16 in `main-collection.liquid` even though schema/JSON say 24 (intentional perf cap — noted, verify desired).
- **Cart:** dedicated `/cart` page with progress bar, discount code, accelerated checkout block; no drawer.
- Recommend a dedicated CRO/variant-interaction pass (express/standard toggle, OOS states, mobile sticky dock) with live browser testing.

---

## 7. Issue register (P0–P3)

| ID | Phase | Sev | Area | Issue | Evidence | Status |
|---|---|---|---|---|---|---|
| I-01 | 3/4 | P1 | Image SEO | Product-card `<img>` used `alt: media.alt` with no fallback → empty alt when merchant left alt blank | `snippets/product-media.liquid`, `blocks/_product-card-media-gallery.liquid` | **Fixed** (title fallback) |
| I-02 | 3 | P3 | Hygiene | `wethenew` in 2 dev comments (repo rule bans in comments) | `menu-other-sneaker-brands.liquid:5`, `collection-plp-subcollection-chips.liquid:2` | **Fixed** |
| I-03 | 3 | P2 | Maintainability | Stale duplicate theme tree at repo root (not pushed) | root `/layout`,`/sections`,… | Candidate — owner confirm |
| I-04 | 3 | P2 | Maintainability | 16 orphaned theme files (8 snippets, 7 sections, 1 css) | refscan | Candidates (not deleted) |
| I-05 | 3 | P3 | Hygiene | Empty `templates/customers 2/` (macOS duplicate) | `ls` | Candidate |
| I-06 | 5 | P2 | Perf/Risk | `content_for_header` string-surgery fragile-by-design | `content-for-header.liquid` | Documented risk — no change |
| I-07 | 4 | P2 | SEO/Maint | Large hardcoded FAQ JSON-LD fallback blocks | `meta-tags.liquid` (livraison/faq/collections) | Documented — migrate to metaobjects later |
| I-08 | 5 | P3 | Perf | Non-passive `visualViewport`/`touchstart` listeners | `product-size(-selection)-modal.js`, `rl-collection-chip-nav.js:1083` | Documented |
| I-09 | 2 | P3 | Hygiene | Debug `console.log` on fetch-abort | `assets/variant-picker.js:114` | Documented (leave) |
| I-10 | 3 | P3 | Hygiene | Root scratch artifacts (`css wethenew.css`, PNGs) | repo root | Candidates |

---

## 8. What was NOT changed (and why)
- **No files deleted.** Every "unused" file has a plausible dynamic-use path (theme-editor `presets`, app injection, live `settings_data.json` which is push-ignored). All logged as candidates.
- **No SEO logic rewrites.** Titles/canonical/hreflang/schema are correct; changing them risks indexing regressions.
- **No `content_for_header` changes**, no app/express-pricing changes, no cart/checkout changes, no URL/handle/redirect/Markets changes, no theme settings via API.
- **No `products_per_page` change** (the 24→16 clamp looks intentional; flagged for owner confirmation).

See `CLEANUP_CHANGELOG.md` for the 2 applied changes and `QA_CHECKLIST.md` for regression steps.
