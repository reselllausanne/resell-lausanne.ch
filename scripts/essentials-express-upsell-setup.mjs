// Set standard CHF 59 + express CHF 89 (48h) on Essentials upsell products.
//
// Usage:
//   node --env-file=apps/.env scripts/essentials-express-upsell-setup.mjs --dry-run
//   node --env-file=apps/.env scripts/essentials-express-upsell-setup.mjs

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

const STANDARD_PRICE = "59.00";
const EXPRESS_PRICE = "89.00";
const CURRENCY = "CHF";
const DELIVERY_ESTIMATION = "48H";
const DELIVERY_BETWEEN = "48h";
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 20;

const PRODUCT_HANDLES = [
  "essentials-shorts-light-oatmeal-ss22-copy",
  "essentials-shorts-dark-oatmeal-ss22",
  "essentials-shorts-stretch-limo-ss22",
  "essentials-tee-light-oatmeal-ss22",
  "fear-of-god-essentials-jersey-crewneck-t-shirt-black-1",
];

if (!SHOP || !TOKEN) {
  console.error("✗ Missing SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN in env.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables = {}) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt > 5) throw new Error(`HTTP ${res.status} after retries`);
      await sleep(400 * 2 ** (attempt - 1));
      continue;
    }

    const json = await res.json();
    if (json.errors) throw new Error(JSON.stringify(json.errors));
    return json.data;
  }
}

const PRODUCT_BY_HANDLE = `
  query ProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      variants(first: 100) {
        nodes {
          id
          title
          price
        }
      }
    }
  }
`;

const METAFIELDS_SET = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key }
      userErrors { field message code }
    }
  }
`;

const VARIANTS_BULK_UPDATE = `
  mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }
`;

function moneyValue(amount) {
  return JSON.stringify({ amount: Number(amount).toFixed(2), currency_code: CURRENCY });
}

function variantMetafields(variantId) {
  return [
    {
      ownerId: variantId,
      namespace: "custom",
      key: "express_price",
      type: "money",
      value: moneyValue(EXPRESS_PRICE),
    },
    {
      ownerId: variantId,
      namespace: "custom",
      key: "delivery_estimation_text",
      type: "single_line_text_field",
      value: DELIVERY_ESTIMATION,
    },
    {
      ownerId: variantId,
      namespace: "custom",
      key: "delivery_between_text",
      type: "single_line_text_field",
      value: DELIVERY_BETWEEN,
    },
    {
      ownerId: variantId,
      namespace: "custom",
      key: "express_available",
      type: "boolean",
      value: "true",
    },
    {
      ownerId: variantId,
      namespace: "custom",
      key: "express_delivery_promise",
      type: "single_line_text_field",
      value: DELIVERY_ESTIMATION,
    },
  ];
}

function productMetafields(productId) {
  return [
    {
      ownerId: productId,
      namespace: "custom",
      key: "show_48h_picto",
      type: "boolean",
      value: "true",
    },
  ];
}

async function fetchProducts() {
  const products = [];
  for (const handle of PRODUCT_HANDLES) {
    const data = await gql(PRODUCT_BY_HANDLE, { handle });
    const product = data.productByHandle;
    if (!product) {
      console.warn(`⚠ Not found: ${handle}`);
      continue;
    }
    products.push(product);
    await sleep(100);
  }
  return products;
}

async function applyMetafieldBatch(metafields) {
  if (DRY_RUN) return { userErrors: [] };
  const data = await gql(METAFIELDS_SET, { metafields });
  return data.metafieldsSet;
}

async function updateVariantPrices(product) {
  const needsUpdate = product.variants.nodes.filter(
    (v) => Number(v.price).toFixed(2) !== STANDARD_PRICE
  );
  if (!needsUpdate.length) {
    console.log(`  prices OK (${STANDARD_PRICE} CHF)`);
    return 0;
  }

  console.log(
    `  updating ${needsUpdate.length} variant price(s) → ${STANDARD_PRICE} CHF`
  );

  if (DRY_RUN) return needsUpdate.length;

  const data = await gql(VARIANTS_BULK_UPDATE, {
    productId: product.id,
    variants: needsUpdate.map((v) => ({
      id: v.id,
      price: STANDARD_PRICE,
    })),
  });

  const errors = data.productVariantsBulkUpdate.userErrors || [];
  if (errors.length) {
    console.error("  ✗ price update", errors);
    return 0;
  }
  return needsUpdate.length;
}

async function main() {
  console.log(DRY_RUN ? "▶ DRY RUN" : "▶ LIVE WRITE");
  console.log(`Standard: ${STANDARD_PRICE} ${CURRENCY} | Express: ${EXPRESS_PRICE} ${CURRENCY} (${DELIVERY_ESTIMATION})\n`);

  const products = await fetchProducts();
  console.log(`Found ${products.length}/${PRODUCT_HANDLES.length} products\n`);

  const queue = [];
  for (const product of products) {
    console.log(`• ${product.title} (${product.handle})`);
    console.log(`  variants: ${product.variants.nodes.length}`);
    await updateVariantPrices(product);
    queue.push(...productMetafields(product.id));
    for (const variant of product.variants.nodes) {
      queue.push(...variantMetafields(variant.id));
    }
  }

  console.log(`\nMetafields to write: ${queue.length}`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    const result = await applyMetafieldBatch(batch);
    const userErrors = result.userErrors || [];

    if (userErrors.length) {
      errors += userErrors.length;
      console.error("✗", userErrors);
    } else {
      updated += batch.length;
    }

    await sleep(200);
  }

  console.log(`\n${DRY_RUN ? "Would write" : "Wrote"} ${updated} metafield values`);
  if (errors) console.log(`Errors: ${errors}`);
  else console.log("✅ Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
