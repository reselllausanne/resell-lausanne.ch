// Set product metafield custom.fit_note for Yeezy Slide + Yeezy 700 products.
//
// Usage:
//   node --env-file=apps/.env scripts/yeezy-fit-note-setup.mjs --dry-run
//   node --env-file=apps/.env scripts/yeezy-fit-note-setup.mjs

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

const FIT_NOTE =
  process.env.YEEZY_FIT_NOTE ||
  "Ce modèle taille petit — prenez une pointure au-dessus.";
const SEARCHES = [
  { label: "Yeezy Slide", query: "title:*Yeezy*Slide*" },
  { label: "Yeezy 700", query: "title:*Yeezy*700*" },
];
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 25;

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

const PRODUCTS = `
  query Products($query: String!, $cursor: String) {
    products(first: 100, after: $cursor, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        fitNote: metafield(namespace: "custom", key: "fit_note") { value }
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

async function fetchProductsForQuery(searchQuery) {
  const products = [];
  let cursor = null;

  while (true) {
    const data = await gql(PRODUCTS, { query: searchQuery, cursor });
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
    await sleep(150);
  }

  return products;
}

async function fetchAllTargets() {
  const byId = new Map();

  for (const { label, query } of SEARCHES) {
    const products = await fetchProductsForQuery(query);
    console.log(`${label}: ${products.length} products`);
    for (const product of products) {
      const entry = byId.get(product.id) || {
        id: product.id,
        title: product.title,
        handle: product.handle,
        fitNote: product.fitNote?.value || "",
        groups: [],
      };
      if (!entry.groups.includes(label)) entry.groups.push(label);
      byId.set(product.id, entry);
    }
  }

  return [...byId.values()];
}

async function applyBatch(metafields) {
  if (DRY_RUN) return { userErrors: [] };
  const data = await gql(METAFIELDS_SET, { metafields });
  return data.metafieldsSet;
}

async function main() {
  console.log(DRY_RUN ? "▶ DRY RUN" : "▶ LIVE WRITE");
  console.log(`Fit note: ${FIT_NOTE}`);

  const targets = await fetchAllTargets();
  const toUpdate = targets.filter((p) => p.fitNote !== FIT_NOTE);
  console.log(`Unique products matched: ${targets.length}`);
  console.log(`Products to update: ${toUpdate.length}`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE);
    const metafields = batch.map((product) => ({
      ownerId: product.id,
      namespace: "custom",
      key: "fit_note",
      type: "multi_line_text_field",
      value: FIT_NOTE,
    }));

    const result = await applyBatch(metafields);
    const userErrors = result.userErrors || [];
    if (userErrors.length) {
      errors += userErrors.length;
      console.error("✗", userErrors);
    } else {
      updated += batch.length;
      if (DRY_RUN) {
        batch.slice(0, 3).forEach((p) => {
          console.log(`  would update: ${p.title} [${p.groups.join(", ")}]`);
        });
      }
    }

    await sleep(200);
  }

  console.log(`\n${DRY_RUN ? "Would update" : "Updated"} ${updated} products`);
  if (errors) console.log(`Errors: ${errors}`);
  else console.log("✅ Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
