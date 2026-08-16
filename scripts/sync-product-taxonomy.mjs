import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (prefix, fallback = null) => {
  const value = args.find((arg) => arg.startsWith(`${prefix}=`));
  return value ? value.slice(prefix.length + 1) : fallback;
};

const APPLY = hasFlag("--apply");
const DRY_RUN = !APPLY || hasFlag("--dry-run");
const WRITE_OPTIONAL = hasFlag("--no-optional") ? false : true;
const MIN_CONFIDENCE = Number.parseFloat(getArg("--min-confidence", "0.85")) || 0.85;
const LIMIT = Number.parseInt(getArg("--limit", "0"), 10) || 0;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TAXONOMY_PATH = path.resolve(ROOT_DIR, getArg("--csv", "data/breadcrumb-taxonomy.csv"));
const OUTPUT_DIR = path.resolve(ROOT_DIR, getArg("--output-dir", "audit-results"));
const DRY_RUN_REPORT = path.resolve(OUTPUT_DIR, "taxonomy-dry-run.csv");
const LOW_CONF_REPORT = path.resolve(OUTPUT_DIR, "taxonomy-low-confidence.csv");
const UNMATCHED_REPORT = path.resolve(OUTPUT_DIR, "taxonomy-unmatched.csv");
const TAXONOMY_SOURCE = getArg("--taxonomy-source", "csv_taxonomy_v1");

if (!SHOP || !TOKEN) {
  console.error("Missing env. Required: SHOP (or SHOPIFY_STORE_DOMAIN) and SHOPIFY_ADMIN_TOKEN.");
  process.exit(1);
}

const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

const Q_PRODUCTS = `
  query ProductsPage($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        cursor
        node {
          id
          title
          handle
          vendor
          productType
          tags
          model: metafield(namespace: "custom", key: "model") { value }
          silhouette: metafield(namespace: "custom", key: "silhouette") { value }
          categoryModel: metafield(namespace: "custom", key: "category_model") { value }
          primaryCollectionHandle: metafield(namespace: "custom", key: "primary_collection_handle") { value }
        }
      }
    }
  }
`;

const Q_PRODUCT_METAFIELD_DEFINITIONS = `
  query ProductMetafieldDefinitions {
    metafieldDefinitions(first: 100, ownerType: PRODUCT, namespace: "custom") {
      nodes {
        key
        type {
          name
        }
      }
    }
  }
`;

const M_METAFIELDS_SET = `
  mutation SetProductMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key }
      userErrors { field message code }
    }
  }
`;

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
      if (attempt > 5) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} after retries: ${body}`);
      }
      const wait = 400 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }

    const json = await res.json();
    if (json.errors) {
      const throttled = json.errors.some((err) => err?.extensions?.code === "THROTTLED");
      if (throttled && attempt <= 5) {
        const wait = 500 * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  }
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (ch === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(field);
      field = "";
      const onlyEmpty = row.every((cell) => cell.trim() === "");
      if (!onlyEmpty) rows.push(row);
      row = [];
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    const onlyEmpty = row.every((cell) => cell.trim() === "");
    if (!onlyEmpty) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values) => {
    const record = {};
    for (let idx = 0; idx < headers.length; idx += 1) {
      record[headers[idx]] = (values[idx] || "").trim();
    }
    return record;
  });
}

function normalize(input) {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseContains(haystackNorm, phraseNorm) {
  if (!haystackNorm || !phraseNorm) return false;
  return (` ${haystackNorm} `).includes(` ${phraseNorm} `);
}

function csvEscape(value) {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replace(/"/g, "\"\"")}"`;
  }
  return str;
}

async function writeCsv(filePath, headers, rows) {
  const content = [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(",")),
  ].join("\n");
  await fs.writeFile(filePath, content, "utf8");
}

function splitPath(pathValue) {
  return (pathValue || "")
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
}

function classifyRow(row) {
  const labels = splitPath(row.breadcrumb_labels);
  const depth = labels.length;
  if (depth <= 2) return "brand";
  if (depth === 3) return "family";
  return "model";
}

