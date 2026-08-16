// Bulk-set express_price (= variant sell price) + 48h delivery metafields
// for every variant in a collection (default: Soldes 679186432386).
//
// Usage:
//   node --env-file=apps/.env scripts/soldes-48h-express-setup.mjs --dry-run
//   node --env-file=apps/.env scripts/soldes-48h-express-setup.mjs

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

const COLLECTION_GID =
  process.env.SOLDES_COLLECTION_GID || "gid://shopify/Collection/679186432386";
const DELIVERY_ESTIMATION = "48H";
const DELIVERY_BETWEEN = "48h";
const CURRENCY = "CHF";
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 20;

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

const COLLECTION_PRODUCTS = `
  query CollectionProducts($id: ID!, $cursor: String) {
    collection(id: $id) {
      title
      handle
      productsCount { count }
      products(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          title
          variants(first: 100) {
            nodes {
              id
              title
              price
            }
          }
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

function expressPriceValue(price) {
  return JSON.stringify({ amount: Number(price).toFixed(2), currency_code: CURRENCY });
}

function metafieldsForVariant(variant) {
  const price = variant.price;
  return [
    {
      ownerId: variant.id,
      namespace: "custom",
      key: "express_price",
      type: "money",
      value: expressPriceValue(price),
    },
    {
      ownerId: variant.id,
      namespace: "custom",
      key: "delivery_estimation_text",
      type: "single_line_text_field",
      value: DELIVERY_ESTIMATION,
    },
    {
      ownerId: variant.id,
      namespace: "custom",
      key: "delivery_between_text",
      type: "single_line_text_field",
      value: DELIVERY_BETWEEN,
    },
    {
      ownerId: variant.id,
      namespace: "custom",
      key: "express_available",
      type: "boolean",
      value: "true",
    },
  ];
}

async function fetchAllVariants() {
  const variants = [];
  let cursor = null;

  while (true) {
    const data = await gql(COLLECTION_PRODUCTS, { id: COLLECTION_GID, cursor });
    const collection = data.collection;
    if (!collection) throw new Error(`Collection not found: ${COLLECTION_GID}`);

    if (variants.length === 0) {
      console.log(`Collection: ${collection.title} (${collection.handle})`);
      console.log(`Products: ${collection.productsCount?.count ?? "?"}`);
    }

    for (const product of collection.products.nodes) {
      for (const variant of product.variants.nodes) {
        variants.push({
          productTitle: product.title,
          id: variant.id,
          title: variant.title,
          price: variant.price,
        });
      }
    }

    if (!collection.products.pageInfo.hasNextPage) break;
    cursor = collection.products.pageInfo.endCursor;
    await sleep(150);
  }

  return variants;
}

async function applyBatch(metafields) {
  if (DRY_RUN) return { userErrors: [] };
  const data = await gql(METAFIELDS_SET, { metafields });
  return data.metafieldsSet;
}

async function main() {
  console.log(DRY_RUN ? "▶ DRY RUN" : "▶ LIVE WRITE");
  console.log(`Collection GID: ${COLLECTION_GID}`);

  const variants = await fetchAllVariants();
  console.log(`Variants to update: ${variants.length}`);

  let updated = 0;
  let errors = 0;
  const queue = [];

  for (const variant of variants) {
    queue.push(...metafieldsForVariant(variant));
  }

  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    const result = await applyBatch(batch);
    const userErrors = result.userErrors || [];

    if (userErrors.length) {
      errors += userErrors.length;
      console.error("✗", userErrors);
    } else {
      updated += batch.length;
    }

    if ((i / BATCH_SIZE) % 5 === 0) {
      console.log(`  … ${Math.min(i + BATCH_SIZE, queue.length)} / ${queue.length} metafields`);
    }

    await sleep(200);
  }

  console.log(`\n${DRY_RUN ? "Would write" : "Wrote"} ${updated} metafield values (${variants.length} variants × 4 fields)`);
  if (errors) console.log(`Errors: ${errors}`);
  else console.log("✅ Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
