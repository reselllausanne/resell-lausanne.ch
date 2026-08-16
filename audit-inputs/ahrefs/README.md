# Drop Ahrefs exports here

Place raw Ahrefs Site Audit + Site Explorer exports in this folder (CSV or XLSX). Keep original filenames — the ingestion step normalizes them.

Once files are here, re-run the ingestion prompt (see `seo-system/NEXT_IMPLEMENTATION_PROMPTS.md` → "Ahrefs fixes"). Until then, `seo-system/` contains code-evidenced systems + the exact export list in `audit-inputs/AHREFS_EXPORTS_NEEDED.md`.

Recommended subfolders (optional):
- `site-audit/` — technical crawl exports (broken links, canonical, hreflang, titles, alt, sitemap)
- `site-explorer/` — organic keywords, top pages, competing pages
- `keywords-explorer/` — sneaker keyword lists (CH, FR/DE/EN)
- `gsc/` — Google Search Console exports (queries, pages, CTR)
