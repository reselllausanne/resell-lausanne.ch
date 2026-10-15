# Core Web Vitals — Why ~4,970 Mobile URLs “Need Improvement”

**Storefront:** production Shopify origin (this repo)  
**Date:** 2026-09-19  
**Sources:** Google Search Console CrUX chart (user), live PageSpeed Insights field (CrUX), local Lighthouse lab, live HTML/CDN probes, git theme history  
**Ahrefs:** no Site Audit / Site Explorer CSVs in `audit-inputs/ahrefs/` (folder empty). Ahrefs Web Analytics *is* loaded on-site; that is traffic analytics, not a CWV crawl. This report uses CrUX + lab instead.
<!-- pragma: allowlist secret -->

---

## 1. Verdict (one line)

**Site-wide mobile LCP p75 sits at 2.9s — just over Google’s 2.5s “Good” line.** INP and CLS are Good. That single miss flips almost every URL with enough Chrome traffic into “Needs improvement,” with **0 Poor**.

---

## 2. What GSC is showing

| Signal | Value |
|---|---|
| Device | Mobile |
| Source | Chrome UX Report (field, real users) |
| As of ~17 Sep 2026 | **4,970** Need improvement · **74** Good · **0** Poor |
| Shape | Cliff ~**4 Aug 2026**: Good collapses, orange spikes; stays elevated; Sep climbs again toward ~5k |

**How to read the cliff**

- Not a gradual SEO crawl problem. Instant site-wide reclassification = shared template / apps / hero / TTFB change that pushed **p75 LCP across 2.5s**.
- **0 Poor** is the tell: field LCP is in the **2.5–4.0s** band (Needs improvement), not ≥4.0s (Poor). Matches measured origin LCP **2.9s**.
- GSC only scores URLs with enough Chrome samples (~5k here). Catalog is ~**98k products × 3 locales** in the XML site-map index — most SKUs never appear in this report.

CrUX is a ~28-day rolling window. An Aug 4 chart cliff usually means the bad experience landed **late July → early August** on the live theme (git only caught up Aug 16).

---

## 3. Live field data (CrUX) — origin mobile

Captured via PageSpeed Insights UI, 2026-09-19:

| Metric | p75 | Status | Good threshold |
|---|---|---|---|
| **LCP** | **2.9s** | **Needs improvement** | ≤ 2.5s |
| **INP** | **156ms** | **Good** | ≤ 200ms |
| **CLS** | **0** | **Good** | ≤ 0.1 |
| FCP | 2.7s | Needs improvement | ≤ 1.8s |
| **TTFB** | **2.2s** | **Poor** | ≤ 0.8s |

**Core Web Vitals assessment: FAILED — only because of LCP.**

INP/CLS are not the GSC orange line. Fix LCP (and the TTFB that feeds it).

---

## 4. Lab confirmation (Lighthouse mobile, simulate)

| URL | Perf score | LCP | CLS | TBT | Notes |
|---|---|---|---|---|---|
| `/` (home) | 0.54–0.62 | **5.9–7.1s** | 0.016–0.191 | 10–680ms | LCP = Ultimate Bundle hero `<img.rl-home__hero-*>` |
| `/collections/nike` | 0.62 | **5.2s** | 0.001 | 520ms | LCP = first product-card media |
| PDP (Wildhorse) | 0.53 | **10.3s** | 0.015 | 400ms | LCP = main gallery media; TTFB curl ~2.5s |

Lab is harsher than field (throttled 4G). Direction matches: **LCP is the broken vital; CLS mostly fine in field.**

---

## 5. Root causes (ranked)

### P0 — Slow TTFB (field 2.2s Poor)

Real-user Time to First Byte at **2.2s** burns most of the 2.5s LCP budget **before paint**. Curl from this environment already sees **~1.3–1.8s** HTML TTFB on home/PLP; PDP samples ~2.5s.

Drivers:

- Heavy Liquid HTML: **~590–660 KB** uncompressed documents (home/PLP/PDP).
- **~230 KB inline `<script>`** per page (Shopify analytics / Web Pixels / trekkie / WPM), not theme CSS.
- Large product grids + SEO JSON-LD + app hooks on every template.

Until TTFB drops under ~0.8–1.0s for CH mobile users, LCP will keep straddling 2.5s even with perfect media.

### P0 — LCP media / preload bugs (home)

1. **Active LCP element** = Ultimate Bundle hero (`rl-home-bundle-offer-*.jpg`, shipped **9 Sep 2026**, commits `9309430` / `cf18f25`).
2. **Head still preloads the old Back-to-School assets** (`lcp-preload-home.liquid` → BTS mobile PNG / desktop webp filenames).
3. BTS **mobile PNG** at width=480 is still **~544 KB**; width=750 **~1.3 MB**; width=1100 **~2.0 MB**. Browser competes for bandwidth on a **non-LCP** asset while the real LCP JPEG (~199 KB mobile asset) waits.
4. Bundle `<picture>` uses **raw `asset_url`** — no CDN width/srcset pipeline → mobile may download the full asset without Shopify CDN resizing.

