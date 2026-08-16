// faq-seed.mjs
// Idempotent FAQ seed for brand collections.
//
// Usage:
//   node --env-file=.env faq-seed.mjs              # all brands, write
//   node --env-file=.env faq-seed.mjs --dry-run    # validate only, no writes
//   node --env-file=.env faq-seed.mjs --brand=adidas
//
// Requires Node 18+ (native fetch). Required scopes on the Admin token:
//   read_metaobjects, write_metaobjects, read_products, write_products

const SHOP = process.env.SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

if (!SHOP || !TOKEN) {
  console.error("✗ Missing env: SHOP and SHOPIFY_ADMIN_TOKEN are required.");
  process.exit(1);
}

const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const BRAND_FILTER = (args.find((a) => a.startsWith("--brand=")) || "").split("=")[1] || null;

const METAOBJECT_TYPE = "faq_item";
const COLLECTION_METAFIELD = {
  namespace: "custom",
  key: "collection_faq_items",
  type: "list.metaobject_reference",
};

// ─── GraphQL client ───────────────────────────────────────────────────────────
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
      if (attempt > 4) {
        throw new Error(`HTTP ${res.status} after ${attempt} attempts`);
      }
      const wait = 500 * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const json = await res.json();
    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  }
}

// ─── Rich text helper ─────────────────────────────────────────────────────────
const richText = (text) =>
  JSON.stringify({
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: text }] },
    ],
  });

// ─── FAQ template ─────────────────────────────────────────────────────────────
const faqTemplate = (brand) => [
  {
    question: `Les ${brand} sur Resell Lausanne sont-elles authentiques ?`,
    answer: `Oui, chaque paire est contrôlée par nos experts et livrée avec certificat d'authenticité.`,
  },
  {
    question: `Quel est le délai de livraison pour une commande ${brand} ?`,
    answer: `Entre 2 et 8 jours ouvrés pour la Suisse et l'Europe.`,
  },
  {
    question: `Puis-je retourner une paire ${brand} ?`,
    answer: `Oui, vous disposez de 14 jours — voir /pages/faq?category=echanges-et-retours`,
  },
];

// ─── Brand list ───────────────────────────────────────────────────────────────
const BRANDS = [
  { collectionHandle: "adidas",         label: "Adidas" },
  { collectionHandle: "air-jordan",     label: "Air Jordan" },
  { collectionHandle: "new-balance",    label: "New Balance" },
  { collectionHandle: "asics",          label: "Asics" },
  { collectionHandle: "yeezy",          label: "Yeezy" },
  { collectionHandle: "ugg",            label: "UGG" },
  { collectionHandle: "onitsuka-tiger", label: "Onitsuka Tiger" },
  { collectionHandle: "golden-goose",   label: "Golden Goose" },
  { collectionHandle: "puma",           label: "Puma" },
  { collectionHandle: "saucony",        label: "Saucony" },
  { collectionHandle: "birkenstock",    label: "Birkenstock" },
  { collectionHandle: "on",             label: "ON Running" },
].map((b) => ({ ...b, faqs: faqTemplate(b.label) }));

const TARGETS = BRAND_FILTER
  ? BRANDS.filter((b) => b.collectionHandle === BRAND_FILTER)
  : BRANDS;

if (BRAND_FILTER && TARGETS.length === 0) {
  console.error(`✗ Unknown --brand=${BRAND_FILTER}. Known: ${BRANDS.map((b) => b.collectionHandle).join(", ")}`);
  process.exit(1);
}

// ─── Queries / mutations ──────────────────────────────────────────────────────
const Q_METAOBJECT_DEF = `
  query MetaobjectDef($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      type
      fieldDefinitions { key type { name } }
    }
  }
`;

const Q_COLLECTION = `
  query GetCollection($handle: String!) {
    collectionByHandle(handle: $handle) { id title }
  }
`;

const M_METAOBJECT_UPSERT = `
  mutation UpsertFaq($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject { id handle }
      userErrors { field message code }
    }
  }
`;

