# Next Implementation Prompts — Resell Lausanne

Copy-paste one prompt per task, in order. Each assumes the standard safety rules (no push, no delete, no checkout/cart/variant/express changes, review before Shopify import). Run them in this workspace.

---

## 0. Ingest Ahrefs + GSC (do first)
> "Ahrefs + GSC exports are now in `audit-inputs/ahrefs/` and `audit-inputs/gsc/`. Ingest them: detect columns, normalize, and populate `seo-system/AHREFS_MASTER_ISSUE_MAP.md` with real counts. Then generate real `BROKEN_LINKS_ACTION_PLAN.csv`, `ORPHAN_PAGES_ACTION_PLAN.csv`, and `REDIRECT_CANDIDATES.csv` from the crawl. Separate already-fixed (recrawl-only) issues from live issues by checking current theme code. Don't create redirects — CSV only."

## 1. Ahrefs fixes (broken links / 404 / canonical / hreflang)
> "Using the ingested Ahrefs data, for every 4xx/5xx internal link and 404 that receives internal links, fill `BROKEN_LINKS_ACTION_PLAN.csv` with source page, intent, and action (fix link vs 301). For canonical/hreflang findings, verify against `meta-tags.liquid`/`hreflang-tags.liquid`/`content-for-header.liquid` and mark recrawl-only vs real. Propose theme fixes only where a real code bug exists; otherwise give Admin (URL Redirects) instructions. No redirects applied automatically."

## 2. Orphan pages + internal linking
> "From Ahrefs orphan + inlinks exports, finalize `ORPHAN_PAGES_ACTION_PLAN.csv`. Then implement Module 1 of `INTERNAL_LINKING_SYSTEM.md`: extend `snippets/plp-subcollection-chip-registry.liquid` to add the missing taxonomy models (nike-air-max-97, nike-air-max parent, adidas-ultra-boost, adidas-taekwendo, asics-running, asics-gel-lyt-iii, Maison Mihara subs, LEGO subs) — but ONLY chips whose collection exists and has ≥1 product (keep the existence/products_count guard). Then update `sections/static-sitemap-products.liquid`/`page.plan-du-site` to list every indexable collection from `data/breadcrumb-taxonomy.csv`. Validate with `.cursor/audit-tmp/refscan.sh` (0 broken refs) and render Nike/Adidas/ASICS PLPs. No push."

## 3. Collection SEO
> "Using `COLLECTION_SEO_MAP.csv` + `COLLECTION_SEO_STRATEGY.md`, ship SEO for the P1 money collections: for each, set the metafields the theme already reads (`custom.seo_h1`, `custom.seo_intro`, `custom.collection_faq_items`; and `global.title_tag`/`description_tag`) via a Matrixify collections import file I can review. Do NOT overwrite existing good SEO. For collections marked CREATE (femme/homme/enfant/pas cher/soldes/lausanne), give me Shopify smart-collection conditions instead of creating them. Generate the import CSV; don't apply."

## 4. Product SEO
> "Export products from Shopify Admin to `audit-inputs/products_export.csv`, then run `python3 scripts/generate_seo_metadata_plan.py --products audit-inputs/products_export.csv --collections audit-inputs/collections_export.csv`. Review `seo-system/SEO_METADATA_SUGGESTIONS.csv` + `PRODUCT_SEO_DATA_GAPS.generated.csv`. Then, per `PRODUCT_SEO_SYSTEM.md`, produce a Matrixify import that backfills missing metafields (brand/model/colorway/style_code/gender/primary_collection_handle) and improves weak titles/meta — reviewed, never auto-applied."

## 5. Metadata generation
> "Run `scripts/generate_seo_metadata_plan.py` on the latest product + collection exports. For rows with `needs_manual_review=yes`, propose final titles/meta following `SEO_METADATA_RULES.md` (FR + DE for top pages). Output a clean, reviewed Matrixify import file. Enforce do-not-overwrite for good existing SEO and length targets (title ≤60, meta 120–155)."

## 6. Programmatic content
> "Implement `PROGRAMMATIC_SEO_CONTENT_SYSTEM.md` priority 1–2: build/extend the FAQ metaobject coverage for the top 20 collections + FAQ/livraison pages (replace the hardcoded FAQ fallbacks in `meta-tags.liquid` with real `collection_faq_items`/`page_faq_category` metaobjects), and draft collection intros for the ~25 money collections. Deliver as reviewable metaobject/import drafts (unpublished/draft), not live text. No mass AI articles."

## 7. Schema / AI-commerce
> "Implement the additive Product-schema enhancements in `SCHEMA_AI_COMMERCE_PLAN.md` (releaseDate, color, material, audience, isVariantOf/ProductGroup for size variants) in `meta-tags.liquid`, gated on metafields being present (omit when unknown). First verify no app injects a second Product JSON-LD (view-source a PDP). Roll out on a few products, validate in Rich Results Test, then scale. Keep Judge.me as the only review/rating source. No push until validated."

## 8. Local SEO
> "Implement `LOCAL_SEO_PLAN.md`: create a reviewable `/pages/sneakers-lausanne` (or smart collection) draft, add a local trust strip + local FAQ metaobjects, reconcile NAP with the real address, and add footer links to the local page + 'sneakers Suisse' core collection. Confirm LocalBusiness schema matches the real/GBP address. Provide GBP action checklist for the owner."

## 9. Build the link-registry generator (structural automation)
> "Build `scripts/generate_link_registry.py` (stdlib Python) that reads `data/breadcrumb-taxonomy.csv` and emits the Liquid for `plp-subcollection-chip-registry.liquid` (brand→model chips, ordered by a commercial-priority column) and a sitemap listing snippet — with an existence/products_count guard note. Output to a file for review; do not overwrite the live snippet automatically."

---

### Recommended run order
0 → 1 → 2 → 3 → 4/5 → 6 → 7 → 8 → 9. Re-pull Ahrefs + GSC after ~4–6 weeks and re-run `SEO_PRIORITY_ROADMAP.md` prioritization.
