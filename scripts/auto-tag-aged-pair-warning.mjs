// Auto-tag sneakers/footwear older than a release-date threshold with aged-pair-warning. // pragma: allowlist secret
// Release dates are read from custom.release_date metafield or parsed from description HTML.
//
// Usage:
//   node --env-file=apps/.env scripts/auto-tag-aged-pair-warning.mjs
//   node --env-file=apps/.env scripts/auto-tag-aged-pair-warning.mjs --apply
//   node --env-file=apps/.env scripts/auto-tag-aged-pair-warning.mjs --apply --years=5
//   node --env-file=apps/.env scripts/auto-tag-aged-pair-warning.mjs --apply --before=2021-01-01
//   node --env-file=apps/.env scripts/auto-tag-aged-pair-warning.mjs --apply --backfill-metafield

import fs from "node:fs/promises";
import path from "node:path";
import {
  isOlderThanDate,
  isOlderThanYears,
  isSealedCollectible,
  parseReleaseDateFromHtml,
  parseReleaseDateFromMetafield,
} from "./lib/parse-release-date.mjs";

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (prefix, fallback = null) => {
  const value = args.find((arg) => arg.startsWith(`${prefix}=`));
  return value ? value.slice(prefix.length + 1) : fallback;
};

const APPLY = hasFlag("--apply");
const DRY_RUN = !APPLY || hasFlag("--dry-run");
const BACKFILL_METAFIELD = hasFlag("--backfill-metafield");
const YEARS = Number.parseInt(getArg("--years", "5"), 10) || 5;
const BEFORE = getArg("--before", null);
const LIMIT = Number.parseInt(getArg("--limit", "0"), 10) || 0;
const TAG = getArg("--tag", "aged-pair-warning");

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LOG_PATH = path.resolve(ROOT_DIR, "seo-system/AGED_PAIR_WARNING_TAG_LOG.csv");

if (!SHOP || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (json.errors) {
      const throttled = json.errors.some((err) => err?.extensions?.code === "THROTTLED");
      if (throttled && attempt <= 5) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(JSON.stringify(json.errors));
    }
    return json.data;
  }
}

const Q_PRODUCTS = `
  query ProductsPage($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        vendor
        productType
        tags
        descriptionHtml
        releaseDate: metafield(namespace: "custom", key: "release_date") { value }
        collections(first: 30) {
          nodes { handle }
        }
      }
    }
  }
`;

const M_TAGS_ADD = `
  mutation TagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node { id }
      userErrors { field message }
    }
  }
`;

const M_TAGS_REMOVE = `
  mutation TagsRemove($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) {
      node { id }
      userErrors { field message }
    }
  }
`;

const M_METAFIELDS_SET = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key }
      userErrors { field message code }
    }
  }