function buildTaxonomy(records) {
  const rows = [];
  const uniqueByCollectionHandle = new Map();
  const brandsByVertical = {
    sneakers: new Set(),
    streetwear: new Set(),
    "objets-de-collection": new Set(),
  };

  for (const record of records) {
    if (!record.collection_handle) continue;
    const vertical = record.vertical;
    const brand = record.brand;
    const aliases = (record.aliases || "")
      .split(",")
      .map((alias) => alias.trim())
      .filter(Boolean);
    const labels = splitPath(record.breadcrumb_labels);
    const handles = splitPath(record.breadcrumb_handles);
    const modelTitle = record.model_title || "";
    const rowType = classifyRow(record);
    const modelToken = normalize(modelTitle);
    const aliasTokens = aliases.map(normalize).filter(Boolean);
    const matchPhrases = new Set(aliasTokens);
    if (modelToken) matchPhrases.add(modelToken);
    if (rowType === "brand") {
      matchPhrases.add(normalize(brand));
    }

    const row = {
      vertical,
      brand,
      modelTitle,
      collectionHandle: record.collection_handle,
      breadcrumbLabels: labels,
      breadcrumbHandles: handles,
      aliases,
      rowType,
      matchPhrases: [...matchPhrases].sort((a, b) => b.length - a.length),
      scoreWeight: rowType === "model" ? 3 : rowType === "family" ? 2 : 1,
      matchedRow: `${vertical}/${brand}/${modelTitle} -> ${record.collection_handle}`,
    };

    rows.push(row);
    if (!uniqueByCollectionHandle.has(row.collectionHandle)) {
      uniqueByCollectionHandle.set(row.collectionHandle, row);
    }
    if (brandsByVertical[vertical]) {
      brandsByVertical[vertical].add(brand);
    }
  }

  return {
    rows,
    uniqueRows: [...uniqueByCollectionHandle.values()],
    brandsByVertical: {
      sneakers: [...brandsByVertical.sneakers],
      streetwear: [...brandsByVertical.streetwear],
      "objets-de-collection": [...brandsByVertical["objets-de-collection"]],
    },
  };
}

function inferBrandKey(product) {
  const vendorNorm = normalize(product.vendor);
  const titleNorm = normalize(product.title);
  if (titleNorm.includes("yeezy")) return "yeezy";
  if (vendorNorm.includes("air jordan") || vendorNorm === "jordan") return "jordan";
  if (vendorNorm === "fear of god" || vendorNorm === "essentials") return "fear-of-god-essentials";
  if (vendorNorm.includes("new balance")) return "new-balance";
  if (vendorNorm.includes("off white")) return "off-white";
  if (vendorNorm.includes("denim tears")) return "denim-tears";
  if (vendorNorm.includes("travis scott")) return "travis-scott";
  if (vendorNorm.includes("pop mart")) return "pop-mart";
  if (vendorNorm.includes("pokemon")) return "pokemon";
  if (vendorNorm.includes("birkenstock")) return "birkenstock";
  if (vendorNorm.includes("clarks")) return "clarks";
  if (vendorNorm.includes("asics")) return "asics";
  if (vendorNorm.includes("adidas")) return "adidas";
  if (vendorNorm.includes("nike")) return "nike";
  if (vendorNorm.includes("ugg")) return "ugg";
  if (vendorNorm.includes("sp5der")) return "sp5der";
  if (vendorNorm.includes("lego")) return "lego";
  return vendorNorm.replace(/\s+/g, "-");
}