This aligns with the **September rise** in “Needs improvement” after the Aug cliff.

### P1 — Oversized / remote media on home rails

Lighthouse media-delivery waste **~595–798 KiB**, largely **Storyblok** strip files (`a.storyblok.com`, 70–100 KB PNGs/WebPs served at display sizes that don’t need full resolution). Home also ships **~180 `<img>`** tags and **~2.6–2.9 MB** total transfer.

### P1 — Third-party main-thread tax (INP risk + LCP contention)

Top lab blockers / weight (home):

| Third party | Transfer | Main-thread blocking (lab) |
|---|---|---|
| **Facebook Pixel** (`fbevents.js`) | ~202 KB | **~245–320 ms** |
| **Microsoft Clarity** | ~30 KB | **~100–160 ms** |
| **Google Tag Manager** | **~530–557 KB** | (loads more tags) |
| TikTok | ~49 KB | — |
| Shopify WPM / trekkie / perf-kit | large inline + scripts | hundreds of ms bootup |

Field INP is still Good (156ms), so do **not** chase INP first — but these scripts steal bandwidth and CPU from LCP. Prefer consent-gated / idle / after-LCP load for FB + Clarity + TikTok.

### P2 — Theme weight shipped May→Aug (live before git)

Git gap: last theme merge **5 May**, then **16 Aug** “Sync live theme… after May gap” (`9b3b112`) + Trustpilot/size-modal (`cc02554`). That sync brought homepage rails, size modal, PLP soft-nav, SEO pages, Storyblok strips, etc. onto `main`. **Live Shopify theme already had this during the CrUX window that produced the Aug 4 cliff.** Trustpilot badge itself is CSS/SVG (low CWV risk); the broader template + pixels matter more.

### Not the problem

- **CLS** — field 0; not driving GSC orange.
- **INP** — field Good.
- **Ahrefs technical SEO issues** (titles, hreflang, orphans) — separate from CWV. Repo Ahrefs map is code-prepopulated with **no CSV counts**; dropping exports helps crawl/indexation, **not** this CrUX chart.

---

## 6. Why so many URLs?

Same mobile chrome + header + pixels + PLP/PDP media pattern on nearly every money URL. CrUX groups by URL but the failure is **template-level**. Fix shared LCP/TTFB → thousands of URLs flip back to Good together (same way they flipped orange on Aug 4).

---

## 7. Fix order (highest LCP impact first)

| # | Action | Owner | Expected effect |
|---|---|---|---|
| 1 | **Point `lcp-preload-home.liquid` at the active hero** (bundle JPG today), stop preloading BTS PNG while bundle is slide 0 | Theme | Immediate LCP win on home |
| 2 | Serve hero via Shopify CDN width + `srcset`/`sizes`; convert BTS mobile to **WebP/AVIF &lt;100–150 KB** or remove unused slide | Theme + assets | Cut LCP bytes |
| 3 | **Defer FB / Clarity / TikTok / non-essential GTM tags until after LCP** (or consent). Keep only one analytics stack if possible | Marketing + theme / Customer Events | Free bandwidth + CPU |
| 4 | Shrink HTML: fewer above-fold cards on home; lazy below-fold rails harder; audit Web Pixel payloads | Theme + Shopify apps | Lower TTFB + parse time |
| 5 | PLP/PDP: ensure first product media is correctly sized, `fetchpriority=high`, not competing with header menu media | Theme | Template LCP for ~5k CWV URLs |
| 6 | Re-check origin LCP in PSI weekly; GSC CrUX lags ~28 days | SEO | Confirm Good &lt;2.5s p75 |

**Success bar:** origin mobile LCP p75 **≤ 2.5s** (ideally ≤ 2.2s for buffer). Then GSC “Needs improvement” should collapse over the following month.

---

## 8. Evidence appendix

- GSC screenshot: mobile CrUX cliff ~4 Aug 2026 → 4,970 Need improvement / 74 Good / 0 Poor (17 Sep).
- PSI field (origin): LCP 2.9s NI · INP 156ms Good · CLS 0 Good · TTFB 2.2s Poor (19 Sep 2026).
- Lab Lighthouse JSON: `/tmp/lh-home.json`, `/tmp/lh-plp.json`, `/tmp/lh-pdp2.json` (agent run).
- Live HTML weight: home ~619 KB, Nike PLP ~591 KB, PDP ~663 KB; ~52 inline scripts / ~232 KB.
- Preload bug: `fullstack_2_3_1/snippets/lcp-preload-home.liquid` still BTS; LCP element = bundle (`rl-home-bundle-offer-banner.liquid`).
- Git: theme sync `9b3b112` (2026-08-16); bundle hero `9309430` / lean JPG `cf18f25` (2026-09-09).
- Ahrefs: `audit-inputs/ahrefs/` empty — no Site Audit numbers to merge.

---

## 9. What we could not pull

- Ahrefs Site Audit / Site Explorer exports (not provided).
- Google PageSpeed API (daily quota exceeded for shared key) — compensated with PSI UI field data + local Lighthouse.
