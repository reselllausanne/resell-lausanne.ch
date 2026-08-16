# QA Checklist — post-audit manual regression

Run after any theme edit on `audit-cleanup-shopify-theme`, before pushing. Test desktop + mobile.

## Product meta descriptions (LIVE via Admin API — 2026-07-03)
- [ ] Random PDP (previously missing description) → view-source has `<meta name="description" content="Achetez … authentique en Suisse. …">` ≤155 chars
- [ ] A PDP that already had a description → description **unchanged**
- [ ] Any PDP → `seo.title` / `<title>` unchanged (vendor prefix still correct, no double vendor)
- [ ] Admin > a product > Search engine listing → description populated, title untouched
- [ ] Reversal path confirmed: `seo-system/PRODUCT_SEO_ADMIN_CHANGE_LOG.csv` lists product id + new description (set back to empty to revert)

## Collection SEO by locale (theme — requires push)
- [ ] `/collections/nike` (FR) `<title>` + meta description **unchanged** vs before (French, byte-for-byte)
- [ ] `/de/collections/nike` `<title>` = `Nike Schuhe kaufen Schweiz – Resell Lausanne` (German, not French)
- [ ] `/de/collections/nike-dunk` `<title>` = `Nike Dunk kaufen in der Schweiz …` (German)
- [ ] `/en/collections/nike` `<title>` in English (`… Buy in Switzerland`)
- [ ] No collection title >60 chars in any locale
- [ ] FR collections with an admin-set SEO title still show that admin title (unchanged)

## Homepage
- [ ] Desktop + mobile render
- [ ] Hero image loads (LCP), no long blank
- [ ] Header sticky/transparent behavior correct
- [ ] Menu (drawer) opens/closes
- [ ] No layout shift / unstyled nav or cart flash

## Collection page (`/collections/nike`, `/collections/all`)
- [ ] Collection loads
- [ ] One visible H1
- [ ] Product grid visible
- [ ] Filters open/close
- [ ] Sorting works
- [ ] Pagination / infinite loading works
- [ ] Product cards link correctly
- [ ] SEO read-more block renders

## Product page
- [ ] Gallery works (carousel + thumbnails)
- [ ] Size selector works
- [ ] Standard vs express variant logic works
- [ ] Add to cart works
- [ ] Price updates on variant change
- [ ] Out-of-stock states correct
- [ ] Sticky ATC works
- [ ] Trust blocks visible
- [ ] Judge.me reviews visible
- [ ] Schema not duplicated (one Product JSON-LD)
- [ ] Breadcrumbs work

## Cart (`/cart`)
- [ ] Add product
- [ ] Update quantity
- [ ] Remove product
- [ ] Checkout button visible
- [ ] Payment icons / accelerated checkout unaffected
- [ ] Express price transform still applies (Shopify Function)

## SEO
- [ ] Canonical present + correct (incl. locale)
- [ ] Meta title/description render
- [ ] One H1 per main template
- [ ] Product JSON-LD valid
- [ ] BreadcrumbList valid
- [ ] No duplicate hreflang / schema
- [ ] `/collections/all` + filtered URLs robots handling correct

## Performance
- [ ] No new render-blocking CSS/JS
- [ ] No new global JS
- [ ] LCP image behavior not worsened
- [ ] No new console errors

## Pass 1 — product-card alt fallback QA
- [ ] PLP/search card image whose product image has **no** alt → renders `<img alt="{product title}">`
- [ ] PLP/search card image whose product image **has** alt → alt text unchanged
- [ ] Product rails (home / cross-sell) alt unchanged
- [ ] No layout shift on collection/search grids (desktop + mobile)
- [ ] No new console errors on PLP/PDP

## Pass 2 — PDP main gallery alt fallback QA (`_product-media-gallery.liquid`)
- [ ] Live PDP main image (StockX path) alt **unchanged** (still `spin_360_alt` metafield or `"{title} - vue 360"`)
- [ ] Live PDP secondary/lightbox images alt **unchanged**
- [ ] Thumbnails alt **unchanged**
- [ ] Carousel-path image with **blank** `media.alt` → `<img alt="{product title}">`
- [ ] Carousel-path image with `media.alt` set → alt unchanged
- [ ] Gallery layout, carousel swipe, thumbnail nav, 360 spin, lightbox/zoom all behave identically
- [ ] `loading`/`fetchpriority`/`srcset`/`sizes`/media order unchanged (LCP image not degraded)
- [ ] No new console errors on PDP