function inferVertical(product, brandKey) {
  if (["fear-of-god-essentials", "sp5der", "off-white", "denim-tears", "travis-scott"].includes(brandKey)) {
    return "streetwear";
  }
  if (["lego", "pop-mart", "labubu", "pokemon"].includes(brandKey)) {
    return "objets-de-collection";
  }

  const allText = normalize(
    [
      product.productType || "",
      ...(product.tags || []),
      product.title || "",
    ].join(" ")
  );

  if (allText.includes("streetwear") || allText.includes("vetement") || allText.includes("hoodie")) {
    return "streetwear";
  }
  if (
    allText.includes("collect") ||
    allText.includes("lego") ||
    allText.includes("pokemon") ||
    allText.includes("pop mart") ||
    allText.includes("labubu")
  ) {
    return "objets-de-collection";
  }
  return "sneakers";
}

function buildSearchText(product) {
  const combined = [
    product.title || "",
    product.vendor || "",
    product.productType || "",
    ...(product.tags || []),
    product.model || "",
    product.silhouette || "",
    product.categoryModel || "",
  ].join(" ");
  const normalized = normalize(combined);
  const delettered = normalized.replace(/\b(\d{3,4})[a-z]\b/g, "$1");
  return `${normalized} ${delettered}`.trim();
}

function scoreCandidate(row, searchText, productTitleNorm) {
  const hits = row.matchPhrases.filter((phrase) => phraseContains(searchText, phrase));
  const hasModelToken = row.modelTitle && phraseContains(productTitleNorm, normalize(row.modelTitle));
  const jordanTitle = ` ${productTitleNorm} `;
  const isJordan = row.brand === "jordan";
  const isJordanOneHigh = row.collectionHandle === "air-jordan-1-high";
  const isJordanOneMid = row.collectionHandle === "air-jordan-1-mid";
  const isJordanOneLow = row.collectionHandle === "air-jordan-1-low";
  const jordanHighHit =
    isJordan && isJordanOneHigh &&
    (jordanTitle.includes(" jordan 1 high ") || jordanTitle.includes(" jordan 1 retro high ") || jordanTitle.includes(" air jordan 1 retro high "));
  const jordanMidHit =
    isJordan && isJordanOneMid &&
    (jordanTitle.includes(" jordan 1 mid ") || jordanTitle.includes(" jordan 1 retro mid ") || jordanTitle.includes(" air jordan 1 retro mid "));
  const jordanLowHit =
    isJordan && isJordanOneLow &&
    (jordanTitle.includes(" jordan 1 low ") || jordanTitle.includes(" jordan 1 retro low ") || jordanTitle.includes(" air jordan 1 retro low "));
  const jordanExplicitModelHit = jordanHighHit || jordanMidHit || jordanLowHit;

  if (row.rowType !== "brand" && hits.length === 0 && !hasModelToken) {
    if (!jordanExplicitModelHit) {
      return { score: 0, hits, reason: "No model or alias hit" };
    }
  }

  let score = 0.5;
  if (row.rowType === "model") score = 0.84;
  if (row.rowType === "family") score = 0.84;
  if (row.rowType === "brand") score = 0.66;
  if (row.rowType === "brand" && row.vertical === "streetwear" && hits.length >= 1) score = 0.86;

  score += Math.min(0.12, hits.length * 0.04);
  if (hasModelToken) score += 0.04;
  if (jordanExplicitModelHit) score += 0.08;
  score = Math.min(0.99, score);

  const reason = `${row.rowType} row; hits=${hits.length}; aliases=${hits.join("|") || "none"}${jordanExplicitModelHit ? "; jordan-explicit=1" : ""}`;
  return { score, hits, reason };
}

function matchProduct(product, taxonomy) {
  const brandKey = inferBrandKey(product);
  const vertical = inferVertical(product, brandKey);
  const searchText = buildSearchText(product);
  const productTitleNorm = normalize(product.title);

  const candidates = taxonomy.rows
    .filter((row) => row.vertical === vertical && row.brand === brandKey)
    .map((row) => {
      const scored = scoreCandidate(row, searchText, productTitleNorm);
      return { row, ...scored };
    })
    .filter((candidate) => candidate.score > 0);

  if (candidates.length === 0) {
    return {
      matched: null,
      confidence: 0,
      reason: `No row for vertical=${vertical}, brand=${brandKey}`,
      brandKey,
      vertical,
    };
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.row.scoreWeight !== a.row.scoreWeight) return b.row.scoreWeight - a.row.scoreWeight;
    return b.row.modelTitle.length - a.row.modelTitle.length;
  });

  const best = candidates[0];
  return {
    matched: best.row,
    confidence: Number(best.score.toFixed(2)),
    reason: best.reason,
    brandKey,
    vertical,
  };
}

