# Indexation Governance — Resell Lausanne

Single source of truth for what should be indexed. Most rules are **already enforced** in `snippets/meta-tags.liquid`. Do NOT change robots/noindex logic without live verification.

## Page-type index policy (target state vs current code)
| Page type | Should be | Current code | OK? | Notes |
|---|---|---|---|---|
| Homepage | index | index | ✅ | |
| Core collections (toutes-nos-paires, nouveautes) | index | index | ✅ | strengthen content |
| Brand/model collections | index | index | ✅ | need intro/FAQ for thin ones |
| `/collections/all` | **noindex,follow** | `noindex,follow` | ✅ | large low-value |
| Alias collections (travis-scott, fear-of-god-essentials, crampons, football, new-balance-204) | canonical→primary (or 301) | canonicalized (no 301) | ✅/decide | see `REDIRECT_CANDIDATES.csv` |
| Collection facets (filters) non-whitelisted | **noindex,follow** + canonical to clean | enforced via facet whitelist | ✅ | whitelist in `shop.metafields.seo.facet_index_whitelist` |
| Collection facets whitelisted | index (self-canonical) | supported | ✅ | curate whitelist for valuable facets (e.g., color, key size) |
| Pagination `?page=N` | index, self-canonical (Shopify) | not double-appended (bug fixed) | ✅ | |
| Search `/search` | **noindex,follow** | `noindex,follow` | ✅ | |
| `?category=` pages / FAQ category | **noindex,follow** | enforced (server + JS) | ✅ | |
| Product pages | index | index | ✅ | |
| Pages (concept, faq, livraison, size guide, reviews) | index | index | ✅ | |
| demande-retour | **noindex,follow** | `noindex,follow` | ✅ | utility |
| Cart / account / checkout | noindex (Shopify default) | Shopify-managed | ✅ | |
| Policies | crawl-allowed but low value | `Disallow: /policies/` in robots.txt.liquid | ✅ | intentional |
| Customer/order URLs | noindex | Shopify-managed | ✅ | |

## Sitemap governance
- Shopify auto-generates `sitemap.xml` and **excludes `noindex`** pages automatically → the noindex rules above keep facets/search/all out of the XML sitemap.
- **HTML sitemap** (`page.plan-du-site` / `static-sitemap-products`): ensure it lists all **indexable** collections (drive from `data/breadcrumb-taxonomy.csv`) and does NOT link noindex/alias pages. This is the main lever to kill orphans.
- After Ahrefs ingestion, check "Non-indexable/noindex/non-canonical in sitemap": for a Shopify store these are usually **stale** or app-injected; verify before acting.

## What to verify live (post-ingestion)
1. `curl -s https://www.resell-lausanne.ch/collections/all | grep robots` → `noindex,follow`.
2. A facet URL (e.g., `/collections/nike?filter...`) → `noindex,follow` + canonical to clean.
3. `/search?q=dunk` → `noindex,follow`.
4. `robots.txt` → Shopify defaults + `Disallow: /policies/` + sitemap line.
5. XML sitemap contains only indexable canonical URLs.

## GSC validation steps
- Coverage/Pages report: watch "Excluded by noindex" (should be facets/search/all/utility) vs "Crawled - not indexed" (thin → fix content).
- Submit XML sitemap; monitor "Discovered - not indexed" for money collections (→ add internal links + content).

## Ahrefs recrawl instructions
- After fixes, "Rebuild" the Ahrefs project or wait for scheduled recrawl before re-judging canonical/hreflang/indexability findings. Many current findings will clear on recrawl (already fixed in code).

## Do NOT (without owner sign-off + live proof)
- Add site-wide `noindex`. Change robots.txt beyond current. Aggressively block pagination/facets further (current handling is deliberate). Remove language markets.
