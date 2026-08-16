# Programmatic SEO Content System — Resell Lausanne

Principle: **templates + structured data + review checkpoints**, not mass AI articles. The owner does not write blogs manually; the site generates content from product/collection/taxonomy data with human approval before indexing. Build on existing systems: collection SEO snippets (`collection-plp-seo-*`), FAQ metaobjects (`page_faq_category`, `collection_faq_items`, `product_faq_items`), breadcrumb taxonomy, `resell-blog-*`.

## Quality guardrails (apply to every type)
- Every generated page must add **unique value** (data, sizing, coloways, authenticity, local) — never spun text.
- **No index until reviewed** for net-new page types (draft → approve → publish).
- **No empty/thin pages**: require ≥5–10 products or ≥3 substantive FAQ/answer blocks.
- One template, many data rows → dedupe intros/meta (rotate sentence templates).
- Multilingual only where worth indexing (see `MULTILINGUAL_SEO_PLAN.md`).

## Content types

| # | Type | Data source | Automation | Human review | Low-quality risk | Shopify implementation | SEO value | Internal-link role | Priority |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Collection intro blocks | taxonomy + collection metafields | High (template) | Light (spot-check) | Low | `custom.seo_intro` metaobject / `collection-plp-seo-*` | High | Links to sibling models | P1 |
| 2 | Collection FAQ blocks | `page_faq_category` / `collection_faq_items` metaobjects | High | Medium | Low | metaobject FAQ (theme already renders + FAQPage schema) | High (FAQ rich result) | Q&A links to models | P1 |
| 3 | Brand landing pages | taxonomy brand rows | Med | Medium | Med | brand collection + intro + chips | High | Hub for models | P1 |
| 4 | Model landing pages | taxonomy model rows | Med | Medium | Med | model collection + intro + FAQ | High | Under brand hub | P1 |
| 5 | Buying guides ("Comment choisir…") | model attrs + sizing | Med | High | Med | blog article (draft) | Med-High | → collections | P2 |
| 6 | Size guides | existing size-guide system (`resell-size-guide-*`, `sg-i18n`) | High | Light | Low | page + per-brand text (exists) | Med | → brand collections | P2 (exists, extend) |
| 7 | Authenticity guides | authentication process + legitcheck scrape (`audit-results/legitcheck-scrape`) | Med | High | Med | page/article | Med (trust/E-E-A-T) | → collections | P2 |
| 8 | Delivery/returns trust | policy data | High | Light | Low | pages + FAQ (exists) | Med (trust) | → FAQ/pages | P3 (exists) |
| 9 | Comparison pages ("X vs Y") | 2 model rows | Med | High | High | article/page | Med | → both collections | P3 |
| 10 | "Best sneakers for…" | curated collections + attrs | Med | High | High | curated collection or article | Med | → collections | P3 |
| 11 | Trend pages | trending models (GSC/Ahrefs) | Med | Medium | Med | smart collection + intro | Med-High | homepage rail | P2 |
| 12 | New arrivals | `nouveautes` collection | High | None | Low | exists | Med | homepage | done |
| 13 | Local SEO pages | store/local data | Low | High | Low | page (see `LOCAL_SEO_PLAN.md`) | Med (local) | footer/about | P2 |
| 14 | Glossary/entity pages | taxonomy terms | Med | Medium | Med | article/page | Med (AEO/LLM) | → collections | P3 |
| 15 | Automated blog drafts | product/model data + template | Med | **High (approve each)** | High | `resell-blog-*` draft, unpublished | Med | → collections | P3 |
| 16 | Metaobject FAQ modules | metaobjects | High | Medium | Low | exists (extend coverage) | High | Q&A links | P1 |

## Priority build order
1. **FAQ metaobject coverage** (types 2/16): replace theme's hardcoded FAQ fallbacks with real `collection_faq_items`/`page_faq_category` metaobjects for top 20 collections + FAQ/livraison pages. Highest ROI, lowest risk.
2. **Collection intros** (type 1): fill `seo_intro` for the ~25 money collections missing snippets.
3. **Model landing pages** (type 4): AJ1/AJ4, Dunk Low, Samba, Gazelle, NB 9060/2002R/1906R, Kayano 14, Gel-NYC, Speedcat, Vomero, Labubu.
4. **Trend + gender/price collections** (types 11/12): smart collections + intros.
5. **Guides/authenticity/glossary** (types 5/7/14): draft → approve, slow cadence.

## Generation → approval workflow
`data/taxonomy + attributes` → generator script → **draft CSV / unpublished metaobject** → human review (accuracy, tone, dedupe) → import/publish → validate (Rich Results, index) → measure (GSC/Ahrefs). See `SEO_AUTOMATION_ARCHITECTURE.md`.

## What NOT to do
- No auto-publish of AI articles at scale. No duplicate near-identical "X sneakers Switzerland" pages that cannibalize. No FAQ schema without visible FAQ. No thin gender/price pages with 2 products.
