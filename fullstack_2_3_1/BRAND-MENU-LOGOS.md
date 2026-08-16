# Brand menu logos — upload guide

Use this when adding logos for:

- Mobile menu drawer (Sneakers → brands)
- Collection PLP brand strip (`/collections/all` + `?brand_strip=other`)
- Anywhere `brand-menu-logo-url.liquid` / `menu-brand-image.liquid` is used

**Checklist (spreadsheet):** [`data/brand-menu-logos-checklist.tsv`](data/brand-menu-logos-checklist.tsv)

---

## Image spec

| Rule | Value |
|------|--------|
| Format | PNG or SVG, **transparent background** |
| Content | Official **brand mark / logo only** (not product photos) |
| Size | **96×96 px** minimum (theme renders at 36×36 in chips, 45×45 in drawer) |
| Safe area | Logo centered with ~10% padding inside square |
| Rights | You must have permission to use the mark (your assets, brand press kit, or merchant-provided files) |

---

## Option A — Shopify metafield (recommended)

Works without redeploying the theme. Overrides theme fallbacks automatically.

### 1. Create metafield (once)

1. **Shopify Admin** → **Settings** → **Custom data** → **Collections**
2. **Add definition**
   - Name: `Menu brand image`
   - Namespace and key: `custom.menu_brand_image`
   - Type: **File** → accept images only (PNG, SVG, WEBP)

Optional fallback (drawer only): `custom.brand_logo` — same type.

### 2. Upload per brand

1. **Products** → **Collections** → open the brand (e.g. Nike)
2. **Metafields** → **Menu brand image** → upload file
3. Save

Repeat for every row in `data/brand-menu-logos-checklist.tsv`.

Mark `uploaded_y` column when done.

---

## Option B — Theme assets (bulk / dev)

Drop files in:

```text
fullstack_2_3_1/assets/
```

**Exact filenames** (must match handle):

| Collection handle | Filename |
|-------------------|----------|
| `air-jordan` | `brand-logo-air-jordan.svg` or `.png` |
| `nike` | `brand-logo-nike.svg` |
| `asics` | `brand-logo-asics.png` |
| `yeezy` | `brand-logo-yeezy.png` |
| `adidas` | `brand-logo-adidas.svg` |
| `new-balance` | `brand-logo-new-balance.svg` |
| `maison-mihara` | `brand-logo-maison-mihara.png` |
| `crocs` | `brand-logo-crocs.png` |
| `mizuno` | `brand-logo-mizuno.png` |
| `puma` | `brand-logo-puma.svg` |
| `on` | `brand-logo-on.png` |
| `salomon` | `brand-logo-salomon.png` |
| `converse` | `brand-logo-converse.png` |
| `alexander-mcqueen` | `brand-logo-alexander-mcqueen.png` |
| `hoka` | `brand-logo-hoka.png` |
| `saucony` | `brand-logo-saucony.png` |

Then `shopify theme push` (or your usual deploy).

**Priority uploads** (no theme fallback yet): `on`, `salomon`, `converse`, `alexander-mcqueen`, `hoka`, `saucony`.

---

## Brand lists (synced with menu drawer)

### Primary strip — Sneakers menu

Air Jordan, Nike, Asics, Yeezy, Adidas, New Balance, Maison Mihara, Crocs, Mizuno, **Autres marques** (`+` chip, no logo)

### Other strip — Autres marques (`/collections/all?brand_strip=other`)

On Running, Puma, Salomon, Converse, Alexander McQueen, Hoka, Saucony, **Autres marques**

---

## Priority order

1. **Other tier** — On, Salomon, Converse, Hoka, Saucony, Alexander McQueen (text-only today)
2. **Primary** — replace theme placeholders if you have better official marks (Yeezy, Maison Mihara, Asics)
3. **Metafield on all** — one source of truth for menu + PLP + future surfaces

---

## Code reference

| File | Role |
|------|------|
| `snippets/brand-menu-logo-url.liquid` | Resolves URL: metafield → theme asset |
| `snippets/menu-brand-image.liquid` | Drawer `<img>` |
| `snippets/collection-plp-brand-chip.liquid` | PLP chip |
| `snippets/collection-plp-brand-chips-drawer-track.liquid` | Brand lists |

**Metafield wins** over `assets/brand-logo-*` when both exist.
