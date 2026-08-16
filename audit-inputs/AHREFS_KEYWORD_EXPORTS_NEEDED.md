# Ahrefs keyword / opportunity exports needed

Drop in `audit-inputs/ahrefs/site-explorer/` (and `keywords-explorer/`). Set country = **Switzerland** primarily; also pull France for FR overflow. Export FR, and DE/EN if those locales are indexed.

## Site Explorer (resell-lausanne.ch)
| # | Export | Path | Use |
|---|---|---|---|
| 1 | Organic keywords (all) | Site Explorer → Organic keywords → Export | current rankings + positions |
| 2 | Top pages | Organic → Top pages | which URLs earn traffic |
| 3 | Competing pages | Organic → Competing pages | cannibalization / gaps |
| 4 | Content gap | Competitive analysis → Content Gap (vs Wethenew, Impact Premium, kickgame, etc.) | keywords competitors rank for, we don't |
| 5 | Keywords positions 4–20 | Organic keywords → filter position 4–20 | quick-win optimization targets |
| 6 | Keywords by country/language | Organic → filter by country | CH vs FR split |
| 7 | Best by links | Pages → Best by links | internal-link boost targets |
| 8 | Best by traffic | Pages → Best by traffic | protect/expand |
| 9 | Pages with declining traffic | Organic → Movements / compare dates | fix decay |

## Keywords Explorer (seed lists — CH)
Export "Matching terms" + "Related terms" + volume/KD for seeds:
- Brands: `nike`, `air jordan`, `adidas`, `new balance`, `asics`, `yeezy`, `puma`, `ugg` (+ " suisse")
- Models: `dunk low`, `air jordan 1`, `air jordan 4`, `adidas samba`, `adidas gazelle`, `new balance 9060`, `new balance 2002r`, `new balance 1906r`, `asics gel-kayano 14`, `asics gel-nyc`, `nike vomero 5`, `nike tn`, `puma speedcat`, `labubu`
- Intent: `sneakers femme`, `sneakers homme`, `sneakers enfant`, `sneakers pas cher`, `baskets tendance`, `sneakers authentiques`, `resell suisse`
- Local: `sneakers lausanne`, `magasin sneakers lausanne`, `sneakers suisse`, `acheter sneakers suisse`

## Competitors (SERP)
- SERP overview export for top 10 target keywords → identify SERP competitors (Wethenew, Kickgame, Impact Premium, local CH shops).

## GSC (complements, often more current than Ahrefs for CH)
- Queries + Pages (16 months), filter country=Switzerland; export queries with impressions>50 & position 5–20 (low-CTR quick wins).

> Interim: `seo-system/SEO_OPPORTUNITY_BACKLOG.md` is seeded from the existing `audit-results/collections-manquantes-a-valider` volumes + taxonomy + known demand. Replace estimates with exported volume/KD when available.
