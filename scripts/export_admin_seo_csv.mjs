#!/usr/bin/env node
/**
 * export_admin_seo_csv.mjs — READ-ONLY Shopify Admin GraphQL export.
 *
 * Pulls products + collections (handle, title, vendor, SEO title/description)
 * into CSVs shaped for scripts/generate_seo_metadata_plan.py. No mutations,
 * no --apply flag exists in this script on purpose — it only reads.
 *
 * Required env: SHOP (or SHOPIFY_STORE_DOMAIN), SHOPIFY_ADMIN_TOKEN
 * (or SHOPIFY_ADMIN_ACCESS_TOKEN). Optional: SHOPIFY_API_VERSION.
 *
 * Usage:
 *   node scripts/export_admin_seo_csv.mjs
 *   node scripts/export_admin_seo_csv.mjs --limit=500   (products cap, for a quick sample)
 */
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (prefix, fallback = null) => {
  const v = args.find((a) => a.startsWith(`${prefix}=`));
  return v ? v.slice(prefix.length + 1) : fallback;
};

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT_DIR = path.resolve(ROOT_DIR, "audit-inputs");
const PRODUCT_LIMIT = Number.parseInt(getArg("--limit", "0"), 10) || Infinity;

if (!SHOP || !TOKEN) {
  console.error("Missing env. Required: SHOP (or SHOPIFY_STORE_DOMAIN) and SHOPIFY_ADMIN_TOKEN.");
  process.exit(1);
}

const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  const cost = json.extensions?.cost;
  if (cost && cost.throttleStatus.currentlyAvailable < cost.throttleStatus.maximumAvailable * 0.2) {
    const wait = Math.ceil(((cost.throttleStatus.maximumAvailable * 0.5) - cost.throttleStatus.currentlyAvailable) / cost.throttleStatus.restoreRate);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait * 1000));
  }
  return json.data;
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

const Q_PRODUCTS = `
  query ProductsPage($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          handle
          title
          vendor
          descriptionHtml
          seo { title description }
        }
      }
    }
  }
`;

const Q_COLLECTIONS = `
  query CollectionsPage($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          handle
          title
          productsCount { count }
          seo { title description }
        }
      }
    }
  }
`;

async function exportProducts() {
  const rows = [];
  let after = null;
  let hasNext = true;
  while (hasNext && rows.length < PRODUCT_LIMIT) {
    const data = await gql(Q_PRODUCTS, { first: 100, after });
    for (const edge of data.products.edges) {
      const n = edge.node;
      rows.push({
        Handle: n.handle,
        Title: n.title,
        Vendor: n.vendor,
        "Body (HTML)": n.descriptionHtml,
        "SEO Title": n.seo?.title || "",
        "SEO Description": n.seo?.description || "",
      });
    }
    hasNext = data.products.pageInfo.hasNextPage;
    after = data.products.pageInfo.endCursor;
    process.stderr.write(`\rproducts: ${rows.length}`);
  }
  process.stderr.write("\n");
  return rows;
}

async function exportCollections() {
  const rows = [];
  let after = null;
  let hasNext = true;
  while (hasNext) {
    const data = await gql(Q_COLLECTIONS, { first: 100, after });
    for (const edge of data.collections.edges) {
      const n = edge.node;
      rows.push({
        Handle: n.handle,
        Title: n.title,
        "Products Count": n.productsCount?.count ?? "",
        "SEO Title": n.seo?.title || "",
        "SEO Description": n.seo?.description || "",
      });
    }
    hasNext = data.collections.pageInfo.hasNextPage;
    after = data.collections.pageInfo.endCursor;
    process.stderr.write(`\rcollections: ${rows.length}`);
  }
  process.stderr.write("\n");
  return rows;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.error("Exporting collections (read-only)...");
  const collections = await exportCollections();
  await fs.writeFile(
    path.join(OUT_DIR, "collections_export.csv"),
    toCsv(collections, ["Handle", "Title", "Products Count", "SEO Title", "SEO Description"])
  );
  console.error(`Wrote ${collections.length} collections -> audit-inputs/collections_export.csv`);

  console.error("Exporting products (read-only)...");
  const products = await exportProducts();
  await fs.writeFile(
    path.join(OUT_DIR, "products_export.csv"),
    toCsv(products, ["Handle", "Title", "Vendor", "Body (HTML)", "SEO Title", "SEO Description"])
  );
  console.error(`Wrote ${products.length} products -> audit-inputs/products_export.csv`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
