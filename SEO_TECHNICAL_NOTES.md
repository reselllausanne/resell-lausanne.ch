# SEO Technical Notes

Theme-level technical SEO for Resell Lausanne. Verdict: **strong implementation, few gaps.** Evidence is file:line in `fullstack_2_3_1/`.

Core files: `snippets/meta-tags.liquid` (orchestrator), `snippets/site-schema.liquid` (Org/LocalBusiness/WebSite/ReturnPolicy), `snippets/hreflang-tags.liquid`, `snippets/content-for-header.liquid` (strips native tags), `snippets/product-breadcrumb.liquid`.

---

## Titles / meta description — OK
- Per-page-type logic with per-handle fr/de/en overrides (`meta-tags.liquid` L20–L233).
- **Respects merchant SEO fields:** collection uses `metafields.global.title_tag`/`description_tag`; only applies handle overrides when those are blank (L102–L196). Does not clobber manual SEO.
- Product: vendor prepended only if not already in title and not SEO-boosted (L229–L233).
- Meta description clamped to 160 chars (L1133–L1141). One `<title>` element (L772–L777).
- P3: `<title>` has leading whitespace/newlines (cosmetic; trimmed by clients).

## Canonical — OK
- Uses Shopify `canonical_url`; fallback origin+path; homepage → origin (L236–L242).
- Alias collections canonicalized to primary handle: `travis-scott`→`air-jordan-x-travis-scott`, `fear-of-god-essentials`→`essentials`, `crampons/football`→`crampons-de-foot`, `new-balance-204`→`new-balance-204l` (L266–L278).
- Custom canonicals via `shop.metafields.seo.canonicals` (L256–L264).
- **Pagination:** does NOT manually append `?page` (documented past bug `?page=2?page=2`, L374–L379) — relies on Shopify canonical.
- Facets: non-whitelisted collection facet URLs canonicalize to clean collection URL (L308–L346).

## Hreflang — OK (no duplicates)
- Custom `hreflang-tags.liquid`: `x-default` + one per `available_languages`; `fr` root → `fr-CH` (L43–L48).
- **Native hreflang stripped** in `content-for-header.liquid` L32–L44 → no duplication.
- Emission gated in `meta-tags.liquid` L784–L810: skipped on noindex, `not_found`/404, and alias collections (would point to non-canonical). URLs strip query strings.
- Watch: whitelisted self-canonical facet pages keep `?query` in canonical but hreflang strips it (minor mismatch, low impact).

## Robots / meta robots — OK
`noindex,follow` applied to: non-whitelisted collection facets (L340–L345), search (L348–L351), `/collections/all` (L353–L355), `?category=` pages incl. FAQ (L357–L367 + client-side JS L811–L829), `demande-retour` (L369–L371). Custom no-index list via `shop.metafields.seo.no_indexes` (L381–L389). `<meta robots>` emitted only when set (L780–L782).

## Structured data (JSON-LD) — OK, no duplicate ratings
- **Site-wide** (`site-schema.liquid`): Organization (+`sameAs`, dedup, filters out `fullstack`), MerchantReturnPolicy (14 days, CH, StoreCredit), LocalBusiness (geo, hours, `parentOrganization`), WebSite (+SearchAction). aggregateRating intentionally removed (comments L35, L147) — **Judge.me owns ratings.**
- **Product** (`meta-tags.liquid` L582–L729): `@type Product`, `@id`, per-variant `offers` with price/currency/availability/condition/`priceValidUntil`(+1y)/return-policy ref, standard + conditional **express** `shippingDetails` (gated on `express_price` metafield), `additionalProperty` (color/gender/style_code/size), GTIN/MPN from barcode/sku/metafields, brand nested (no standalone Brand), **no** `Review`/`AggregateRating` (avoids Google "missing itemReviewed").
- **Breadcrumb:** collection/article/page inline (L854–L888); product via `product-breadcrumb.liquid` (taxonomy map → vendor/title inference; `product_position` bug already fixed, see snippet L100–L104). Valid `BreadcrumbList`.
- **FAQPage:** product/collection from metafields; page `livraison`/`faq` from `page_faq_category` metaobjects with large hardcoded fallback (L1059–L1130). AboutPage (`notre-concept`), WebPage (`redaction`). Article uses `article | structured_data` (native).
- P2: hardcoded FAQ JSON-LD fallback blocks are long; prefer full metaobject coverage so the fallback is never used. Not a bug (code prefers metaobjects).
- **Validate live:** run Google Rich Results Test on 1 PDP, 1 collection, `/pages/faq`, `/pages/livraison`.

