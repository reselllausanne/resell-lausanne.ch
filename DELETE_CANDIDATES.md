# Delete Candidates

Files/code that **appear** unused. Safety policy applied:
- **100%** certain unreachable → may delete (still logged).
- **90–99%** → do NOT delete; candidate only.
- **<90%** → leave untouched, document.

**Nothing in this list was deleted.** Confidence below = "% confident the file is truly unused/unreachable".

Shopify dynamic-use caveats that cap confidence:
- Sections with `presets` are **addable via the theme editor** → a merchant may already use them on a live page.
- `fullstack_2_3_1/config/settings_data.json` and `templates/index.json` are **push-ignored** (`.shopifyignore`), so the *live* section/asset config is not fully represented in this repo.
- Snippets can be rendered via variables (`{% render var %}`) and assets referenced from settings/metafields.
- Review/wishlist/analytics apps can inject references at runtime.

Search method (all rows): `.cursor/audit-tmp/refscan.sh` — ripgrep for each basename across `layout templates sections snippets blocks config locales` (`*.liquid`,`*.json`), excluding the file itself. Dynamic-render patterns (`brand_faq_snippet`, `brand_seo_snippet`) were checked and do not match these names.

---

## A. Orphaned snippets (0 references in repo theme code)

| # | Path | Why it seems unused | Confidence unused | Risk if deleted | Verify before deleting | Decision |
|---|---|---|---|---|---|---|
| 1 | `snippets/judgeme_widgets.liquid` | Header comment "Judge.me widgets — push-safe"; not rendered anywhere in repo | 80% | **High** — reviews (Judge.me) could break if app/theme embed injects it | Check Judge.me app embed + live `settings_data.json`; confirm reviews render via `resell-judgeme-*` only | **KEEP** |
| 2 | `snippets/landing-link-card.liquid` | Documented homepage-rail card; current home uses `image-tag-slider` sections | 90% | Low | Confirm no live home section renders it (index.json is push-ignored) | **KEEP** |
| 3 | `snippets/landing-product-card.liquid` | Same as above (superseded landing system) | 90% | Low | Same as #2 | **KEEP** |
| 4 | `snippets/landing-section-header.liquid` | Same | 90% | Low | Same as #2 | **KEEP** |
| 5 | `snippets/landing-trust-item.liquid` | Same | 90% | Low | Same as #2 | **KEEP** |
| 6 | `snippets/resell-page-livraison-delais.liquid` | Page body for handle `livraison-delais`; only `page.livraison.json` (handle `livraison`) exists in repo | 85% | Medium — a live Admin page `livraison-delais` may render it | Check Shopify Admin for a `livraison-delais` page/template | **KEEP** |
| 7 | `snippets/rl-product-card-compact.liquid` | Documented "premium homepage rails" card; superseded by `rl-image-tag-slider-card` | 90% | Low | Same as #2 | **KEEP** |
| 8 | `snippets/rl-shortcut-pill.liquid` | Documented shortcut pill; superseded homepage component | 90% | Low | Same as #2 | **KEEP** |

## B. Orphaned sections (not in any repo template/section-group)

> All have `presets` (except `main-article`) → theme-editor-addable. Confidence capped accordingly.

| # | Path | Why it seems unused | Confidence unused | Risk if deleted | Verify before deleting | Decision |
|---|---|---|---|---|---|---|
| 9 | `sections/main-blog.liquid` | Base Fullstack blog section; blog templates use `resell-blog-hub`/`-grid` | 88% | Medium — editor could swap it onto a blog template | Confirm no live blog uses it | **KEEP** |
| 10 | `sections/main-article.liquid` | Base article section; articles use `resell-article` | 88% | Medium | Confirm no live article template variant uses it | **KEEP** |
| 11 | `sections/blog-featured.liquid` | Base "featured blog" section, unused | 88% | Medium (has `presets`) | Confirm not added on any page via editor | **KEEP** |
| 12 | `sections/product-featured.liquid` | Base "featured product" section, unused | 88% | Medium (has `presets`) | Confirm not added on any page | **KEEP** |
| 13 | `sections/home-discover-grid.liquid` | Not in `index.json`; has `presets` | 85% | Medium — home config is push-ignored | Inspect live home sections in theme editor | **KEEP** |
| 14 | `sections/collection-plp-brand-strip.liquid` | Superseded by `collection-plp-header` + chips; has `presets` | 85% | Medium | Confirm no collection template variant uses it | **KEEP** |
| 15 | `sections/demo-design-system.liquid` | Developer demo/style-guide section | 92% | Low | Confirm no internal/QA page relies on it | **KEEP** |

## C. Orphaned assets

| # | Path | Why it seems unused | Confidence unused | Risk if deleted | Verify before deleting | Decision |
|---|---|---|---|---|---|---|
| 16 | `assets/component-predictive-search.css` | Not referenced in liquid/json; predictive search styled elsewhere | 85% | Medium — could be loaded via live settings; search popup could lose styling | Diff against `search.css`/`search-popup.liquid`; check live `settings_data.json` | **KEEP** |

## D. Directories / repo-root artifacts

| # | Path | Why it seems unused | Confidence unused | Risk if deleted | Verify before deleting | Decision |
|---|---|---|---|---|---|---|
| 17 | `fullstack_2_3_1/templates/customers 2/` | Empty macOS-style duplicate of `customers/` (0 files) | 95% | None (empty; git ignores empty dirs) | `ls` shows empty | **KEEP** (harmless; owner may `rmdir`) |
| 18 | Repo-root theme tree (`/layout`,`/sections`,`/snippets`,`/blocks`,`/templates`,`/config`,`/locales`,`/assets`) | Not pushed (CLI uses `--path fullstack_2_3_1`); much smaller; likely original Skeleton | 70% | **High** — could be a separate/staging Shopify theme | Confirm in Shopify Admin which theme(s) exist and their source; check any other CLI profiles/CI | **KEEP** |
| 19 | `css wethenew.css` (repo root, ~98 KB) | External reference stylesheet, not in `fullstack_2_3_1/assets`, not referenced by theme | 90% | None to theme | Confirm it is a design-reference scratch file | **KEEP** (owner may remove) |
| 20 | `resell-homepage.png`, `size-modal-local-mobile.png` (repo root) | Scratch screenshots at repo root | 90% | None to theme | Confirm not used as theme assets (they are not in `assets/`) | **KEEP** (owner may remove) |

---

### Recommended safe cleanup order (after owner confirmation)
1. `templates/customers 2/` (empty) + root scratch files (#17, #19, #20) — zero theme risk.
2. `demo-design-system` (#15) — dev-only.
3. `landing-*` + `rl-product-card-compact` + `rl-shortcut-pill` (#2–5,7,8) — after confirming live home config.
4. Base leftovers `main-blog`/`main-article`/`blog-featured`/`product-featured` (#9–12) — after confirming editor usage.
5. Root theme tree (#18) — **only** after confirming no Shopify theme maps to it.
