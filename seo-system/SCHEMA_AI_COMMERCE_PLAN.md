# Schema & AI-Commerce Plan — Resell Lausanne

The theme already ships strong structured data. This plan = verify + targeted enhancements for richer results and AI/LLM commerce readability. **Never duplicate review/rating schema — Judge.me owns it.**

## Current state (from `meta-tags.liquid` + `site-schema.liquid`)
| Type | Status | Notes |
|---|---|---|
| Organization | ✅ | name, url, logo, address, contactPoint, sameAs (deduped, filters `fullstack`) |
| LocalBusiness | ✅ | geo (46.5530, 6.5561), hours, address (Bussigny 1030 VD CH), parentOrganization |
| WebSite + SearchAction | ✅ | search box target |
| MerchantReturnPolicy | ✅ | 14 days, CH, StoreCreditRefund, ReturnByMail |
| Product | ✅ strong | @id, per-variant offers, price/CHF/priceValidUntil, availability, itemCondition, shippingDetails (standard + conditional express), brand (nested), additionalProperty (Couleur/Genre/Code style/Taille), sku/gtin/mpn guarded |
| BreadcrumbList | ✅ | product via taxonomy snippet; collection/article/page inline |
| FAQPage | ✅ | metaobject-driven + hardcoded fallback (livraison/faq/select collections) |
| Review / AggregateRating | ✅ (absent by design) | Judge.me owns — do not re-add |
| llms.txt / agents.md | ✅ | linked in `<head>` (AI/LLM discovery) |

## Recommended enhancements (safe, additive)
### Product schema additions (fill from metafields; omit when unknown)
- `releaseDate` (from `custom.release_date`) — sneaker search + AI relevance.
- `color` (top-level, from `custom.color`) — currently only in additionalProperty.
- `material` (from `custom.material`) — where known.
- `audience` → `{ "@type": "PeopleAudience", "suggestedGender": ... }` from `custom.gender`.
- `productID` / `isVariantOf` (`ProductGroup`) — model-level grouping so AI/Google understand size variants belong to one model. Consider `ProductGroup` + `hasVariant` for models with many size variants.
- `size` as structured `additionalProperty` (name "Pointure EU", value = variant size) — already have "Taille"; standardize EU + optional `sizeSystem`.
- Keep `itemCondition` accurate (New vs Used) from `condition_label` (already logic'd).

### Entity / brand-model clarity (for Google + LLMs)
- Ensure `brand.name` = canonical brand ("Nike", "Adidas", "New Balance", "Fear of God Essentials").
- Add `Brand` `@id`/`sameAs` to official brand entity (optional) for stronger entity linking.
- Breadcrumb already encodes vertical→brand→model → keep it complete (backfill `primary_collection_handle`).

### Collection-level semantic clarity
- Emit `CollectionPage` + `ItemList` on money collections (itemListElement = product URLs). `collection-plp-itemlist-schema.liquid` exists — verify it outputs ItemList with positions; extend to brand/model collections.
- Optional `BreadcrumbList` on collections (already present).

### FAQ schema governance
- Only emit FAQPage where **visible** FAQ exists (theme does). Migrate hardcoded fallbacks → metaobjects so schema == visible content. Avoid duplicate FAQPage (one per page).

### AI / LLM readability (AEO)
- `llms.txt` + `agents.md` already linked — keep them current: list top collections, brands, shipping/returns/authenticity, contact. Add brand/model taxonomy summary so LLMs can answer "where to buy X in Switzerland".
- Clean, server-rendered breadcrumbs + related links (SSR) help LLM crawlers map product relationships.

## Duplicate-schema risk (audit)
- **Check apps**: Judge.me (reviews), any SEO app, any "rich snippets" app must NOT inject a second Product/Offer/AggregateRating. Validate live: view-source a PDP → exactly **one** `Product` JSON-LD.
- If an app injects Product schema → disable that app's schema (keep theme's) to avoid conflicts.

## Fields / metafields needed
`custom.release_date`, `custom.color`, `custom.material`, `custom.gender`, `custom.model` (+ `model_collection_handle`), `custom.size_system`. Most already referenced by breadcrumb/schema — backfill values (see `PRODUCT_SEO_DATA_GAPS.csv`).

## Schema examples (additions to existing Product)
```json
"releaseDate": "2024-03-15",
"color": "Panda / White-Black",
"audience": { "@type": "PeopleAudience", "suggestedGender": "unisex" },
"isVariantOf": { "@type": "ProductGroup", "@id": "…/#productgroup", "name": "Nike Dunk Low", "productGroupID": "DD1391" }
```

## Validation steps
1. Rich Results Test + Schema.org validator on 5 varied PDPs + 3 collections + FAQ page.
2. view-source: one Product JSON-LD per PDP (no app duplicate).
3. GSC → Enhancements (Products, Breadcrumbs, FAQ, Merchant listings) → 0 errors, watch valid count.
4. Merchant Center: confirm structured data matches feed (price/availability/condition).

## Risks
- Adding `isVariantOf`/`ProductGroup` incorrectly can confuse Merchant Center — roll out on a few products, validate, then scale.
- Never emit `priceValidUntil` in the past (theme uses now+1y — OK).
- Keep review/rating exclusively in Judge.me.
