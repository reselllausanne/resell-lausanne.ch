# Product SEO System — Resell Lausanne

Scale-first rules for product pages. Built on the theme's existing PDP + schema (single H1 = `product.title`; per-variant Product JSON-LD in `meta-tags.liquid`; `product-pdp-seo-boost.liquid`; breadcrumb via `product-breadcrumb.liquid` + taxonomy). Do NOT bulk-rewrite thousands of products by hand — detect gaps, fill data (metafields), let templates render.

## Current PDP SEO inputs (from code)
- Title H1: `<h1>{{ product.title }}</h1>` (product.json).
- SEO title: `meta-tags.liquid` prepends `product.vendor` if not in title; handle-specific boosts in `product-pdp-seo-boost.liquid` (ASICS rose, double-laces, Tokuten, Margiela GATS).
- Schema fields used: `selected_variant.barcode`→gtin, `sku`→mpn, `metafields.custom.{gtin,mpn,color,gender,style_code,condition_label}`, `vendor`→brand, per-variant price/availability/shipping (+express), MerchantReturnPolicy ref.
- Breadcrumb inputs: `metafields.custom.{primary_collection_handle,brand_collection_handle,model_collection_handle,vertical,model,silhouette,category_model}` + `data/breadcrumb-taxonomy.csv`.
- Image alt: falls back to `product.title` (fixed in cards + PDP gallery).

## 1. Ideal product title formula (H1 = product.title)
`{Brand} {Model} {Colorway/Nickname}` — optional ` ({StyleCode})` only if it aids search.
- Ex: `Nike Dunk Low Panda`, `Adidas Samba OG Cloud White`, `New Balance 9060 Sea Salt`.
- Streetwear: `{Brand} {Item} {Colorway}` — `Fear of God Essentials Hoodie Light Oatmeal`.
- Keep ≤ ~70 chars. Brand first (matches search + breadcrumb). No SEO stuffing, no "authentique Suisse" in H1 (that lives in SEO title/meta).

## 2. Ideal SEO title formula (`<title>`, ≤60 where possible)
`{Brand} {Model} {Colorway} — Resell Lausanne` (theme auto-prepends vendor if missing).
- If short enough add intent: `... — authentique Suisse`.
- Do NOT overwrite merchant `metafields.global.title_tag` if present + good.

## 3. Ideal meta description formula (120–155)
`{Brand} {Model} {Colorway} authentique en Suisse. Tailles EU, livraison {CH/EU}, paiement Twint & Alma. Contrôle d'authenticité Resell Lausanne.`
- Vary lead per product to avoid duplication; include colorway + size + trust + payment.

## 4. Ideal product description template (RTE, rendered in accordions)
Blocks (short, scannable):
1. 1-line hook (model + colorway + vibe).
2. Détails: coloris, matière, style code/SKU, année/release if known.
3. Taille & fit: sizing note (grand/petit/normal) + link to guide des tailles.
4. Authenticité: 1 line + link to processus d'authentification.
5. Livraison & paiement: CH/EU + Twint/Alma.
- Powered by metafields where possible so it's generatable (see `PROGRAMMATIC_SEO_CONTENT_SYSTEM.md`).

## 5. Ideal image alt formula
`{product.title}` fallback already implemented. Where merchant sets alt, prefer `{Brand} {Model} {Colorway} — {view}` (e.g., "Nike Dunk Low Panda — profil"). Keep unique per image, not stuffed.

## 6. Ideal Product schema fields (already strong — keep/verify)
Product@id, name, url(canonical), description, image[], sku, gtin, mpn, brand(nested), offers[] per variant (price, priceCurrency CHF, priceValidUntil, availability, itemCondition, url?variant, hasMerchantReturnPolicy, shippingDetails standard+express), additionalProperty (Couleur, Genre, Code style, Taille). Do NOT add Review/AggregateRating (Judge.me owns).
- **Add** (see `SCHEMA_AI_COMMERCE_PLAN.md`): `releaseDate`, `size` as `additionalProperty`/`hasMeasurement`, `color`, `material`, `audience` (gender), `productID`.

## 7. Ideal metafields (namespace `custom`)
Required for full SEO/schema/linking: `brand`, `model`, `silhouette`, `colorway`, `color`, `style_code`, `gtin`, `mpn`, `gender`, `release_date`, `condition_label`, `primary_collection_handle`, `brand_collection_handle`, `model_collection_handle`, `vertical`, `product_faq_items` (metaobject list), `size_fit_note`.

## 8. Avoiding keyword stuffing
- One clear H1. No repeating "sneakers Suisse authentique" across title+H1+meta+alt.
- Colorway/model once each. No comma-lists of keywords in description. No hidden text.

## 9. Multilingual FR/DE/EN (see `MULTILINGUAL_SEO_PLAN.md`)
- FR default. Translate title_tag/description via Shopify Translate & Adapt or metafield translations. Product H1 (title) usually stays brand+model (language-neutral). Descriptions: translate the templated blocks; keep brand/model/colorway untranslated.

## 10. StockX / imported products
- Imports often have long noisy titles + missing colorway/style_code. Normalize: parse `{Brand} {Model} {Colorway}` from title; move style code to metafield; set brand/model/silhouette metafields for breadcrumb + linking.
- Deduplicate near-identical titles (same model, different sizes should be variants, not separate products).

## 11. Products missing SKU / colorway / release date
- SKU/style_code missing → schema omits gtin/mpn gracefully (already guarded). Backfill from title parse where possible.
- Colorway missing → derive from title tail; else omit from meta (don't invent).
- Release date missing → omit `releaseDate` (never fabricate).

## 12. Automated generation rules
- Detection: `scripts/generate_seo_metadata_plan.py` reads product export → flags missing/weak title_tag, meta, alt, metafields → outputs `SEO_METADATA_SUGGESTIONS.csv` + `PRODUCT_SEO_DATA_GAPS.csv`.
- Generation: title/meta from formulas above using available attributes; NEVER overwrite good merchant SEO; mark low-confidence rows `needs_manual_review=yes`.
- Apply: Shopify bulk editor / Matrixify import (manual review) → later GraphQL if explicitly configured.

## Validation
- Rich Results Test on 5 varied PDPs (sneaker w/ express, sneaker w/o, streetwear, collectible, single-size).
- Confirm one H1, canonical, no duplicate Product schema (view-source), alt present, breadcrumb correct.
- Re-pull GSC "Pages" + Ahrefs to track thin-content + duplicate-title reduction.
