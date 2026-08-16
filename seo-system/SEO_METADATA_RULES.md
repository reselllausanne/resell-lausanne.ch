# SEO Metadata Rules — Resell Lausanne

Deterministic rules for generating SEO titles + meta descriptions at scale. Consumed by `scripts/generate_seo_metadata_plan.py`. FR primary; DE/EN via translation. **Never overwrite good merchant-written SEO.**

## Length targets
- SEO title: **45–60 chars** ideal (hard cap ~60 before truncation). Brand name suffix " | Resell Lausanne" counts.
- Meta description: **120–155 chars** ideal.
- Flag < / > targets as `weak` but only regenerate when missing/duplicate/too-long or clearly poor.

## Do-NOT-overwrite rules
Skip (leave as-is) when the resource has a merchant `title_tag`/`description_tag` (Shopify SEO fields) that is:
- present, AND
- within length bounds (title ≤60, meta 120–160), AND
- not duplicated across >1 resource, AND
- not a raw dump of the title only.
Otherwise generate a suggestion and set `needs_manual_review` appropriately.

## Product formulas
- Title: `{Brand} {Model} {Colorway} | Resell Lausanne` → if >60, drop colorway, else drop " | Resell Lausanne" (theme adds shop name). 
- Meta: `{Brand} {Model} {Colorway} authentique en Suisse. Tailles EU, livraison CH/EU, paiement Twint & Alma. Authenticité garantie Resell Lausanne.` (trim to 155 at word boundary).

## Collection formulas
- Brand: Title `{Brand} — Sneakers authentiques Suisse | Resell Lausanne`; Meta `{Brand} authentiques en Suisse : {top models}. Livraison rapide, paiement Twint & Alma, authenticité garantie.`
- Model: Title `{Model} authentiques en Suisse | Resell Lausanne`; Meta `{Model} authentiques en Suisse : {colorways/notes}. Livraison CH/EU, authenticité garantie.`
- Category/Core: Title `{Category} — Sneakers & streetwear Suisse | Resell Lausanne`.
- Gender/Price/Local: Title `{Intent} en Suisse | Resell Lausanne` (e.g., "Sneakers femme", "Sneakers pas cher", "Sneakers à Lausanne").

## Brand/model detection
Use `data/breadcrumb-taxonomy.csv` (brand, model_title, aliases) to normalize brand/model from vendor + title. Colorway = title tail after model. Style code = token matching `[A-Z]{2}\d{4}-\d{3}` or vendor-specific.

## Multilingual (FR/DE/EN)
- Generate FR first. DE/EN: translate the templated sentence, keep brand/model/colorway untranslated. Swiss intent words: FR "Suisse", DE "Schweiz", EN "Switzerland". Payment "Twint & Alma" kept.
- Only produce DE/EN suggestions for pages worth indexing in those languages (see `MULTILINGUAL_SEO_PLAN.md`).

## Anti-duplication
- Vary meta lead sentence per resource (rotate templates) so 50 Nike models don't share identical meta.
- Dedup check: if two suggested titles collide, append distinguishing token (colorway/model/year).

## Examples
| Resource | Current | Suggested title | Suggested meta |
|---|---|---|---|
| product Nike Dunk Low Panda | (title only) | Nike Dunk Low Panda \| Resell Lausanne | Nike Dunk Low Panda authentique en Suisse. Tailles EU, livraison CH/EU, paiement Twint & Alma. Authenticité garantie Resell Lausanne. |
| collection adidas-samba | (fallback) | Adidas Samba OG authentiques en Suisse \| Resell Lausanne | Adidas Samba OG authentiques en Suisse : coloris classiques et éditions. Livraison rapide, paiement Twint & Alma, authenticité garantie. |
| collection nike | (fallback) | Nike — Sneakers authentiques en Suisse \| Resell Lausanne | Achetez vos Nike authentiques en Suisse : Dunk, Air Force 1, Air Max, TN. Livraison rapide, authenticité garantie. |

## Output contract
`SEO_METADATA_SUGGESTIONS.csv`: resource_type, handle, url, current_title, suggested_title, current_meta_description, suggested_meta_description, reason, priority, needs_manual_review.
- `needs_manual_review=yes` when: colorway/model uncertain, translation, brand-ambiguous, or current SEO exists but flagged.
