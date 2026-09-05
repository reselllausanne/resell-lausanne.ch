# Ultimate Bundle - Admin Setup

## How the offer works

Same idea as express shipping: the theme does **not** rewrite 3 random cart lines.

Click on the PDP card adds **one product**: `Ultimate Bundle`, at the price you set in Admin (CHF 49.90), with compare-at CHF 88.80 shown struck through.

Someone who adds tee + kit + lingettes by hand does **not** get the deal. Only the dedicated product does.

## Create the product (do this)

1. Shopify Admin -> Products -> Add product.
2. Title: `Ultimate Bundle`
3. Handle: `ultimate-bundle`
4. Status: Active. Channel: Online Store.
5. Price: `49.90`
6. Compare-at price: `99.00`
7. Options:
   - Color: `Light Oatmeal`, `Stretch Limo`
   - Size: `XS`, `S`, `M`, `L`
8. Variant images: tee photo per color if you have them.
9. Tag: `ultimate-bundle`
10. Inventory: track it. This SKU is what decrements until you later convert it to the Bundles app.
11. Visibility: exclude from normal collections and search. Keep purchasable.

Theme lookup order:

- `ultimate-bundle`
- `ultimate-bundle-4990`
- or two products: `ultimate-bundle-light-oatmeal` + `ultimate-bundle-stretch-limo`

If none of these exist, the PDP card stays hidden.

## Optional later: Shopify Bundles app

Convert this product to a fixed bundle so stock of tee + kit + lingettes decrements for real. Sizes come from the tee component automatically. Not required for the offer to sell at 49.90.

## Do not create

- Automatic discount on tee + kit + wipes. That matches people who add the 3 products separately.
- JavaScript price edits.

## Test

1. Hard refresh PDP with theme dev running.
2. Add sneaker -> cart step -> Ultimate Bundle card visible.
3. Pick color + size -> add.
4. Cart: **one line** `Ultimate Bundle`, price 49.90, compare-at 88.80.
5. Tee / kit / lingettes added separately still full price.
