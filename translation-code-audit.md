# Translation code audit — Resell theme (`fullstack_2_3_1`)

Audit date: 2026-07-28. Scope: theme code only (no Shopify Admin / Translate & Adapt data changed).

## Executive summary

| Area | P0 issues | Root cause | Code fix status |
|------|-----------|------------|-----------------|
| Brand FAQ on `/en` `/de` | 20 French-only snippets | `main-collection.liquid` rendered FAQ without locale gate | **Fixed** — FR-only snippets hidden unless multilingual router |
| Brand SEO body on `/en` `/de` | 35 French-only snippets | `collection-plp-seo-readmore.liquid` already FR-gated; onitsuka exception | **Fixed** — EN/DE headings for priority PLPs; body only when locale router exists |
| FAQ JSON-LD on `/en` `/de` | Travis / Essentials / Crampons | `meta-tags.liquid` hardcoded French schema | **Fixed** — gated to `locale_base == 'fr'`; onitsuka kept multilingual |
| PLP header intro/title | Travis, Essentials, TN, AM95, J4, Kayano | Hardcoded French fallbacks | **Fixed** — `plp-collection-header-copy.liquid` |
| Metafields on `/en` `/de` | French until translated | Admin content not in theme | **Partial** — metafields now render on all locales; needs Translate & Adapt |
| Internal links | 116 hardcoded `/collections/` | SEO snippets + mobile drawer | **Partial** — `rl-collection-url.liquid` added; drawer still P1 backlog |
| Locale JSON | 2 missing DE keys | `de.json` | **Fixed** |
| JS UI strings | toast, size modal, see-more | Hardcoded French fallbacks | **Open P1** |

**Language policy enforced in code:** root = FR-CH, `/de` = DE-CH, `/en` = EN-CH. No French SEO/FAQ fallback on `/en` or `/de` unless snippet has explicit locale router (currently: Onitsuka Tiger only).

---

## 1. French hardcoded in Liquid (P0 — collection PLP)

### 1.1 Brand FAQ snippets (20 files) — French-only body

All under `fullstack_2_3_1/snippets/collection-plp-faq-*-content.liquid` except Onitsuka router:

- adidas, adidas-spezial, asics, asics-double-laces, bape, chrome-hearts, converse, denim-tears, dunk, jordan, new-balance, new-balance-204, nike, nike-tn, off-white, on-running, puma, salomon, supreme, yeezy

**Symptom:** French `<summary>` and answers on `/en/collections/*` and `/de/collections/*`.

**Fix applied:** `main-collection.liquid` — `show_brand_faq` only when `is_fr_locale` OR `plp_has_theme_locale_content` (onitsuka handles).

**Scalable next step:** Add `-fr`/`-en`/`-de` routers per high-traffic brand (see Onitsuka pattern) OR move FAQ to Shopify metaobjects + Translate & Adapt.

### 1.2 Brand SEO body snippets (35 files) — French-only HTML

All `collection-plp-seo-*-content.liquid` except Onitsuka router + `collection-plp-seo-resell-lausanne-content.liquid`.

**Fix applied:** `collection-plp-seo-readmore.liquid` — brand body remains `is_fr_locale` gated; Onitsuka + EN/DE heading-only blocks for priority collections.

### 1.3 Onitsuka Tiger (reference implementation)

| File | Role |
|------|------|
| `collection-plp-faq-onitsuka-tiger-content.liquid` | Locale router |
| `collection-plp-faq-onitsuka-tiger-content-{fr,en,de}.liquid` | Translated FAQ |
| `collection-plp-seo-onitsuka-tiger-content.liquid` | Locale router |
| `collection-plp-seo-onitsuka-tiger-content-{fr,en,de}.liquid` | Translated trust body |

---

## 2. Sections rendering French regardless of locale (P0)

| File | Lines | Issue | Fix |
|------|-------|-------|-----|
| `sections/main-collection.liquid` | 248–320 | Brand FAQ + broken `has_seo_blocks` operator precedence | Locale gate + explicit block flags |
| `sections/collection-plp-header.liquid` | 37–79 | French title/intro fallbacks | `plp-collection-header-copy.liquid` |
| `sections/collection-plp-seo-readmore.liquid` | 19–90 | FR-only brand SEO assignments | EN/DE headings for 6 priority PLPs |
| `snippets/meta-tags.liquid` | 1111–1204 | French FAQPage JSON-LD on all locales | FR-only except Onitsuka |

---

## 3. Metafield / metaobject outputs (P1 — needs Admin translation)

| Metafield | Render location | Theme behaviour after patch |
|-----------|-----------------|----------------------------|
| `collection.custom.seo_intro` | `collection-plp-header.liquid` | Renders all locales — **Translate & Adapt required** |
| `collection.custom.seo_h1` | `collection-plp-header.liquid` | Renders all locales |
| `collection.custom.collection_editorial` | `main-collection.liquid` | Renders all locales |
| `collection.custom.collection_faq_items` | `main-collection.liquid`, `meta-tags.liquid` | Renders all locales |
| `collection.custom.related_collections` | `main-collection.liquid` | Renders all locales (URLs locale-aware via Shopify) |
| `collection.custom.collection_internal_links` | `main-collection.liquid` | **FR-only** (metaobject links often French) |
| `collection.global.title_tag` / `description_tag` | `meta-tags.liquid` | FR uses metafield; EN/DE use generated titles |

**Risk:** If metafield not translated in Admin, French visible on `/en` `/de`. Listed in `translation-data-needed.csv`.

---

## 4. Internal links losing `/en` or `/de` (P1)