async function fetchAllProducts(limit = 0) {
  const products = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await gql(Q_PRODUCTS, { first: 100, after });
    const edges = data.products.edges || [];
    for (const edge of edges) {
      const node = edge.node;
      products.push({
        id: node.id,
        title: node.title || "",
        handle: node.handle || "",
        vendor: node.vendor || "",
        productType: node.productType || "",
        tags: node.tags || [],
        model: node.model?.value || "",
        silhouette: node.silhouette?.value || "",
        categoryModel: node.categoryModel?.value || "",
        primaryCollectionHandle: node.primaryCollectionHandle?.value || "",
      });
      if (limit > 0 && products.length >= limit) {
        return products;
      }
    }
    hasNextPage = Boolean(data.products.pageInfo?.hasNextPage);
    after = data.products.pageInfo?.endCursor || null;
  }

  return products;
}

async function getProductMetafieldTypeMap() {
  const data = await gql(Q_PRODUCT_METAFIELD_DEFINITIONS, {});
  const map = new Map();
  const nodes = data.metafieldDefinitions?.nodes || [];
  for (const node of nodes) {
    if (node?.key && node?.type?.name) {
      map.set(node.key, node.type.name);
    }
  }
  return map;
}

function typeFor(typeMap, key, fallbackType) {
  return typeMap.get(key) || fallbackType;
}

async function updateProductMetafields(product, decision, typeMap) {
  const row = decision.matched;
  if (!row) return { ok: false, reason: "No matched row" };

  const confidenceValue = decision.confidence.toFixed(2);
  const metafields = [
    {
      ownerId: product.id,
      namespace: "custom",
      key: "primary_collection_handle",
      type: typeFor(typeMap, "primary_collection_handle", "single_line_text_field"),
      value: row.collectionHandle,
    },
  ];

  if (WRITE_OPTIONAL) {
    metafields.push(
      {
        ownerId: product.id,
        namespace: "custom",
        key: "taxonomy_confidence",
        type: typeFor(typeMap, "taxonomy_confidence", "number_decimal"),
        value: confidenceValue,
      },
      {
        ownerId: product.id,
        namespace: "custom",
        key: "taxonomy_source",
        type: typeFor(typeMap, "taxonomy_source", "single_line_text_field"),
        value: TAXONOMY_SOURCE,
      },
      {
        ownerId: product.id,
        namespace: "custom",
        key: "brand_entity",
        type: typeFor(typeMap, "brand_entity", "single_line_text_field"),
        value: row.brand,
      },
      {
        ownerId: product.id,
        namespace: "custom",
        key: "model_line",
        type: typeFor(typeMap, "model_line", "single_line_text_field"),
        value: row.modelTitle,
      }
    );
  }

  const data = await gql(M_METAFIELDS_SET, { metafields });
  const userErrors = data.metafieldsSet?.userErrors || [];
  if (userErrors.length > 0) {
    return {
      ok: false,
      reason: userErrors.map((err) => err.message).join(" | "),
    };
  }
  return { ok: true, reason: "updated" };
}

function toReportRow(product, decision, wouldUpdate) {
  return {
    product_id: product.id,
    product_handle: product.handle,
    product_title: product.title,
    matched_row: decision.matched ? decision.matched.matchedRow : "",
    primary_collection_handle: decision.matched ? decision.matched.collectionHandle : "",
    breadcrumb_labels: decision.matched ? decision.matched.breadcrumbLabels.join(" > ") : "",
    breadcrumb_handles: decision.matched ? decision.matched.breadcrumbHandles.join(" > ") : "",
    confidence: decision.confidence.toFixed(2),
    reason: decision.reason,
    would_update_shopify: wouldUpdate ? "yes" : "no",
    current_primary_collection_handle: product.primaryCollectionHandle || "",
    inferred_vertical: decision.vertical,
    inferred_brand: decision.brandKey,
  };
}