## Breadcrumbs — OK
Visible `nav.commerce-breadcrumbs` + matching schema on PDP; taxonomy-driven (`primary_collection_handle` metafield → auto-handle → vendor/model inference). Missing collections render as plain text (no wrong links). Collection/PLP header renders `collection-breadcrumb-nav`.

## Collection SEO — OK
- One H1 from `collection-plp-header.liquid` L61 (`seo_h1` metafield → handle override → `collection.title`); `main-collection` H1 disabled via `show_plp_heading:false`.
- SEO intro (metafield or handle default), SEO read-more section, brand/sub-collection chips (internal linking), ItemList schema (`collection-plp-itemlist-schema`).

## Product SEO — OK
Single H1 (`product.title`); description; per-variant schema; SKU/style_code/color/gender in `additionalProperty`; `product-pdp-seo-boost` handle-specific title/desc for target keywords (ASICS rose, double-laces, Tokuten, Margiela GATS).

## Image SEO — FIXED this pass
- Product-card images used `alt: media.alt` with no fallback → **empty alt** when merchant left it blank. Now falls back to `product.title` (see `CLEANUP_CHANGELOG.md`). Card links already carried `aria-label` (title).
- Placeholder image alt = `"placeholder product"` (decorative-ish; acceptable).
- **Follow-up (safe, not done):** apply the same `alt_fallback: product.title` to the **PDP main gallery** (`blocks/_product-media-gallery.liquid`) using the new `product-media` param.

## Internal linking — OK
Breadcrumbs, brand/sub-collection chips, related products (`product-recommendations` SSR fallback links for crawlers), footer brand/marques links, mobile floating nav, static sitemap page.

---

## Phase 9 — Ahrefs exports needed (none found in repo)

No `audit-inputs/` dir and no Ahrefs CSVs in `audit-results/`. To run the Phase 9 mapping (issue → source → code-fixable? → priority → validation), drop these CSVs in a new `audit-inputs/` folder:

1. Internal pages (all URLs + HTTP status + indexability)
2. Broken links (4xx/5xx internal + outbound)
3. Orphan pages
4. Redirects (301/302 + chains/loops)
5. Duplicate title / meta description
6. Missing title / meta description
7. Hreflang issues (missing return tags, non-canonical targets)
8. Canonical issues (canonical → redirect/non-200/non-canonical)
9. Structured data issues
10. Missing alt text
11. Incoming internal links (per URL)

> Do not invent Ahrefs data. Some issues may already be fixed in code (e.g., pagination canonical, duplicate hreflang, product rating schema) but still show until Ahrefs/Google recrawl — verify against current code before acting.

### Likely source pre-mapping (to speed Phase 9 once CSVs arrive)
- **Duplicate/missing titles** → mostly theme fallback covers this; real dupes likely alias collections (already canonicalized) or thin Admin pages.
- **Canonical → redirect** → historically the `?page=2?page=2` bug (fixed) and alias collections (now canonicalized). Likely recrawl-only.
- **Hreflang issues** → custom hreflang is correct; stale native-hreflang findings are recrawl-only.
- **Missing alt text** → product images (now have title fallback in cards; PDP main gallery still to do) + Admin-set product image alt (data, not theme).
- **Structured data** → validate FAQ/Product live; ensure no app also injects Product schema.
- **Broken links / orphans / redirects** → Admin content, product/collection data, or app — not theme code in most cases.
