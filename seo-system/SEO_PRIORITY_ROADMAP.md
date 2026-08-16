# SEO Priority Roadmap — Resell Lausanne

Ordered by revenue/ranking impact, not by Ahrefs warning count. Each item notes owner action vs automatable. "Effort" = S/M/L. IDs referenced by `NEXT_IMPLEMENTATION_PROMPTS.md`.

## P0 — Urgent technical blockers (do first, low effort, high risk if broken)
| ID | Action | Why | Source | Effort | Depends on |
|---|---|---|---|---|---|
| P0-1 | Ingest Ahrefs Site Audit + GSC exports | Everything downstream needs real crawl data | exports | S | owner export |
| P0-2 | Fix any 404 that receives internal links; 301 to nearest live collection/product | dead ends leak equity + hurt UX | `BROKEN_LINKS_ACTION_PLAN.csv` | S–M | P0-1 |
| P0-3 | Verify canonical/hreflang findings live before "fixing" | most are already fixed → recrawl-only | `AHREFS_MASTER_ISSUE_MAP.md` | S | P0-1 |
| P0-4 | Decide alias-collection strategy (canonical-only vs 301) | duplicate signals on travis/essentials/crampons/nb-204 | `REDIRECT_CANDIDATES.csv` | S | owner |

## P1 — High-impact SEO fixes (weeks 1–4)
| ID | Action | Why | Source | Effort |
|---|---|---|---|---|
| P1-1 | Link every valuable orphan product/collection from ≥1 chip/rail/breadcrumb/sitemap | orphans can't rank/sell | `ORPHAN_PAGES_ACTION_PLAN.csv`, `INTERNAL_LINKING_SYSTEM.md` | M |
| P1-2 | Ship collection SEO text + FAQ for top money collections missing them | thin collections don't rank | `COLLECTION_SEO_MAP.csv` | M |
| P1-3 | Product data backfill: brand/model/colorway/SKU/style_code metafields | powers title/schema/breadcrumb/links | `PRODUCT_SEO_DATA_GAPS.csv` | L (automate detection) |
| P1-4 | Unique title+meta for top 50 collections + top pages | CTR + relevance | `SEO_METADATA_SUGGESTIONS.csv` | M |
| P1-5 | Validate Product/Breadcrumb/FAQ schema on live sample; kill any app-duplicated Product schema | rich results | `SCHEMA_AI_COMMERCE_PLAN.md` | S |
| P1-6 | Strengthen internal links to money collections (Nike, Jordan, Dunk, Samba, NB, ASICS) | topical authority + crawl priority | `INTERNAL_LINKING_OPPORTUNITIES.csv` | M |

## P2 — Scalable growth (weeks 3–10)
| ID | Action | Why | Source | Effort |
|---|---|---|---|---|
| P2-1 | Build brand→model→product programmatic collection SEO (templates + metaobjects) | scale landing pages w/o manual writing | `PROGRAMMATIC_SEO_CONTENT_SYSTEM.md`, `COLLECTION_SEO_MAP.csv` | L |
| P2-2 | Metadata automation script → review CSV → bulk import | scale titles/meta safely | `scripts/generate_seo_metadata_plan.py` | M |
| P2-3 | Collection FAQ metaobject coverage (replace hardcoded fallbacks) | FAQ schema + content depth | `PROGRAMMATIC_SEO_CONTENT_SYSTEM.md` | M |
| P2-4 | Model landing pages for high-demand silhouettes (Dunk Low, AJ1/AJ4, Samba, Gazelle, NB 9060/2002R/1906R, Kayano 14, Speedcat, Vomero 5) | capture model-level search | `COLLECTION_SEO_MAP.csv` | L |
| P2-5 | Local SEO page + LocalBusiness/GBP alignment | "sneakers Lausanne/Suisse" | `LOCAL_SEO_PLAN.md` | M |
| P2-6 | Gender/audience + price-intent collections (femme/homme/enfant, pas cher) | broad-intent traffic | `COLLECTION_SEO_MAP.csv` | M |

## P3 — Nice-to-have cleanup
| ID | Action | Why | Effort |
|---|---|---|---|
| P3-1 | Trim titles >60 chars where truncated | cosmetic CTR | S |
| P3-2 | Expand too-short meta descriptions on secondary pages | minor CTR | S |
| P3-3 | Set real alt text on hero/lifestyle images in Admin (beyond title fallback) | image SEO polish | M |
| P3-4 | HTML sitemap page completeness (all indexable collections) | crawl aid | S |

## Recrawl-only / no action (do NOT spend effort)
- Pagination canonical `?page=2?page=2` (fixed in code).
- Duplicate native hreflang (stripped in code).
- Product `AggregateRating`/`Review` "missing itemReviewed" (removed; Judge.me owns).
- `/collections/all`, `/search`, `?category=` "indexable?" flags — intentionally `noindex,follow`.
- Faceted URL "duplicate" flags for non-whitelisted facets — intentionally `noindex,follow` + canonicalized.

> Sequence: P0 → P1 → P2. P2 content/automation compounds. Re-pull Ahrefs + GSC every 4–6 weeks to measure and re-prioritize.
