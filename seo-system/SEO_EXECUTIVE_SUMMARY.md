# SEO Executive Summary — Resell Lausanne

**Scope:** Deep SEO growth system built on the (healthy) theme. No Ahrefs exports were present, so this delivers (a) exact export specs, (b) a code-evidenced issue triage, and (c) full growth systems grounded in the real catalog taxonomy (`data/breadcrumb-taxonomy.csv`, 135 brand/model rows) + existing collection SEO/FAQ coverage. **No code changed, nothing deleted, nothing pushed.**

## What was analyzed
- Theme SEO surfaces (meta-tags, schema, hreflang, canonical, robots, breadcrumb, chips, sitemap) — from prior audit + this pass.
- Catalog taxonomy: 135 brand→model→collection rows; 30 collections with SEO text, 21 with FAQ snippets; 5 locales (fr default, de/en/it/pl).
- Existing gap analysis (`audit-results/collections-manquantes`) with CH keyword volumes + competitor (Wethenew) traffic.
- Internal linking: chip registry, breadcrumb taxonomy, SSR recommendations, HTML sitemap.

## Biggest technical issues (mostly already handled in code)
1. **No Ahrefs/GSC data ingested yet** → biggest blocker to precision. (P0 owner action: export.)
2. **Alias collections** canonicalized but not 301'd (travis/essentials/crampons/nb-204) — decide redirect vs canonical.
3. **Orphan-risk collections** — models/brands reachable by neither chips nor rails (AM97, Air Max parent, Ultra Boost, ASICS Running/Gel-Lyte, Off-White, Denim Tears, Hoka, On, LEGO subs).
4. **Chip registry gaps** vs taxonomy (missing models → weak crawl paths).
5. Most classic Ahrefs findings (pagination canonical, dup hreflang, product rating schema) are **already fixed** → recrawl-only.

## Biggest growth opportunities
1. **Model landing pages** (brand→model clusters): Dunk Low, AJ1/AJ4, Samba, Gazelle, NB 9060/2002R/1906R, Kayano 14, Gel-NYC, Vomero 5, Speedcat, Labubu — collections/products exist; just need intro/FAQ + linking.
2. **Collection metadata**: unique title+meta for ~25 money collections (currently theme-fallback).
3. **FAQ metaobject coverage** → FAQ rich results + content depth (replace hardcoded fallbacks).
4. **Broad-intent + audience collections**: sneakers femme/homme/enfant, pas cher/soldes (smart collections).
5. **Local**: "sneakers Lausanne / Suisse" hub + GBP alignment.
6. **Product data backfill** (brand/model/colorway/SKU/style_code/gender metafields) → powers titles, schema, breadcrumbs, links, feed.

## What to fix first (sequence)
- **P0:** Export Ahrefs Site Audit + GSC → `audit-inputs/`. Decide alias-redirect strategy. Verify canonical/hreflang live (don't re-fix).
- **P1:** Link orphans; collection intro+FAQ for money collections; unique metadata (top 50); internal-link money collections; validate schema (no app duplicate).
- **P2:** Programmatic model pages + FAQ metaobjects; metadata automation script → import; gender/price/local collections.

## Expected impact (directional; quantify after GSC/Ahrefs)
- Killing orphans + model pages + internal links → more indexable, better-crawled money pages → mid-term ranking + organic revenue lift.
- Unique metadata → CTR uplift on already-ranking pages (positions 4–20 quick wins).
- FAQ + schema → rich results + AI/LLM answerability for "buy {model} Switzerland".

## Deliverables (folder `seo-system/`, exports in `audit-inputs/`)
See file list at end of the chat response. Highlights: `SEO_PRIORITY_ROADMAP.md`, `AHREFS_MASTER_ISSUE_MAP.md`, `COLLECTION_SEO_MAP.csv` + strategy, `INTERNAL_LINKING_SYSTEM.md`, `PRODUCT_SEO_SYSTEM.md`, `SEO_METADATA_RULES.md` + `scripts/generate_seo_metadata_plan.py` (built + tested), `PROGRAMMATIC_SEO_CONTENT_SYSTEM.md`, `SCHEMA_AI_COMMERCE_PLAN.md`, `LOCAL_SEO_PLAN.md`, `SEO_AUTOMATION_ARCHITECTURE.md`, `NEXT_IMPLEMENTATION_PROMPTS.md`.

## Code changes this pass
**None.** The theme is healthy; the highest-value next code change (extending the chip registry / adding related-collection SSR blocks) depends on confirming which collections exist + needs QA — provided as instructions in `NEXT_IMPLEMENTATION_PROMPTS.md`, not applied.

## Never automate blindly
Publishing content, creating collections, redirects, robots/noindex/canonical/hreflang logic, market/language toggles, deletions, anything touching checkout/cart/variant/express.