## Pass 3 — PLP sub-collection chip registry + products_count guard
- [ ] `/collections/nike` — chip strip shows Air Max, Air Max 97 chips only if those collections exist and have ≥1 product; no dead/404 chip
- [ ] `/collections/adidas` — Ultra Boost, Taekwondo chips appear only if collections exist + non-empty
- [ ] `/collections/asics` — Gel-Lyte III, Running chips appear only if collections exist + non-empty; strip may now show "deferred" overflow (9 entries > 8 ATF limit) — confirm overflow chips lazy-load on scroll/hover without layout jump
- [ ] Any handle in the registry that does **not** exist in Admin (or has 0 products) → chip does not render at all (no empty `<li>`, no broken link)
- [ ] Existing chips (pre-change) still render identically — same order, same URLs, same active-state highlighting
- [ ] Chip drag-scroll, prefetch-on-hover (`rl-collection-chip-nav.js`), and mobile drawer brand row unaffected
- [ ] No new console errors on PLP pages (Nike/Adidas/ASICS)

## Pass 5 — Collection SEO Title Admin bug fix (P0/P1)
- [ ] `/collections/toutes-nos-paires` `<title>` = Admin SEO Title text ("Toutes nos sneakers (catalogue complet)...") not the generic auto pattern
- [ ] `/collections/adidas-samba` `<title>` = Admin SEO Title, not generic pattern
- [ ] A collection **without** an Admin SEO Title set still shows the generic `{title} — Sneakers & Streetwear | Resell Lausanne` pattern (fallback intact)
- [ ] A hardcoded-override collection (e.g. `/collections/dunk`) still shows its special title correctly IF its Admin SEO Title is blank; if Admin SEO Title was set for it, Admin now wins (expected new behavior)
- [ ] Meta description still unaffected (was already correct, not touched)
- [ ] No `<title>` tag duplication, no empty `<title>`

## Pass 4 — Product schema `color` field
- [ ] PDP for product with `custom.color` set → JSON-LD has top-level `"color"` string, matches metafield value
- [ ] PDP for product without `custom.color` → no `color` key, JSON-LD still valid (no trailing comma)
- [ ] Existing `additionalProperty` "Couleur" entry unchanged
- [ ] Validate one product with Google Rich Results Test after push

## Pass 5 — 126 live Admin SEO title/description writes (already applied, needs post-push verification)
- [ ] After next push: `/collections/adidas-samba` `<title>` = "Adidas Samba Suisse | Sneakers Iconiques & Nouveautés | Resell Lausanne" (trimmed, ≤60 chars before suffix)
- [ ] After next push: `/collections/nouveautes` `<title>` and meta description are no longer blank/generic
- [ ] After next push: `/collections/onitsuka-tiger` `<title>` = "Onitsuka Tiger Suisse | Sneakers Vintage Japonaises"
- [ ] After next push: `/collections/nos-sneakers-a-moins-de-200chf` title + description present, no French grammar errors
- [ ] Spot-check 5 more trimmed titles from `seo-system/COLLECTION_SEO_ADMIN_CHANGE_LOG.csv` render correctly, ≤60 chars, no dangling punctuation
- [ ] `/collections/all-products-chatgpt-ai-product-description` still 404s (untouched, confirmed not a live/indexable page)

## Pass 6 — Canonical/hreflang bug fixes (`fear-of-god-essentials`, `vetement-travis`)
- [ ] After push: `/collections/fear-of-god-essentials` (fr/de/en) → `<link rel="canonical">` = its own URL, not `/collections/essentials`
- [ ] After push: `/collections/essentials` still 301-redirects to `/collections/fear-of-god-essentials` (unchanged Shopify-level redirect, not a theme concern)
- [ ] After push: `/collections/vetement-travis` → `<link rel="canonical">` = its own URL, not `/collections/air-jordan-x-travis-scott`
- [ ] After push: `/collections/vetement-travis` `<title>` reflects its own Admin SEO Title (apparel copy), not the sneaker-collab hardcoded override
- [ ] After push: both collections emit normal `<link rel="alternate" hreflang>` tags (no longer suppressed)
- [ ] `/collections/travis-scott`, `/collections/crampons`, `/collections/football`, `/collections/new-balance-204` (none exist as real collections) — unaffected, still alias to their real counterparts

## Pass 7 — Crawlable locale links (orphan-page fix)
- [ ] After push: view-source on homepage, a PDP, and a collection page → `<nav data-hreflang-crawlable-links>` present near end of `<body>`, one real `<a href>` per available language
- [ ] Confirm it's visually invisible on both desktop and mobile (no layout shift, no visible new element) — `chrome-devtools` screenshot before/after
- [ ] Confirm existing `<select>` language switcher UI/behavior is 100% unchanged (visual + functional)
- [ ] Confirm the new links' hrefs match what's already in the page's own `<link rel="alternate" hreflang>` tags (same URL-building logic, should never diverge)
- [ ] No console errors introduced
- [ ] After 1–2 crawls post-push: Ahrefs "Orphan page (indexable, no incoming internal links)" Error count should drop measurably from the current 3,381

