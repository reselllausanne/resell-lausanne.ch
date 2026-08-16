# Ahrefs exports needed

No Ahrefs exports were found in `audit-inputs/ahrefs/`. Export the following and drop them in that folder (CSV preferred, UTF-8). Filenames can stay as Ahrefs names — ingestion normalizes them.

> Set domain scope to `resell-lausanne.ch` including `www` and all subfolders (`/fr`, `/de`, `/en`, `/it`, `/pl` if present). Prefer "All pages" not just "Valid".

## A. Site Audit — technical (highest priority)
| # | Export | Ahrefs location | Why |
|---|---|---|---|
| 1 | Internal pages (All) | Site Audit → Page Explorer → export all columns | master URL inventory + status + indexability |
| 2 | Broken links (internal 4xx/5xx) | Site Audit → Internal → "4xx"/"5xx" | fix source links / redirects |
| 3 | 404 pages | Site Audit → Internal pages filter 404 | redirect vs restore |
| 4 | Redirects (3xx) + Redirect chains | Site Audit → Internal → "Redirects" / "Redirect chains" | chains/loops waste crawl |
| 5 | Orphan pages | Site Audit → Page Explorer → "Orphan page = Yes" | linking targets |
| 6 | Incoming internal links (per URL) | Site Audit → Internal → "Inlinks" export | find under-linked money pages |
| 7 | Outgoing internal links | Site Audit → Links export | find broken/thin link sources |
| 8 | Canonical issues | Site Audit → Issues → "Canonical" group | canonical→redirect/non-200 |
| 9 | Hreflang issues | Site Audit → Issues → "Localization" | missing return tags / non-canonical targets |
| 10 | Duplicate titles / Missing titles / Titles too long | Site Audit → Issues → "Content" | title quality |
| 11 | Duplicate / Missing / Short meta descriptions | Site Audit → Issues → "Content" | meta quality |
| 12 | Structured data issues | Site Audit → Issues → "Structured data" | schema validation |
| 13 | Missing alt text / Image issues | Site Audit → Issues → "Images" | image SEO |
| 14 | Low word count / thin content | Site Audit → Issues → "Content" | thin pages |
| 15 | Pages with 1 or few internal links | Site Audit → Page Explorer sort by inlinks asc | crawl depth |
| 16 | Sitemap: non-indexable / noindex / non-canonical in sitemap | Site Audit → Issues → "Sitemaps" | sitemap hygiene |

## B. Site Explorer — organic (Phase 10)
See `audit-inputs/AHREFS_KEYWORD_EXPORTS_NEEDED.md` (organic keywords, top pages, competing pages, content gap, positions 4–20, by country/language).

## C. Google Search Console (complements Ahrefs, more current)
- Performance → Queries (16 months) CSV
- Performance → Pages CSV
- Pages (indexing) → export "Why pages aren't indexed"
- Sitemaps report

## Ingestion note
Ahrefs crawl can be **stale**. This theme already fixed several classic issues (pagination canonical `?page=2?page=2`, duplicate native hreflang, product `AggregateRating`). Any such findings are likely **recrawl-only** — verify against current code (see `seo-system/AHREFS_MASTER_ISSUE_MAP.md`) before acting.
