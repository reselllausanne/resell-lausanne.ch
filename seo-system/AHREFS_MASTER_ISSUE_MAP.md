# Ahrefs Master Issue Map — Resell Lausanne

**State:** No Ahrefs exports present yet (`audit-inputs/ahrefs/` empty). This map is **pre-populated from code evidence** (deep theme audit) so that when the CSVs arrive, each issue class is already triaged: what this theme already fixes, what is data/admin work, and what is recrawl-only. Update `Count` per export.

Legend — Likely source: `CODE`=theme, `ADMIN`=Shopify content/product/collection data, `FEED`=product import, `ARCH`=collection architecture, `REDIR`=redirect, `SITEMAP`, `LINK`=internal linking, `APP`=app-generated, `STALE`=stale crawl, `RECRAWL`=fixed but not recrawled, `OK`=intentional.

| Issue | Count | Sev | Business impact | SEO impact | Likely source | Fix in code? | Fix in Admin/data? | Needs redirect? | Recrawl only? | Recommended action | Owner decision? | Validation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Broken internal links (4xx) | TBD | P0 if→money page | Lost link equity + UX | High | CODE/LINK/ADMIN | Sometimes | Sometimes | Sometimes | No | Map each in `BROKEN_LINKS_ACTION_PLAN.csv`; fix source link or 301 | Per URL | Re-crawl + click test |
| 404 receiving internal links | TBD | P0 | Dead ends | High | ADMIN/REDIR | Rare | Yes | Usually | No | 301 to nearest live collection/product; else fix linker | Yes (targets) | GSC + fetch |
| Canonical → redirect / non-200 | TBD | P1 | Index dilution | High | RECRAWL | Already handled | No | No | **Likely** | Verify vs `meta-tags.liquid` (pagination `?page` bug fixed; aliases canonicalized) | No | View-source canonical |
| Hreflang: missing return / non-canonical target | TBD | P1 | Wrong-locale ranking | Med-High | RECRAWL/CODE | Mostly done | No | No | **Likely** | Native hreflang stripped + custom emitted; verify reciprocity live | No | Rich Results / hreflang tester |
| Orphan pages (valuable) | TBD | P1 | Unsellable inventory | High | LINK/ARCH | Yes (link modules) | Sometimes | Sometimes | No | `ORPHAN_PAGES_ACTION_PLAN.csv` → add to chips/rails/sitemap | Some | Inlinks recount |
| Important pages, few internal links | TBD | P1 | Weak crawl priority | High | LINK | Yes | No | No | Internal-link system (chips, related, sitemap) | No | Inlinks recount |
| Product/collection missing indexable value (thin) | TBD | P1 | Won't rank | Med-High | CODE/ADMIN | Partly (SEO text/FAQ snippets) | Yes (products) | No | No | Collection SEO text + FAQ metaobjects; add products before creating empty collections | Yes | Word count + index |
| Sitemap has noindex/non-canonical/broken | TBD | P1 | Crawl waste, trust | Med | SITEMAP/APP | Limited (Shopify-managed) | Some | Some | Some | See `INDEXATION_GOVERNANCE.md`; Shopify auto-sitemap mostly excludes noindex | No | Sitemap vs robots meta |
| Structured data errors (Product/Breadcrumb/FAQ/Org) | TBD | P1 | Rich-result loss | Med-High | CODE/RECRAWL | Yes | No | No | Mostly | Validate live sample; ensure no app duplicates Product schema | No | Rich Results Test |
| Duplicate titles | TBD | P2 | CTR/cannibalization | Med | ARCH/ADMIN | Partly | Yes | Alias→redir | Some | Alias collections canonicalized; real dupes = handle overrides or thin admin pages | Some | SERP + view-source |
| Missing titles | TBD | P2 | CTR | Med | CODE fallback covers | Fallback exists | Rare | No | Likely | Theme always emits `<title>`; findings likely stale | No | view-source |
| Titles too long (>60) | TBD | P3 | Truncation | Low-Med | CODE/ADMIN | Yes (formula) | Yes | No | No | Apply `SEO_METADATA_RULES.md` length caps | No | SERP preview |
| Duplicate meta descriptions | TBD | P2 | CTR | Low-Med | ADMIN/CODE | Partly | Yes | No | Some | Per-handle overrides exist; fill unique for money collections | Some | view-source |
| Missing meta descriptions | TBD | P2 | CTR | Low-Med | CODE fallback | Fallback exists | Optional | No | Likely | Theme derives from desc/handle; upgrade top pages manually | No | view-source |
| Meta descriptions too short | TBD | P3 | CTR | Low | ADMIN | No | Yes | No | No | Expand per `SEO_METADATA_RULES.md` (120–155) | No | view-source |
| Missing alt text | TBD | P2 | Image SEO/a11y | Low-Med | CODE/ADMIN | **Fixed in cards+PDP** | Yes (set in admin) | No | Partly | Product images now fall back to title; set real alts for hero/model shots | No | view-source img |
| Image issues (size/format/next-gen) | TBD | P3 | Perf/LCP | Low-Med | CODE | Mostly optimized | No | No | No | Theme uses responsive widths/AVIF hero; monitor | No | Lighthouse |
| Low word count / thin content | TBD | P2 | Won't rank | Med | ARCH/CODE | Yes (SEO text) | Some | Merge? | No | Add collection SEO text/FAQ; merge/redirect thin dupes | Yes | Word count |
| Deep pagination / faceted crawl waste | TBD | P2 | Crawl budget | Med | CODE | **Handled** (noindex facets, whitelist) | No | No | Likely | Facet whitelist + `noindex,follow`; confirm live | No | robots meta on facet URL |
| Non-indexable / noindex in sitemap | TBD | P2 | Mixed signals | Low-Med | SITEMAP | Shopify-managed | Some | Some | Some | Shopify excludes noindex from its sitemap; audit HTML sitemap page | No | Sitemap check |
| Redirect chains/loops | TBD | P2 | Crawl waste | Low-Med | REDIR/ADMIN | No | Yes (URL redirects) | Fix chain | No | Flatten in Admin → URL Redirects | Yes | Redirect trace |
| Outgoing broken (external) | TBD | P3 | UX/trust | Low | ADMIN | No | Yes | No | No | Fix/remove in content | No | Link check |

## Cross-cutting notes (code evidence)
- **Already fixed in theme** (treat matching Ahrefs findings as RECRAWL unless reproduced live): pagination canonical double-append, duplicate native hreflang (stripped in `content-for-header.liquid`), product `Review`/`AggregateRating` removed (Judge.me owns), alias-collection canonicalization, `/collections/all` + search + `?category=` `noindex,follow`, product-card + PDP image alt fallback.
- **Alias collections** (`travis-scott`, `vetement-travis`→`air-jordan-x-travis-scott`; `fear-of-god-essentials`→`essentials`; `crampons`/`football`→`crampons-de-foot`; `new-balance-204`→`new-balance-204l`) are canonicalized in code but **not 301'd**. Ahrefs may still flag "duplicate/near-duplicate" — decide redirect vs canonical (see `REDIRECT_CANDIDATES.csv`).
- **Data-side issues dominate** for a resale catalog: product titles, colorway, SKU/style code, image alt set in Admin, thin new collections. Prioritize the data system (`PRODUCT_SEO_SYSTEM.md`, `SEO_METADATA_RULES.md`).
