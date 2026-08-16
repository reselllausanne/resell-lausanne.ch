# Content & Keyword Strategy — Resell Lausanne (2026-07-03)

Built from **live Ahrefs data** (keywords-explorer + site-explorer, CH & FR). This is the "what to rank for and how" plan that sits on top of the technical fixes already shipped.

---

## The core finding (read this first)

Your problem is **not** a lack of pages. You have ~18,600 products + 210 collections. Your problem is that the pages you already have **don't rank**, while the keywords they target are huge and easy:

| Keyword (CH) | Volume/mo | KD | You sell it? | You rank |
|---|---|---|---|---|
| adidas samba | 28,000 | 0 | ✅ `/collections/adidas-samba` | pos ~27 |
| asics | 25,000 | 0 | ✅ `/collections/asics` | weak |
| new balance | 24,000 | 5 | ✅ `/collections/new-balance` | weak |
| asics gel nyc | 21,000 | 0 | ✅ `/collections/gel-nyc` | weak |
| jordan 4 | 7,800 | 0 | ✅ `/collections/air-jordan-4` | weak |
| new balance 530 | 7,300 | 0 | ✅ `/collections/new-balance-530` | weak |
| yeezy slides | 5,500 | 0 | ✅ `/collections/yeezy-slide` | weak |
| asics gel kayano 14 | 5,600 | 0 | ✅ | pos ~30 |
| nike dunk low | 2,400 | 0 | ✅ `/collections/nike-dunk` | weak |
| air max 95 | 2,100 | 0 | ✅ `/collections/nike-air-max-95` | pos 15 |

**KD 0 means anyone can rank.** You don't because of (a) low page-level authority (internal + external links), (b) on-page not fully optimized, (c) technical leaks (now largely fixed). This is an **execution problem on existing pages**, and it's where 80% of the near-term revenue is — NOT in new content.

Second finding: **CH informational/blog search volume is near-zero.** "How to / comment" queries barely exist in Switzerland alone. Blog content only earns meaningful traffic when it targets **FR and DE** volume (10–20× bigger), where you also compete harder. So blog is a real but **second-priority, long-game** lever, not the first move.

---

## Priority ladder (highest ROI first)

### P0 — Win the commercial pages you already have (revenue now)
The KD-0 category + model terms above. Levers, in order of impact:
1. **Internal link equity** to money collections (mega-menu + collections hub + cross-links). Shipped partially (footer hub link, chip registry). The high-volume collections were verified to have only ~1 internal link each — that's the ceiling.
2. **On-page**: keyword-first title + `Suisse`/`Schweiz` geo, one clear H1, unique intro copy (the `collection-plp-seo-*-content` system). Shipped for most; Golden Goose gap filled this pass.
3. **The technical fixes already shipped** (crawlable /de /en links, canonical fixes, alt, schema, title bug) unlock crawl/index of the catalog — measure on recrawl.
4. **Backlinks + authority** (off-page ceiling — see P3).

**Action:** pick the top ~20 money collections (samba, asics, gel-nyc, new-balance + its models 530/9060/204L/550/2002r, jordan 4, nike-dunk, air-max-95, yeezy + slides, gel-kayano-14, air-max-plus-tn). For each: confirm title+H1+intro copy + at least 3 strong internal links. Track positions in `rank-baseline-20260703.csv`.

### P1 — Model-level collection coverage (capture the long tail of high-volume models)
Ahrefs shows huge, KD-0 demand for **specific models**, each deserving its own optimized collection page:
- New Balance: 530 (7,300), 9060 (3,200), 204L (2,900), 550 (1,400), 740 (1,400), 2002r (1,000), 574 (900), 1906/1906r (800). 
- Air Max: 95 (2,100+900), 90 (1,300+800), Plus/TN (1,000), Air Max 1.
- ASICS: Gel-NYC (21k), Kayano 14 (5.6k), Gel 1130 (1,700), Novablast 5 (1,200), Gel Nimbus (800), GT-2000 (800).
- Jordan: 4 (7,800), 1 (3,400), 3 (900).
- Yeezy: slides (5,500), 700 (900).
- Adidas Samba + "samba damen" (1,000).
- Gender splits: "sneakers damen" (1,800), "sneakers herren" (1,000), "adidas samba damen" (1,000), "new balance damen" (800) → ensure femme/homme collections target DE + FR gendered terms.

**Action:** audit which of these have a dedicated collection with optimized title/H1/content. Most exist; fill gaps + optimize. Full list to be produced as `MODEL_COLLECTION_COVERAGE.csv` on request.

