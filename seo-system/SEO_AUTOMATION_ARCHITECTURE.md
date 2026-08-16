# SEO Automation Architecture — Resell Lausanne

Long-term system to keep SEO healthy with minimal manual work. Owner is non-technical → favor CSV in/out, review checkpoints, and one-command scripts. No blind writes to Shopify. No auto-publishing content.

## Principles
- **Detect (automated) → Suggest (automated) → Review (human) → Apply (bulk import/GraphQL) → Validate → Measure.**
- Everything reversible: outputs are CSVs/drafts; applying is a separate, reviewed step.
- Single sources of truth: `data/breadcrumb-taxonomy.csv` (taxonomy), Shopify (product/collection data), Ahrefs/GSC (performance).

## What to AUTOMATE
| Automation | Input | Output | Freq | Tool |
|---|---|---|---|---|
| 1. Missing metadata detection + suggestions | product/collection export | `SEO_METADATA_SUGGESTIONS.csv` | monthly | `scripts/generate_seo_metadata_plan.py` (built) |
| 2. Product data-gap detection (alt/sku/colorway/metafields) | product export | `PRODUCT_SEO_DATA_GAPS.generated.csv` | monthly | same script |
| 3. Orphan detection | Ahrefs "orphan"+inlinks export | orphan action CSV | monthly | small parser (spec) |
| 4. Internal-link suggestions | taxonomy + collections | `INTERNAL_LINKING_OPPORTUNITIES.csv` refresh | monthly | `generate_link_registry.py` (spec) |
| 5. Chip/breadcrumb/sitemap registry sync | `data/breadcrumb-taxonomy.csv` | Liquid registry snippet | on taxonomy change | `generate_link_registry.py` (spec) |
| 6. Redirect candidate generation | Ahrefs 404 + broken + alias map | `REDIRECT_CANDIDATES.csv` | on export | parser (spec) |
| 7. Broken-link monitor | Ahrefs/crawl or `refscan.sh` | diff report | weekly (refscan) / monthly (Ahrefs) | `.cursor/audit-tmp/refscan.sh` (built) + crawl |
| 8. Sitemap/indexation audit | live URLs + robots meta | pass/fail report | monthly | small crawler (spec) |
| 9. Schema validation sampling | live PDP/collection sample | validation report | monthly | Rich Results API / sampler (spec) |
| 10. Ranking opportunity tracker (pos 4–20) | GSC/Ahrefs export | quick-win CSV | monthly | parser (spec) |
| 11. Low-CTR page detector | GSC queries/pages | CTR-gap CSV | monthly | parser (spec) |
| 12. FAQ metaobject generator (draft) | model attrs + templates | draft FAQ metaobjects | on demand | generator + review |
| 13. Product description generator (draft) | product metafields | draft descriptions CSV | on demand | generator + review |
| 14. Merchant Center URL/feed mismatch | GMC diagnostics + sitemap | mismatch CSV | monthly | parser (spec) |
| 15. Metadata → import package | approved suggestions | Matrixify import file | on approval | formatter (spec) |

## What stays MANUAL / reviewed (never blind-automate)
- Publishing any content (collection intros, FAQ answers, guides, blog) → human approves each net-new indexable text.
- Creating collections (avoid empty/thin) → owner validates stock.
- Redirects → review CSV, apply in Admin (URL Redirects) after check.
- Deleting products/collections/pages.
- robots.txt / noindex / canonical / hreflang logic changes.
- Markets/language enable-disable.
- Anything touching checkout/cart/variant/express.

## Data sources
- **Shopify**: product/collection exports (Admin CSV or Matrixify); later Admin GraphQL (only if explicitly configured with credentials).
- **Ahrefs**: Site Audit + Site Explorer exports → `audit-inputs/ahrefs/`.
- **GSC**: Queries/Pages exports (16 months) → `audit-inputs/gsc/`.
- **GA4** (optional): revenue by landing page.
- **Merchant Center**: diagnostics export.
- **Repo**: `data/breadcrumb-taxonomy.csv`, theme Liquid, `refscan.sh`.

## Update frequency
- Weekly: broken-link refscan (local).
- Monthly: metadata/gap detection, orphan/quick-win/CTR parsers, schema sampling, re-pull Ahrefs+GSC, re-prioritize roadmap.
- On change: taxonomy → registry sync.

## Risk controls
- Scripts are read-only + CSV-out; no API writes by default.
- `needs_manual_review` flag on uncertain rows.
- Never overwrite good merchant SEO (enforced in metadata script).
- Guard internal links on `products_count`/existence (no thin/404 links).
- Stage schema/collection changes on a few items, validate, then scale.

## Approval workflow
1. Run detector → review CSV in a spreadsheet.
2. Owner/editor accepts/edits rows (edit `suggested_*`, set approved=yes).
3. Formatter builds a Matrixify import (or GraphQL payload if configured).
4. Import to a **draft/preview** first where possible; spot-check; publish.
5. Validate (Rich Results/GSC) + log in a changelog.

## Rollback plan
- Keep the pre-change export (Shopify or Matrixify) as a backup; re-import to revert.
- Metadata/content changes are data, not code → revert via re-import.
- Theme code changes (link modules) → git revert on the audit branch (no push until reviewed).

## Tooling options
- **Python** (stdlib) for parsers/generators (metadata script already built).
- **Matrixify** app for safe bulk export/import with SEO + metafields.
- **n8n** (optional) to schedule: pull GSC/Ahrefs → run parsers → email CSV to owner.
- **Shopify Admin GraphQL** later, only if credentials are explicitly configured (not now).
- **AI drafts** with mandatory human approval for content types.

## Build order (scripts)
1. ✅ `generate_seo_metadata_plan.py` (done).
2. `generate_link_registry.py` — taxonomy → chip/breadcrumb/sitemap Liquid (highest structural ROI).
3. Ahrefs parsers (orphan, redirect, quick-win, CTR) — after first export.
4. FAQ/description draft generators — after metaobject schema finalized.