| File | Count | Pattern | Fix |
|------|-------|---------|-----|
| `snippets/header-drawer-demo-panels.liquid` | ~95 | `href="/collections/handle"` | **Backlog** — replace with `collections[handle].url` |
| `snippets/collection-plp-seo-*` (8 files) | ~16 | hardcoded `/collections/` in body copy | Use `{% render 'rl-collection-url', handle: 'nike' %}` |
| `sections/header.liquid` | 2 | `/collections/toutes-nos-paires` | Use `collections['toutes-nos-paires'].url` |
| `collection-plp-faq-*` (20 files) | 20 | `/pages/faq?category=echanges-et-retours` | Onitsuka fixed with `rl-localized-path`; others FR-only gated |

**New helper:** `snippets/rl-collection-url.liquid`, `snippets/rl-localized-path.liquid` (existing).

---

## 5. Missing locale keys (P1)

| Key | FR | EN | DE | Status |
|-----|----|----|-----|--------|
| `collections.featured_rail_48h` | ✓ | ✓ | ✗ → ✓ | Fixed in `de.json` |
| `collections.featured_rail_view_all` | ✓ | ✓ | ✗ → ✓ | Fixed in `de.json` |

Full `rl_*`, `faq_*`, `blocks.*`, `breadcrumbs.home`: parity across fr/en/de.

---

## 6. JS hardcoded French (P1 — open)

| File | Strings |
|------|---------|
| `assets/see-more.js` | `Voir plus` / `Voir moins` fallback |
| `assets/toast-notification.js` | `Erreur !` / `Succès !` |
| `assets/product-size-selection-modal.js` | delivery + size UI French |
| `assets/resell-faq-page.js` | FR category slugs |

**Fix path:** Pass `window.theme.strings` from `layout/theme.liquid` using locale JSON keys.

---

## 7. Section schema defaults (P2 — theme editor)

French defaults in schema do not auto-render unless setting empty on live page — lower risk.

Notable: `main-collection.liquid` `"Livraison 48h"`, `"Voir tout"` — use `t:collections.featured_rail_*` in schema or section presets.

---

## 8. Custom sections not translatable via Translate & Adapt

These render **theme-authored** copy (not Shopify resource fields):

- All `collection-plp-seo-*-content.liquid` (35 brands)
- All `collection-plp-faq-*-content.liquid` (20 brands)
- `collection-plp-seo-resell-lausanne-content.liquid`
- `plp-collection-header-copy.liquid` fallbacks
- FAQ JSON-LD blocks in `meta-tags.liquid`

Translate & Adapt cannot translate Liquid files — only Shopify resources (collections, pages, metafields, metaobjects, menus).

---

## 9. Canonical / hreflang

No bugs found. `snippets/hreflang-tags.liquid` emits reciprocal `fr-CH`, `de`, `en`, `x-default`. Self-referencing canonical via Shopify `canonical_url`. **No changes made.**

---

## Patch summary (this delivery)

| File | Change |
|------|--------|
| `snippets/plp-locale-registry.liquid` | Multilingual handle registry (doc) |
| `snippets/plp-collection-header-copy.liquid` | EN/DE/FR PLP header fallbacks |
| `snippets/rl-collection-url.liquid` | Locale-safe collection URL helper |
| `sections/main-collection.liquid` | FAQ locale gate, SEO block logic |
| `sections/collection-plp-header.liquid` | Header copy + metafield on all locales |
| `sections/collection-plp-seo-readmore.liquid` | EN/DE headings priority PLPs |
| `snippets/meta-tags.liquid` | FR-only FAQ schema except Onitsuka |
| `locales/de.json` | 2 missing collection keys |
| Onitsuka `-fr/en/de` snippets | (prior session) |

---

## Remaining backlog (code)

1. Localize 20 FAQ + 35 SEO brand snippets (or migrate to metaobjects)
2. Fix 95 mobile drawer collection URLs
3. JS string extraction to locale files
4. Breadcrumb French segments in `collection-breadcrumb-resolve.liquid`
5. FAQ page schema fallbacks — gate by locale or use translated metaobjects

---

## D. Verification checklist (live HTML — 2026-07-28)

Test rendered HTML on production after theme push `#188549300610`.

| PLP | FR `/collections/…` | EN `/en/collections/…` | DE `/de/collections/…` |
|-----|---------------------|------------------------|------------------------|
| Onitsuka Tiger | PASS — FR FAQ + SEO body | PASS — EN FAQ + intro | PASS — DE FAQ + intro |
| Fear of God Essentials | PASS | PASS — EN heading/intro, no FR FAQ | PASS — DE heading/intro, no FR FAQ |
| Nike TN | PASS | PASS | PASS |
| Air Max 95 | PASS | PASS | PASS |
| Air Jordan 4 | PASS | PASS | PASS |
| Travis Scott | PASS | PASS | PASS |
| Gel-Kayano 14 | PASS | PASS | PASS |

**Per-locale checks (EN/DE):**
- [x] No French FAQ `<summary>` in `.main-collection__faq`
- [x] No French FAQPage JSON-LD (Travis/Essentials/Crampons gated)
- [x] Localized PLP intro or heading present on priority pages
- [x] `html lang` matches locale
- [x] Canonical self-references current URL
- [x] hreflang reciprocal fr-CH / en / de

**Still manual after Translate & Adapt export:**
- [ ] Collection `seo_intro` metafield EN/DE (if set in Admin)
- [ ] `collection_faq_items` metaobject translations
- [ ] `related_collections` titles in visitor language
- [ ] Menu / footer link labels

**21 pass / 0 fail / 0 partial** (7 PLPs × 3 locales)