### P1 — German (DE) targeting (you're bilingual, you're ignoring half the market)
CH is ~63% German-speaking. Real DE volume, KD 0, you have `/de/`:
- "asics schuhe" 2,600 · "new balance schuhe" 2,500 · "sneakers damen" 1,800 · "sneakers herren" 1,000 · "new balance damen" 800 · "asics laufschuhe" 800.
**Action:** ensure `/de/` collection SEO titles/H1 use the German head terms ("… Schuhe", "Damen/Herren", "Laufschuhe"). Currently your DE titles are largely French/translated — they should carry the German keyword. (DE SEO title overrides need per-locale metafields or translated content — flag for a dedicated pass.)

### P2 — Content / guides (blog) — FR/DE volume, funnels to PDP, builds authority
CH blog volume ≈ 0, so **write for FR (default locale) + DE**. Highest-value, low-KD, commercial-adjacent topics (all confirmed KD 0 in FR):

**Sizing / fit guides** (the #1 sneaker purchase barrier → converts + funnels to PDP):
- "comment taille New Balance" 800 · "New Balance taille petit ou grand" 450+350 · "comment taille les New Balance" 300
- "adidas taille petit ou grand" 500 · "comment taille adidas" 400
- "nike taille grand ou petit" 350
→ One authoritative **"Guide des tailles"** hub + per-brand fit articles (New Balance, Adidas, Nike, ASICS, Jordan). You already have a `/pages/guide-des-tailles` — expand it into brand-specific sections/articles, each internally linking the brand collection.

**Authentication / "comment reconnaître"** (trust + resale USP — you already have legit-check scraped data in `audit-results/legitcheck-scrape/`):
- "comment reconnaître une vraie {Jordan 1 / Dunk / Samba / Yeezy / Air Force 1}" — build a legit-check series. Funnels to PDPs, earns links, reinforces E-E-A-T for a resale store.

**Buying / model guides & comparisons** (top-funnel, links):
- "{model} avis", "{model} prix", "{model} date de sortie", "New Balance 530 vs 550", "meilleures sneakers rétro 2026", "quelles sneakers avec un jean", etc. Target FR volume.

**Action:** stand up a real editorial calendar in the existing blog (`/blogs/news`), 2–4 articles/month, each: FR primary + DE translation, internal links to the matching collection/PDPs, schema (Article + FAQ). Priority order: sizing guides → authentication → model guides/comparisons.

### P3 — Off-page (the actual ceiling — outside theme code)
KD 0 terms and you still rank page 2–3 ⇒ page authority is the bottleneck. You have 236 referring domains (decent) but they don't reach category pages.
1. **Backlinks to category pages**: digital PR, sneaker-blog features, "best places to buy X in Switzerland" listicles, supplier/brand partner links. Point them at money collections, not just the homepage.
2. **Google Business Profile**: you rank for "sneakers lausanne" #2, "tiger lausanne" #8 → local pack is free visibility. Optimise GBP, get reviews.
3. **Google Merchant Center / free Shopping listings**: with 18k products this is likely a bigger channel than organic blue links. Feed quality (titles, GTIN, availability) + free listings.
4. **Digital PR / drops calendar**: "release dates" content + newsletter earns natural links in the sneaker niche.

---

## Keyword → page-type mapping (rule of thumb)

| Intent | Example | Target page | Action |
|---|---|---|---|
| Brand head | "asics", "new balance" | brand collection | title+H1+content+links |
| Model | "new balance 530", "air max 95" | model collection | dedicated optimized collection |
| Model + attribute | "asics gel nyc rose", "air max 95 black" | filtered collection or best-match PDP | ensure indexable, keyword in title |
| Geo | "asics suisse", "sneakers lausanne" | brand collection / home | keep "Suisse"/"Lausanne" in title (done) |
| Gender | "sneakers damen", "new balance damen" | femme/homme collection | DE + FR gendered titles |
| Sizing | "comment taille New Balance" | guide/blog | brand fit guide → link collection |
| Authentication | "reconnaître vraie Jordan 1" | blog | legit-check article → link PDP/collection |
| Release/news | "{model} date de sortie" | blog | drops article → link collection |

---

## Honest ROI ranking

1. **Fix ranking of existing commercial pages** (P0) — biggest, fastest, cheapest. Mostly execution + off-page.
2. **DE targeting** (P1) — half your market, currently under-served, KD 0.
3. **Model collection coverage** (P1) — capture the model long tail.
4. **Sizing + authentication guides** (P2) — converts, funnels, builds authority; FR/DE volume.
5. **Off-page: backlinks + GBP + Merchant Center** (P3) — the ceiling; without this, page-2 terms won't reach top-3.

Blog-for-blog's-sake is NOT the first move. Win the money pages first; use content to support them and to build the authority that lifts everything.

---

## Next concrete deliverables (say which and I'll build)
- `MODEL_COLLECTION_COVERAGE.csv` — every high-volume model term × does an optimized collection exist × gap.
- DE SEO title plan for `/de/` collections (German head terms).
- Editorial calendar: 12 articles (sizing + authentication + model guides) with target keyword, FR+DE, internal-link map.
- Off-page brief: backlink target list + GBP + Merchant Center feed checklist.
