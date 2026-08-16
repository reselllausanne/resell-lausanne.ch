# Local SEO Plan — Resell Lausanne

Resell Lausanne has a Swiss/local identity (LocalBusiness schema already present: Bussigny 1030 VD, geo 46.5530/6.5561). Goal: capture "sneakers Lausanne / Suisse", "resell suisse", "sneakers authentiques Suisse" and build local trust.

## Current state
- LocalBusiness + Organization schema live (address, geo, hours, sameAs incl. Instagram, Trustpilot, Judge.me, Google review link `g.page/r/...`).
- Contact page exists (`page.contact` + `resell-page-contact`), email contact@resell-lausanne.ch.
- No dedicated local landing page / "sneakers Lausanne" collection yet.

## Pages to improve / create
| Page | Action | Priority |
|---|---|---|
| Home + core collection | Add "Suisse" trust line + local signals (livraison CH, Twint, Lausanne) | P1 |
| `/collections/toutes-nos-paires` | Strengthen as "sneakers Suisse" hub (intro targets sneakers/baskets Suisse) | P1 |
| **New:** `/pages/sneakers-lausanne` (or collection) | Local landing: who we are, Lausanne/Suisse, authenticity, delivery, GBP embed/link, reviews, links to top collections | P2 |
| Contact/About | Add NAP (Name/Address/Phone) consistent w/ GBP, map, opening info if applicable | P2 |
| FAQ | Add local Q&A (retrait Lausanne? livraison Suisse? paiement Twint/Powerpay?) | P2 |

## Schema improvements
- Keep LocalBusiness accurate; if there is a storefront/pickup, add `Store` type + `hasOfferCatalog`; if online-only, keep LocalBusiness but ensure address is real/consistent with GBP.
- Add `areaServed` (Suisse + cantons) — Organization already lists areaServed countries; add CH regions where relevant.
- Link `sameAs` to Google Business Profile + Trustpilot + Instagram (mostly present).
- If store pickup offered: `OfferShippingDetails`/`LocalBusiness` pickup + Shopify local pickup.

## Content blocks (reusable)
- Local trust strip: "Boutique suisse • Authenticité garantie • Livraison CH rapide • Twint & Alma".
- Local FAQ metaobjects: retrait/pickup, délais CH, moyens de paiement suisses, TVA.
- Reviews block (Judge.me + Google + Trustpilot) — already have review systems.

## Internal links
- Footer: link local page + contact + "sneakers Suisse" core collection site-wide.
- About/concept page → top brand collections.
- Local page → top money collections (Nike, Jordan, Adidas, NB).

## Google Business Profile (GBP) recommendations (owner, off-site)
- Claim/verify GBP; category "Shoe store" / "Sneaker store"; consistent NAP with schema.
- Add products, posts (new arrivals), photos; collect Google reviews (link already in schema).
- Ensure website link → homepage (or local page).

## Review strategy
- Judge.me for product/store reviews (owns rating schema). Funnel post-purchase → Judge.me + Google. Display Trustpilot + Judge.me + Google badges on local + PDP (already have trust snippets).

## Validation
- LocalBusiness in Rich Results Test (no errors).
- Search "sneakers Lausanne" / "sneakers Suisse" → track ranking + GBP presence.
- NAP consistency: site schema == GBP == footer.
- GSC: monitor local query impressions (filter country=CH).

## Risks
- NAP inconsistency (schema Bussigny vs GBP) hurts local trust — reconcile the real address first (owner).
- Don't fabricate a storefront/pickup if online-only.
