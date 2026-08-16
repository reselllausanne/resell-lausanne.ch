// add-to-essentials.mjs
// node --env-file=apps/.env add-to-essentials.mjs

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

if (!SHOP || !TOKEN) {
  console.error("✗ Missing env: SHOP/SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN/SHOPIFY_ADMIN_ACCESS_TOKEN required.");
  process.exit(1);
}

const gql = async (query, variables = {}) => {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
};

// ─── COLLECTIONS CIBLES ───────────────────────────────────────────────────────
const ESSENTIELS_HANDLE = "les-essentiels-sneakers";
const COLLABS_HANDLE = "les-meilleures-collaborations";

// ─── PRODUITS ESSENTIELS (top ventes + picks manuels) ────────────────────────
const ESSENTIELS = [
  { title: "ASICS Gel-NYC 2055 Glacier Dolphin Grey", gid: "gid://shopify/Product/14896536748418" },
  { title: "ASICS Gel-NYC Cement Grey Ash Rock", gid: "gid://shopify/Product/14896536813954" },
  { title: "ASICS Gel-NYC Concrete Oatmeal", gid: "gid://shopify/Product/14896536879490" },
  { title: "ASICS Gel-NYC Cream", gid: "gid://shopify/Product/14896536945026" },
  { title: "ASICS Gel-NYC Cream Cloud Grey", gid: "gid://shopify/Product/14896536977794" },
  { title: "ASICS Gel-1130 Baby Lavender Pure Silver", gid: "gid://shopify/Product/14896535437698" },
  { title: "ASICS Gel-1130 Black Carbon", gid: "gid://shopify/Product/14896535503234" },
  { title: "Nike Air Max Plus Triple Black", gid: "gid://shopify/Product/14824416936322" },
  { title: "Nike Air Max Plus White", gid: "gid://shopify/Product/14824425390466" },
  { title: "Nike Air Max 95 Essential Triple Black", gid: "gid://shopify/Product/14824428241282" },
  { title: "Nike P-6000 Metallic Silver", gid: "gid://shopify/Product/14896788210050" },
  { title: "Nike P-6000 Triple White", gid: "gid://shopify/Product/14896788242818" },
  { title: "Nike Blazer Mid 77 Vintage White Black", gid: "gid://shopify/Product/14908118630786" },
  { title: "adidas Samba OG Black White Gum", gid: "gid://shopify/Product/14896528294274" },
  { title: "adidas Handball Spezial Black Gum", gid: "gid://shopify/Product/14896530555266" },
  { title: "UGG Lowmel Sand (Women's)", gid: "gid://shopify/Product/14896555426178" },
  { title: "UGG Lowmel Chestnut (Women's)", gid: "gid://shopify/Product/14896555327874" },
  { title: "UGG Lowmel Black (Women's)", gid: "gid://shopify/Product/14896555295106" },
  { title: "New Balance 204L Mushroom Arid Stone", gid: "gid://shopify/Product/15097507250562" },
  { title: "Saucony ProGrid Omni 9 Pink Purple", gid: "gid://shopify/Product/15118796325250" },
  { title: "Saucony ProGrid Omni 9 Silver Pink", gid: "gid://shopify/Product/15118796390786" },
  { title: "Onitsuka Tiger Mexico 66 Kill Bill", gid: "gid://shopify/Product/14896533700994" },
  { title: "Onitsuka Tiger Mexico 66 Vintage Birch Black", gid: "gid://shopify/Product/14896533832066" },
  { title: "Jordan 1 Retro Low OG SP Travis Scott Medium Olive", gid: "gid://shopify/Product/14903313990018" },
  { title: "Jordan 1 Retro Low OG SP Travis Scott Canary", gid: "gid://shopify/Product/14903314022786" },
  { title: "Jordan 1 Retro Low OG SP Travis Scott Sail Tropical Pink", gid: "gid://shopify/Product/15340288835970" },
  { title: "Jordan 1 Retro Low OG SP Travis Scott Shy Pink", gid: "gid://shopify/Product/15340288803202" },
  { title: "Jordan 4 Retro Black Cat (2025)", gid: "gid://shopify/Product/15169094254978" },
];

// ─── PRODUITS COLLABS ─────────────────────────────────────────────────────────
const COLLABS = [
  { title: "Nike Air Max 1 Travis Scott Cactus Jack Saturn Gold", gid: "gid://shopify/Product/14902246900098" },
  { title: "Nike Air Max 1 Travis Scott Cactus Jack Baroque Brown", gid: "gid://shopify/Product/14902247784834" },
  { title: "Jordan 1 Retro Low OG SP Travis Scott Medium Olive", gid: "gid://shopify/Product/14903313990018" },
  { title: "Jordan 1 Retro Low OG SP Travis Scott Canary", gid: "gid://shopify/Product/14903314022786" },
  { title: "Jordan 1 Retro Low OG SP Travis Scott Olive", gid: "gid://shopify/Product/14903314055554" },
  { title: "Jordan 1 Retro Low OG SP Travis Scott Sail Tropical Pink", gid: "gid://shopify/Product/15340288835970" },
  { title: "Jordan 1 Retro Low OG SP Travis Scott Shy Pink", gid: "gid://shopify/Product/15340288803202" },
];

const GET_COLLECTION = `
  query GetCollection($handle: String!) {
    collectionByHandle(handle: $handle) { id title productsCount { count } }
  }
`;

const ADD_PRODUCTS = `
  mutation AddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProducts(id: $id, productIds: $productIds) {
      collection { id title productsCount { count } }
      userErrors { field message }
    }
  }
`;

async function addToCollection(handle, products) {
  console.log(`\n▶ ${handle}`);
  const { collectionByHandle } = await gql(GET_COLLECTION, { handle });
  if (!collectionByHandle) {
    console.error(`  ✗ Collection introuvable: ${handle}`);
    return;
  }

  const before = collectionByHandle.productsCount?.count ?? "?";
  console.log(`  ${collectionByHandle.title} (${before} produits avant)`);

  const productIds = [...new Set(products.map((p) => p.gid))];
  const result = await gql(ADD_PRODUCTS, { id: collectionByHandle.id, productIds });

  const { userErrors, collection } = result.collectionAddProducts;
  if (userErrors.length) {
    console.error("  ✗", userErrors);
  } else {
    const after = collection.productsCount?.count ?? "?";
    console.log(`  ✓ ${productIds.length} produits envoyés → ${after} total`);
  }
}

await addToCollection(ESSENTIELS_HANDLE, ESSENTIELS);
await addToCollection(COLLABS_HANDLE, COLLABS);

console.log("\n✅ Done.");
