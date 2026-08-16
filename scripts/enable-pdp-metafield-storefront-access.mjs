// Enable Online Store read access for PDP metafields used by the theme.
//
// Usage:
//   node --env-file=apps/.env scripts/enable-pdp-metafield-storefront-access.mjs --dry-run
//   node --env-file=apps/.env scripts/enable-pdp-metafield-storefront-access.mjs

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
const DRY_RUN = process.argv.includes("--dry-run");

const KEYS = [
  "shipping_express_label",
  "shipping_standard_label",
  "shipping_method_label",
  "delivery_promise_prefix",
  "size_guide_note",
  "fit_note",
  "size_fit_note",
  "size_selector_label",
  "show_48h_picto",
  "delivery_48h_picto",
];

if (!SHOP || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN");
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const LIST = `
  query ListDefs($cursor: String) {
    metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: "custom", after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id key name access { storefront } }
    }
  }
`;

const UPDATE = `
  mutation UpdateDef($definition: MetafieldDefinitionUpdateInput!) {
    metafieldDefinitionUpdate(definition: $definition) {
      updatedDefinition { id key access { storefront } }
      userErrors { field message }
    }
  }
`;

async function main() {
  const defs = [];
  let cursor = null;
  while (true) {
    const data = await gql(LIST, { cursor });
    defs.push(...data.metafieldDefinitions.nodes);
    if (!data.metafieldDefinitions.pageInfo.hasNextPage) break;
    cursor = data.metafieldDefinitions.pageInfo.endCursor;
  }

  const targets = defs.filter((d) => KEYS.includes(d.key));
  console.log(`Found ${targets.length}/${KEYS.length} PDP metafield definitions`);

  for (const def of targets) {
    const access = def.access?.storefront || "NONE";
    if (access === "PUBLIC_READ") {
      console.log(`✓ ${def.key} already PUBLIC_READ`);
      continue;
    }
    console.log(`${DRY_RUN ? "[dry-run] " : ""}→ ${def.key}: ${access} → PUBLIC_READ`);
    if (DRY_RUN) continue;

    const result = await gql(UPDATE, {
      definition: {
        namespace: "custom",
        key: def.key,
        ownerType: "PRODUCT",
        access: { storefront: "PUBLIC_READ" },
      },
    });
    const errors = result.metafieldDefinitionUpdate.userErrors;
    if (errors?.length) {
      console.error(`✗ ${def.key}:`, errors.map((e) => e.message).join("; "));
    } else {
      console.log(`✓ ${def.key} updated`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