const M_METAFIELDS_SET = `
  mutation SetCollectionFaq($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key namespace }
      userErrors { field message code }
    }
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const faqHandle = (brandHandle, i) => `${slugify(brandHandle)}-faq-${i + 1}`;

function logUserErrors(prefix, errs) {
  if (!errs || errs.length === 0) return false;
  for (const e of errs) {
    console.error(`  ✗ ${prefix}: ${e.message} (field=${(e.field || []).join(".")}, code=${e.code || "n/a"})`);
  }
  return true;
}

// ─── Preflight ────────────────────────────────────────────────────────────────
async function preflight() {
  console.log(`▶ Preflight on ${SHOP} (api ${API_VERSION})${DRY_RUN ? " [DRY-RUN]" : ""}`);

  const def = await gql(Q_METAOBJECT_DEF, { type: METAOBJECT_TYPE });
  const metaDef = def.metaobjectDefinitionByType;
  if (!metaDef) {
    throw new Error(`Metaobject definition '${METAOBJECT_TYPE}' not found. Create it in Admin → Settings → Custom data → Metaobjects.`);
  }
  const fieldKeys = new Set(metaDef.fieldDefinitions.map((f) => f.key));
  const missing = ["question", "answer"].filter((k) => !fieldKeys.has(k));
  if (missing.length) {
    throw new Error(`Metaobject '${METAOBJECT_TYPE}' missing fields: ${missing.join(", ")}`);
  }
  console.log(`  ✓ Metaobject definition '${METAOBJECT_TYPE}' OK (${metaDef.fieldDefinitions.length} fields)`);

  const resolved = [];
  for (const brand of TARGETS) {
    const data = await gql(Q_COLLECTION, { handle: brand.collectionHandle });
    const col = data.collectionByHandle;
    if (!col) {
      console.error(`  ✗ Collection introuvable: ${brand.collectionHandle}`);
      continue;
    }
    console.log(`  ✓ Collection ${brand.collectionHandle} → ${col.id}`);
    resolved.push({ ...brand, collectionId: col.id, collectionTitle: col.title });
  }

  if (resolved.length === 0) throw new Error("No resolvable collections. Aborting.");
  return resolved;
}

// ─── Upsert FAQ items ─────────────────────────────────────────────────────────
async function upsertFaqs(brand) {
  const ids = [];
  for (let i = 0; i < brand.faqs.length; i += 1) {
    const faq = brand.faqs[i];
    const handle = faqHandle(brand.collectionHandle, i);

    if (DRY_RUN) {
      console.log(`    · [dry-run] would upsert ${METAOBJECT_TYPE}/${handle}`);
      ids.push(`gid://shopify/Metaobject/DRY-${handle}`);
      continue;
    }

    const data = await gql(M_METAOBJECT_UPSERT, {
      handle: { type: METAOBJECT_TYPE, handle },
      metaobject: {
        fields: [
          { key: "question", value: faq.question },
          { key: "answer", value: richText(faq.answer) },
        ],
      },
    });

    const res = data.metaobjectUpsert;
    if (logUserErrors(`metaobjectUpsert ${handle}`, res.userErrors)) continue;
    const id = res.metaobject?.id;
    if (!id) {
      console.error(`  ✗ Upsert returned no ID for ${handle}`);
      continue;
    }
    console.log(`    ✓ ${handle} → ${id}`);
    ids.push(id);
  }
  return ids;
}

// ─── Attach to collection metafield ───────────────────────────────────────────
async function attachToCollection(brand, ids) {
  if (ids.length === 0) {
    console.error(`  ✗ No metaobject IDs for ${brand.collectionHandle}; skipping attach.`);
    return false;
  }
  if (DRY_RUN) {
    console.log(`  · [dry-run] would set ${brand.collectionHandle}.${COLLECTION_METAFIELD.namespace}.${COLLECTION_METAFIELD.key} with ${ids.length} refs`);
    return true;
  }
  const data = await gql(M_METAFIELDS_SET, {
    metafields: [
      {
        ownerId: brand.collectionId,
        namespace: COLLECTION_METAFIELD.namespace,
        key: COLLECTION_METAFIELD.key,
        type: COLLECTION_METAFIELD.type,
        value: JSON.stringify(ids),
      },
    ],
  });
  if (logUserErrors(`metafieldsSet ${brand.collectionHandle}`, data.metafieldsSet.userErrors)) return false;
  console.log(`  ✓ ${ids.length} FAQ attachées à ${brand.collectionHandle}`);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const resolved = await preflight();
  const summary = { ok: 0, fail: 0, skipped: 0 };

  for (const brand of resolved) {
    console.log(`\n▶ ${brand.label} (${brand.collectionHandle})`);
    try {
      const ids = await upsertFaqs(brand);
      const ok = await attachToCollection(brand, ids);
      if (ok) summary.ok += 1;
      else summary.fail += 1;
    } catch (err) {
      summary.fail += 1;
      console.error(`  ✗ ${brand.collectionHandle}: ${err.message}`);
    }
  }
  summary.skipped = TARGETS.length - resolved.length;

  console.log(`\n✅ Done. ok=${summary.ok} fail=${summary.fail} skipped=${summary.skipped}${DRY_RUN ? " [DRY-RUN]" : ""}`);
  if (summary.fail > 0) process.exit(2);
}

main().catch((err) => {
  console.error(`✗ Fatal: ${err.message}`);
  process.exit(1);
});
