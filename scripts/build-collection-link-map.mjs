#!/usr/bin/env node
/*
 * build-collection-link-map.mjs — fetch live collections + chip registry → JSON link map.
 * Output: seo-system/collection-link-map.json
 */
import fs from 'node:fs';
import path from 'node:path';

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION || '2026-04';
const OUT = path.resolve('seo-system/collection-link-map.json');

const COLLAB_PHRASES = [
  { phrases: ['travis scott', 'cactus jack', 'jumpman jack'], handle: 'air-jordan-x-travis-scott', label: 'Travis Scott × Nike' },
  { phrases: ['off-white', 'off white', 'virgil abloh'], handle: 'off-white', label: 'Off-White' },
  { phrases: ['supreme'], handle: 'supreme', label: 'Supreme' },
  { phrases: ['chrome hearts'], handle: 'chrome-hearts', label: 'Chrome Hearts' },
  { phrases: ['denim tears'], handle: 'denim-tears', label: 'Denim Tears' },
  { phrases: ['fear of god', 'essentials'], handle: 'essentials', label: 'Fear of God Essentials' },
  { phrases: ['golden goose'], handle: 'golden-goose', label: 'Golden Goose' },
  { phrases: ['bape', 'a bathing ape'], handle: 'bape', label: 'BAPE' },
  { phrases: ['wales bonner'], handle: 'adidas-samba', label: 'Adidas Samba' },
  { phrases: ['nocta'], handle: 'nike-x-nocta', label: 'Nike × NOCTA' },
  { phrases: ['sacai'], handle: 'nike-x-sacai', label: 'Nike × Sacai' },
  { phrases: ['kith'], handle: 'new-balance', label: 'New Balance' },
  { phrases: ['jjjjound'], handle: 'new-balance', label: 'New Balance' },
  { phrases: ['labubu', 'pop mart'], handle: 'labubu', label: 'Labubu × Pop Mart' },
];

const VENDOR_TO_HANDLE = {
  nike: 'nike',
  adidas: 'adidas',
  asics: 'asics',
  'new balance': 'new-balance',
  jordan: 'air-jordan',
  'air jordan': 'air-jordan',
  puma: 'puma',
  salomon: 'salomon',
  'on running': 'on-running',
  on: 'on-running',
  yeezy: 'yeezy',
  converse: 'converse',
  reebok: 'reebok',
  vans: 'vans',
  'golden goose': 'golden-goose',
  'fear of god': 'essentials',
  supreme: 'supreme',
  'off-white': 'off-white',
  'off white': 'off-white',
  bape: 'bape',
  'a bathing ape': 'bape',
  'chrome hearts': 'chrome-hearts',
  'denim tears': 'denim-tears',
  'onitsuka tiger': 'onitsuka-tiger',
  saucony: 'saucony',
  ugg: 'ugg',
  birkenstock: 'birkenstock',
  'dr. martens': 'dr-martens',
  'dr martens': 'dr-martens',
  timberland: 'timberland',
  clarks: 'clarks',
  'maison margiela': 'margiela',
  margiela: 'margiela',
  resell_lausanne: null,
};

async function gql(query, variables) {
  const res = await fetch(`https://${SHOP}/admin/api/${V}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

function parseChipRegistry(liquid) {
  const models = [];
  const re = /([^:|]+)::([a-z0-9-]+)/g;
  let m;
  while ((m = re.exec(liquid)) !== null) {
    const label = m[1].trim();
    const handle = m[2].trim();
    if (label && handle && !label.toLowerCase().startsWith('autres ')) {
      models.push({ label, handle, labelLower: label.toLowerCase() });
    }
  }
  models.sort((a, b) => b.label.length - a.label.length);
  return models;
}

async function main() {
  if (!SHOP || !TOKEN) {
    console.error('Missing SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN');
    process.exit(1);
  }

  const collections = {};
  let cursor = null;
  for (let i = 0; i < 50; i++) {
    const d = await gql(
      `query($c:String){collections(first:100,after:$c){pageInfo{hasNextPage endCursor} nodes{handle title productsCount{count}}}}`,
      { c: cursor },
    );
    for (const c of d.collections.nodes) {
      if (c.productsCount.count > 0) {
        collections[c.handle] = { title: c.title, count: c.productsCount.count, url: `/collections/${c.handle}` };
      }
    }
    if (!d.collections.pageInfo.hasNextPage) break;
    cursor = d.collections.pageInfo.endCursor;
  }

  const registryPath = path.resolve('fullstack_2_3_1/snippets/plp-subcollection-chip-registry.liquid');
  const registryLiquid = fs.readFileSync(registryPath, 'utf8');
  const models = parseChipRegistry(registryLiquid)
    .filter((m) => collections[m.handle])
    .map((m) => ({ ...m, url: collections[m.handle].url }));

  const vendors = {};
  for (const [k, h] of Object.entries(VENDOR_TO_HANDLE)) {
    if (h && collections[h]) vendors[k] = { handle: h, url: collections[h].url, title: collections[h].title };
  }

  const collabs = [];
  for (const c of COLLAB_PHRASES) {
    if (collections[c.handle]) {
      collabs.push({
        phrases: c.phrases,
        handle: c.handle,
        label: c.label,
        url: collections[c.handle].url,
      });
    }
  }
  // Also wire travis-scott alias if live
  if (collections['travis-scott'] && !collabs.some((x) => x.handle === 'travis-scott')) {
    collabs.push({
      phrases: ['travis scott'],
      handle: 'travis-scott',
      label: 'Travis Scott',
      url: collections['travis-scott'].url,
    });
  }

  const out = { generatedAt: new Date().toISOString(), vendors, models, collabs, collections };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT}: ${Object.keys(collections).length} collections, ${models.length} models, ${collabs.length} collabs, ${Object.keys(vendors).length} vendors`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
