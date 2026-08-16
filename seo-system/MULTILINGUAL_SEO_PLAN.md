# Multilingual SEO Plan — Resell Lausanne

Locales present (theme `locales/`): **fr (default), de, en, it, pl**. Market = Switzerland (FR primary; DE + IT are Swiss-relevant; EN international; PL questionable).

## Current implementation (from code — mostly correct)
- **hreflang:** custom `snippets/hreflang-tags.liquid` emits `x-default` + one tag per `localization.available_languages`; `fr` root → `fr-CH`. Shopify **native hreflang is stripped** in `content-for-header.liquid` (no duplicates). Gated off on noindex/404/alias-collection pages.
- **Canonical:** locale URLs use path prefixes (`/de`, `/en`, …); canonical uses Shopify `canonical_url`; hreflang URLs strip query strings.
- **Metadata i18n:** `meta-tags.liquid` has FR/DE/EN per-handle overrides for key pages (concept, faq, size guide, reviews). **IT/PL have no overrides** → fall back to FR/auto.
- **Link localization:** `scripts.liquid` JS rewrites internal links to keep the active locale prefix (skips cdn/checkout/account/policies + `data-no-locale-lock`).

## Recommendations (decide with data — do NOT remove languages automatically)
| Locale | Keep indexed? | Rationale | Action |
|---|---|---|---|
| FR (default) | **Yes** | Primary Swiss-Romande market | Full metadata + content |
| DE | **Yes** | Large Swiss-German market | Ensure real translations (not FR fallback) before pushing index; translate top collections/products metadata |
| IT | **Conditional** | Ticino niche | Index only if translated + has demand (check GSC); else `noindex` until translated |
| EN | **Conditional** | International/tourist + resale terms | Index if translated; good for brand/model terms |
| PL | **Likely no** | No obvious Swiss rationale | Verify GSC traffic; if ~0, consider disabling market or `noindex` (owner decision) |

## Risks to check (validate live / with GSC)
1. **Untranslated pages indexed** (IT/PL showing FR content) → duplicate/thin in that language. Confirm via GSC "Pages" per language.
2. **hreflang → non-canonical**: alias collections are (correctly) excluded from hreflang; verify no hreflang points to a `noindex` or redirected URL.
3. **Reciprocity**: every language version must list all others + x-default. Custom snippet does this from `available_languages` — verify live with an hreflang tester on 1 FR + 1 DE URL.
4. **Language-mixed content**: imported product bodies mixing FR/EN. Standardize FR; translate via Translate & Adapt.
5. **Old market/FR-FR URLs**: none found in code; confirm no `/fr-fr/` legacy URLs in Ahrefs/GSC. If present → 301 to `/` (FR-CH default).

## Metadata translation rules
- Translate `title_tag`/`description_tag` per locale (Shopify Translate & Adapt or metafield translations). Keep brand/model/colorway untranslated.
- Swiss intent word per locale: FR "Suisse", DE "Schweiz", EN "Switzerland", IT "Svizzera".
- Only generate DE/EN metadata for pages worth indexing in that language (top collections + top products first).

## Collection translation priorities (order)
1. Core + top brand collections (Nike, Jordan, Adidas, New Balance, ASICS) — FR ✓, DE next.
2. Top model collections (Dunk Low, Samba, Gazelle, 9060, Kayano 14).
3. Support/trust pages (livraison, retours, authenticité, FAQ) — FR ✓, DE.

## Product translation rules
- H1/title stays brand+model (language-neutral). Translate templated description blocks + title_tag/meta. Don't machine-translate colorway names.

## hreflang validation steps
1. View-source 1 FR + 1 DE collection: confirm x-default + fr-CH + de + en (+it/pl if kept), no duplicate native hreflang.
2. Run an hreflang tester (or Ahrefs "Localization" issues) → 0 missing return tags.
3. Confirm noindex pages emit **no** hreflang (facets, search, `/collections/all`, alias collections).

## Owner decisions needed
- Keep or disable IT / PL markets (data-driven).
- Budget for DE translation of top pages (unlocks Swiss-German search).