## Pass 8 — MerchantReturnPolicy schema linkage
- [ ] After push: view-source any page → `Organization` and `LocalBusiness` JSON-LD blocks both include `"hasMerchantReturnPolicy": {"@id": "https://www.resell-lausanne.ch/#merchant-return-policy"}`
- [ ] Paste each of the 4 site-wide JSON-LD blocks (Organization, LocalBusiness, WebSite, MerchantReturnPolicy) into Google's Rich Results Test / schema.org validator → no errors
- [ ] PDP Product/Offer schema still references the same `@id` correctly (unchanged)
- [ ] After 1–2 crawls post-push: Ahrefs "Structured data has schema.org validation error" Notice count should drop from the current 26,072

## Pass 9 — Blog "drops" tag 404 fix
- [ ] After push: `/blogs/news` topic-pill row shows exactly 4 pills (Guides d'achat, Authenticité, Comparatifs, Suisse) — no "Drops & sorties"
- [ ] The other 4 pill links still work and still filter correctly
- [ ] Once/if an article is ever tagged `drops`, the pill reappears automatically (no code change needed)

## Pass 10 — Rank-opportunity pass (geo titles live + internal links/content pending push)
- [ ] After Cloudflare cooldown: `/collections/nike-dunk` `<title>` starts with "Nike Dunk Suisse | ..." (live via Admin)
- [ ] `/collections/chrome-hearts`, `/collections/supreme`, `/collections/adidas-handball-spezial`, `/collections/nike-air-force-1-low` titles show new "... Suisse ..." form
- [ ] After push: footer (desktop + mobile) shows expanded brand list incl. Yeezy, Nike TN, Chrome Hearts, Off-White, Denim Tears, BAPE, Golden Goose, Supreme, Puma — and NO broken links (each guarded by products_count>0)
- [ ] After push: `/collections/golden-goose` renders the new SEO "read more" content block (H2 "Golden Goose — La sneaker de luxe italienne...", Super-Star/Ball Star H3s)
- [ ] Footer expansion causes no layout break on mobile or desktop (chrome-devtools screenshot)
- [ ] MANUAL: add 301 redirect `/products/jordan-1-retro-high-dior` → `/collections/air-jordan-1-high` in Admin (recovers #9 ranking that 404s)
- [ ] ~2-4 weeks: re-run `RANK_RECHECK_PLAN.md` queries; confirm target keyword positions dropped + org_traffic/org_keywords rose

## Quick local validation commands (no push)
```
# integrity re-scan
bash .cursor/audit-tmp/refscan.sh
# confirm alt fix wiring
rg -n 'media_alt|alt_fallback' fullstack_2_3_1/snippets/product-media.liquid fullstack_2_3_1/blocks/_product-card-media-gallery.liquid
# confirm no wethenew in comments/content
rg -i wethenew fullstack_2_3_1 -g '*.liquid' -g '*.json'
# confirm chip registry guard is wired
rg -n 'products_count' fullstack_2_3_1/snippets/collection-plp-subcollection-track.liquid
# confirm crawlable hreflang links wired into layout
rg -n 'hreflang-crawlable-links' fullstack_2_3_1/layout/theme.liquid fullstack_2_3_1/snippets/hreflang-crawlable-links.liquid
# confirm MerchantReturnPolicy is now linked from Organization + LocalBusiness
rg -n 'hasMerchantReturnPolicy' fullstack_2_3_1/snippets/site-schema.liquid
# confirm vetement-travis / fear-of-god-essentials no longer mis-canonicalized
rg -n "vetement-travis|fear-of-god-essentials" fullstack_2_3_1/snippets/meta-tags.liquid
# dry-run re-check of the 126 live Admin SEO writes (no risk, no --apply)
node scripts/apply_collection_seo_admin.mjs seo-system/COLLECTION_TITLE_SMART_TRIM_PLAN.csv seo-system/COLLECTION_MISSING_SEO_FIX_PLAN.csv
# dry-run re-check of the 14 geo titles (no risk, no --apply)
node scripts/apply_collection_seo_admin.mjs seo-system/COLLECTION_GEO_TITLE_PLAN.csv
# confirm footer brand expansion + golden goose content wired
rg -n "rl_extra_brands" fullstack_2_3_1/snippets/footer-resell-marques-links.liquid
rg -n "golden-goose" fullstack_2_3_1/sections/collection-plp-seo-readmore.liquid
```

---
_Checklist items get ticked as fixes are validated. See CLEANUP_CHANGELOG.md for per-change QA._