`;

function shouldWarn(releaseDate, referenceDate = new Date()) {
  if (!releaseDate) return false;
  if (BEFORE) return isOlderThanDate(releaseDate, BEFORE);
  return isOlderThanYears(releaseDate, YEARS, referenceDate);
}

function resolveReleaseDate(product) {
  const fromMetafield = parseReleaseDateFromMetafield(product.releaseDate);
  if (fromMetafield) return { date: fromMetafield, source: "metafield" };
  const fromHtml = parseReleaseDateFromHtml(product.descriptionHtml);
  if (fromHtml) return { date: fromHtml, source: "description" };
  return { date: null, source: null };
}

function hasTag(product, tag) {
  const normalized = tag.toLowerCase();
  return (product.tags || []).some((value) => String(value).toLowerCase() === normalized);
}

async function appendLog(rows) {
  const header = "timestamp,action,handle,product_id,release_date,release_source,reason\n";
  let existing = "";
  try {
    existing = await fs.readFile(LOG_PATH, "utf8");
  } catch {
    existing = header;
  }
  if (!existing.startsWith("timestamp,")) {
    existing = header + existing;
  }
  await fs.writeFile(LOG_PATH, existing + rows.join("\n") + (rows.length ? "\n" : ""));
}

async function applyTag(productId, tag) {
  const data = await gql(M_TAGS_ADD, { id: productId, tags: [tag] });
  const errors = data.tagsAdd.userErrors;
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
}

async function removeTag(productId, tag) {
  const data = await gql(M_TAGS_REMOVE, { id: productId, tags: [tag] });
  const errors = data.tagsRemove.userErrors;
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
}

async function backfillReleaseDate(productId, releaseDate) {
  const data = await gql(M_METAFIELDS_SET, {
    metafields: [
      {
        ownerId: productId,
        namespace: "custom",
        key: "release_date",
        type: "date",
        value: releaseDate,
      },
    ],
  });
  const errors = data.metafieldsSet.userErrors;
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
}

async function main() {
  const referenceDate = new Date();
  const thresholdLabel = BEFORE ? `before ${BEFORE}` : `${YEARS} years`;

  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log(`Threshold: release date ${thresholdLabel}`);
  console.log(`Tag: ${TAG}`);
  if (BACKFILL_METAFIELD) console.log("Backfill: custom.release_date from description when missing");

  let cursor = null;
  let processed = 0;
  let toAdd = 0;
  let toRemove = 0;
  let skippedCollectible = 0;
  let missingRelease = 0;
  const logRows = [];

  while (true) {
    const data = await gql(Q_PRODUCTS, { first: 50, after: cursor });
    const { nodes, pageInfo } = data.products;

    for (const product of nodes) {
      if (LIMIT > 0 && processed >= LIMIT) break;

      processed += 1;
      const { date: releaseDate, source: releaseSource } = resolveReleaseDate(product);
      const tagged = hasTag(product, TAG);

      if (isSealedCollectible(product)) {
        skippedCollectible += 1;
        if (tagged) {
          toRemove += 1;
          console.log(`− ${product.handle}: remove tag (collectible)`);
          logRows.push(
            `${new Date().toISOString()},remove_tag,${product.handle},${product.id},${releaseDate || ""},${releaseSource || ""},collectible`,
          );
          if (!DRY_RUN) await removeTag(product.id, TAG);
        }
        continue;
      }

      if (!releaseDate) {
        missingRelease += 1;
        if (tagged) {
          toRemove += 1;
          console.log(`− ${product.handle}: remove tag (no release date)`);
          logRows.push(
            `${new Date().toISOString()},remove_tag,${product.handle},${product.id},,,missing_release_date`,
          );
          if (!DRY_RUN) await removeTag(product.id, TAG);
        }
        continue;
      }

      const warn = shouldWarn(releaseDate, referenceDate);

      if (BACKFILL_METAFIELD && releaseSource === "description" && !DRY_RUN) {
        await backfillReleaseDate(product.id, releaseDate);
      } else if (BACKFILL_METAFIELD && releaseSource === "description" && DRY_RUN) {
        console.log(`  ${product.handle}: would backfill custom.release_date=${releaseDate}`);
      }

      if (warn && !tagged) {
        toAdd += 1;
        console.log(`+ ${product.handle}: add tag (${releaseDate})`);
        logRows.push(
          `${new Date().toISOString()},add_tag,${product.handle},${product.id},${releaseDate},${releaseSource},older_than_threshold`,
        );
        if (!DRY_RUN) await applyTag(product.id, TAG);
      } else if (!warn && tagged) {
        toRemove += 1;
        console.log(`− ${product.handle}: remove tag (${releaseDate})`);
        logRows.push(
          `${new Date().toISOString()},remove_tag,${product.handle},${product.id},${releaseDate},${releaseSource},newer_than_threshold`,
        );
        if (!DRY_RUN) await removeTag(product.id, TAG);
      }
    }

    if (LIMIT > 0 && processed >= LIMIT) break;
    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  if (logRows.length) await appendLog(logRows);

  console.log("\nSummary");
  console.log(`  processed: ${processed}`);
  console.log(`  add tag: ${toAdd}`);
  console.log(`  remove tag: ${toRemove}`);
  console.log(`  skipped collectible: ${skippedCollectible}`);
  console.log(`  missing release date: ${missingRelease}`);
  if (logRows.length) console.log(`  log: ${LOG_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
