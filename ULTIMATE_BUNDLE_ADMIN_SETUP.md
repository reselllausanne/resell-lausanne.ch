# Ultimate Bundle - Admin Setup

## Scope

Theme implementation done local side. Shopify Admin changes not executed from theme code. Run checklist manually in Shopify Admin.

## 1) Create fixed bundle product in Shopify Bundles app

1. Open Shopify admin -> Apps -> Shopify Bundles.
2. Create bundle type: fixed bundle.
3. Add components:
   - Essentials Tee, quantity `1`, include all real available sizes.
   - Cleaning kit, quantity `1`.
   - Wipes, quantity `1`.
4. Validate stock sync:
   - Bundle stock driven by most constrained component.
   - Components decrement separately in order lines.
5. Save bundle.

## 2) Configure bundle product fields

- Title: `Ultimate Bundle`
- Price: `CHF 49.90`
- Compare-at price: `CHF 88.80`
- Status: `Active`
- Sales channel: `Online Store`
- Tag: `ultimate-bundle`
- Product image: composite image showing tee + kit + wipes
- Keep manually maintained pricing policy:
  - Shopify Bundles does not auto-recalculate bundle price when component prices change.

## 3) Variant and size checks

1. Ensure size variants exist and map to real Essentials Tee size options.
2. Ensure out-of-stock sizes are unavailable for add-to-cart.
3. Ensure at least one size in stock; otherwise card hidden in cart.

## 4) Product visibility rules

Apply all:

1. Exclude from normal public collections.
2. Exclude from search results in theme logic or search merchandising.
3. Exclude from normal recommendation modules.
4. Keep purchasable via cart card only.

## 5) Quantity policy

1. Set max desired `1` per order at operational level.
2. Theme enforces single quantity in cart UI for Ultimate Bundle.

## 6) Cost fields (internal only, never customer-facing)

Set component costs in Admin / inventory costing:

- Tee: `CHF 25`
- Cleaning kit: `CHF 4`
- Wipes: `CHF 2`

Bundle economics used by theme analytics config:

- Estimated COGS current: `CHF 31`
- Estimated COGS bulk future: `CHF 29`
- Effective VAT: `2.3%`
- Shopify variable fees: `2%`
- Conservative extra shipping: `CHF 7`

## 7) IDs to copy into Theme Editor

After product creation, copy:

1. Bundle product ID for CHF 49.90 (`ultimate_bundle_product_4990`).
2. Optional future bundle product ID for CHF 59.90 (`ultimate_bundle_product_5990`).
3. Validate variant IDs by size for QA and order checks.

## 8) Order validation after publish

Run one test order and validate:

1. Order lines show real component SKUs separately.
2. Selected tee size propagated correctly.
3. Stock decremented on each component.
4. Fulfillment weight/logic based on components.