async function main() {
  console.log(`Taxonomy sync start ${DRY_RUN ? "[DRY-RUN]" : "[APPLY]"}`);
  console.log(`CSV: ${TAXONOMY_PATH}`);
  console.log(`Output dir: ${OUTPUT_DIR}`);
  console.log(`Optional metafields: ${WRITE_OPTIONAL ? "on" : "off"}`);

  const csvText = await fs.readFile(TAXONOMY_PATH, "utf8");
  const records = parseCsv(csvText);
  if (records.length === 0) {
    throw new Error("Taxonomy CSV has no rows");
  }
  const taxonomy = buildTaxonomy(records);
  console.log(`Loaded ${taxonomy.rows.length} taxonomy rows (${taxonomy.uniqueRows.length} unique handles)`);

  const products = await fetchAllProducts(LIMIT);
  if (products.length === 0) {
    throw new Error("No products fetched");
  }
  console.log(`Fetched ${products.length} products`);

  const dryRunRows = [];
  const lowConfidenceRows = [];
  const unmatchedRows = [];
  const updatable = [];
  let matchedCount = 0;

  for (const product of products) {
    const decision = matchProduct(product, taxonomy);
    if (decision.matched) matchedCount += 1;
    const shouldUpdate =
      Boolean(decision.matched) &&
      decision.confidence >= MIN_CONFIDENCE &&
      (product.primaryCollectionHandle || "") !== decision.matched.collectionHandle;

    dryRunRows.push(toReportRow(product, decision, shouldUpdate));

    if (!decision.matched) {
      unmatchedRows.push(toReportRow(product, decision, false));
      continue;
    }

    if (decision.confidence < MIN_CONFIDENCE) {
      lowConfidenceRows.push(toReportRow(product, decision, false));
      continue;
    }

    if (shouldUpdate) {
      updatable.push({ product, decision });
    }
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const headers = [
    "product_id",
    "product_handle",
    "product_title",
    "matched_row",
    "primary_collection_handle",
    "breadcrumb_labels",
    "breadcrumb_handles",
    "confidence",
    "reason",
    "would_update_shopify",
    "current_primary_collection_handle",
    "inferred_vertical",
    "inferred_brand",
  ];
  await writeCsv(DRY_RUN_REPORT, headers, dryRunRows);
  await writeCsv(LOW_CONF_REPORT, headers, lowConfidenceRows);
  await writeCsv(UNMATCHED_REPORT, headers, unmatchedRows);

  let updatedCount = 0;
  const applyErrors = [];
  if (APPLY) {
    const typeMap = await getProductMetafieldTypeMap();
    for (const item of updatable) {
      const result = await updateProductMetafields(item.product, item.decision, typeMap);
      if (result.ok) {
        updatedCount += 1;
      } else {
        applyErrors.push({
          product_id: item.product.id,
          product_title: item.product.title,
          reason: result.reason,
        });
      }
    }
  }

  console.log("");
  console.log(`Dry-run report: ${DRY_RUN_REPORT}`);
  console.log(`Low confidence report: ${LOW_CONF_REPORT}`);
  console.log(`Unmatched report: ${UNMATCHED_REPORT}`);
  console.log(`Matched: ${matchedCount}/${products.length}`);
  console.log(`Confidence>=${MIN_CONFIDENCE.toFixed(2)} and needs update: ${updatable.length}`);
  if (APPLY) {
    console.log(`Updated: ${updatedCount}`);
    console.log(`Apply errors: ${applyErrors.length}`);
    if (applyErrors.length > 0) {
      for (const err of applyErrors.slice(0, 20)) {
        console.error(`- ${err.product_title} (${err.product_id}): ${err.reason}`);
      }
      process.exitCode = 2;
    }
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
