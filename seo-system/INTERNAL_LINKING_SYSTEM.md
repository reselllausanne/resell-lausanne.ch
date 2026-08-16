# Internal Linking System — Resell Lausanne

Goal: scalable, metafield/registry-driven internal links that reduce orphans, strengthen money collections, clarify brand→model→product hierarchy for Google + LLMs, and help users — without spammy link walls.

## What already exists (audit)
| Module | File | Coverage | Gap |
|---|---|---|---|
| Header/menu | `sections/header.liquid`, `snippets/header-drawer-menu.liquid`, `menu-*` | Brand-level | Deep models menu-only |
| Footer | `sections/footer.liquid`, `footer-resell-*` | Some brand/legal | No systematic brand/model column |
| Breadcrumbs | `snippets/product-breadcrumb.liquid` + `breadcrumb-taxonomy-map` + `data/breadcrumb-taxonomy.csv` | Product→vertical→brand→model (135 rows) | Strong; extend coverage |
| Collection chips | `sections/collection-plp-header.liquid` + `snippets/collection-plp-subcollection-chips.liquid` + `plp-subcollection-chip-registry.liquid` | Brand→model chips for 11 brand groups | Missing models (AM97, ultra-boost, asics-running, etc.) |
| Brand chips (catalog) | `collection-plp-brand-chips` (on all/toutes-nos-paires/nouveautes) | Top brands | — |
| Related products | `sections/product-recommendations.liquid` (SSR `<a>` fallback for crawlers) | PDP | Good; ensure SSR links always render |
| Cross-sell rails | `image-tag-slider` (PDP "Souvent acheté ensemble", "Top des ventes") | PDP | Manual collection binding |
| Collection SEO text | `sections/collection-plp-seo-readmore.liquid` + `collection-plp-seo-*-content` (30) | 30 collections | No systematic adjacent-collection links inside text |
| HTML sitemap | `sections/static-sitemap-products.liquid`, `templates/page.plan-du-site.json` | Products | Ensure all indexable collections listed |
| Blog | `resell-blog-*` | Few articles | No auto product/collection linking |

## Modules to build / extend

### 1. Brand → model → product (registry-driven chips) — EXTEND
- Source of truth: **`snippets/plp-subcollection-chip-registry.liquid`** + `data/breadcrumb-taxonomy.csv`.
- Action: add every taxonomy model that is currently unchipped (see `INTERNAL_LINKING_OPPORTUNITIES.csv`: `nike-air-max-97`, `nike-air-max` parent, `adidas-ultra-boost`, `adidas-taekwendo`, `asics-running`, `asics-gel-lyt-iii`, Maison Mihara subs, LEGO subs).
- Rule: chip renders only if `collections[handle]` exists AND `products_count >= 1` (guards against thin/404). 
- Automation: a `data/` CSV → registry generator (see `SEO_AUTOMATION_ARCHITECTURE.md`). Single source keeps chips + breadcrumbs + sitemap in sync.

### 2. Collection → subcollection chips — GOVERN
- Appears on: brand PLPs (Nike, Adidas, ASICS, NB, Yeezy, Jordan, Puma, UGG, Birkenstock, Saucony).
- Rule: max ~12 chips, ordered by commercial priority (money models first), "Autres X" last. Hidden when empty.

### 3. Product → primary collection breadcrumb — KEEP + WIDEN
- Uses `product.metafields.custom.primary_collection_handle` → auto-handle → vendor/title inference → `data/breadcrumb-taxonomy.csv`.
- Action: backfill `primary_collection_handle` metafield on products where inference is weak (see `PRODUCT_SEO_DATA_GAPS.csv`). Emits visible nav + BreadcrumbList schema.

### 4. Product → related model/brand/size/gender collections — ADD
- New PDP block "Explorez aussi" (SSR `<a>`, not JS-only) linking: same model collection, same brand collection, same silhouette, gender collection, and size hub if built.
- Data source: product metafields (`brand_collection_handle`, `model_collection_handle`, `gender`, size).
- Guardrail: 4–6 links max, deduped, only existing collections.

### 5. Collection SEO text → adjacent collections — ADD
- Inside `collection-plp-seo-*-content` templates, add a trailing "Collections liées" line with 3–5 sibling/parent links (e.g., Dunk Low → Dunk High, SB Dunk, Nike, Panda). 
- Automate via a `related_collections` metafield (list.collection_reference) already referenced by `main-collection.liquid`.

### 6. Blog/guide → product & collection links — ADD (semi-auto)
- Article body auto-links brand/model mentions to collections using the taxonomy `aliases` column (e.g., "dunk low", "aj1", "samba" → collection). 
- Implement as a render filter/snippet that scans article rich text for known aliases and links first occurrence only (avoid over-linking).

### 7. Static HTML sitemap improvements — EXTEND
- `page.plan-du-site` should list **every indexable collection** grouped by vertical→brand→model (drive from `data/breadcrumb-taxonomy.csv`), plus key pages. Guarantees ≥1 crawl path to every collection (kills orphans).

### 8. Automated internal-link blocks from metafields — ADD
- Generic snippet `rl-related-collections` reading `collection.metafields.custom.related_collections` / `product.metafields.custom.related_*`, rendering SSR links. Reusable across PDP, PLP, guides.

## Anti-spam rules
- Max link modules per page: breadcrumb + 1 chip row + 1 related block (+ SEO text links). No stacked identical anchor lists.
- Vary anchor text (model name, not repeated "sneakers Suisse").
- Only link existing, non-empty, indexable collections.
- SSR (server-rendered `<a>`) so Google/LLMs see links without JS.

## Shopify data needed
- Metafields: `custom.primary_collection_handle`, `custom.brand_collection_handle`, `custom.model_collection_handle`, `custom.related_collections` (collection), `custom.gender`.
- Metaobjects: none new required for linking (taxonomy CSV drives registry).

## Automation potential
High: registry + breadcrumb + sitemap all derivable from one taxonomy CSV. Build `scripts/generate_link_registry.py` (spec in automation doc) to emit the Liquid registry from `data/breadcrumb-taxonomy.csv`.

## Risks
- Linking empty/thin collections → thin-content + poor UX. Always guard on `products_count`.
- Over-linking → dilution. Enforce max-links rules.
- Chip registry drift vs actual collections → 404/empty. Single-source from taxonomy + existence guard.

## QA
- After changes: `bash .cursor/audit-tmp/refscan.sh` (no broken refs); render Nike/Adidas/ASICS PLP + 1 PDP; confirm chips point to existing collections; re-pull Ahrefs inlinks to confirm orphans dropped.
