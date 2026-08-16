#!/usr/bin/env node
/**
 * apply_collection_seo_admin.mjs — controlled Shopify Admin SEO title/description writer.
 *
 * Reads one or more review CSVs (handle, new_title[, new_description]) and updates
 * ONLY the `seo.title` / `seo.description` fields on the matching collection via
 * `collectionUpdate`. Nothing else on the collection is touched (no rules, no
 * sort order, no publishing state, no body HTML).
 *
 * Safety:
 *   - DRY RUN by default. Nothing is written unless --apply is passed.
 *   - Fetches current seo.title/seo.description first and logs before -> after.
 *   - Skips a row if the current live value no longer matches what the CSV was
 *     generated from (avoids clobbering a manual edit made after export), unless
 *     --force is passed.
 *   - Every applied mutation is appended to seo-system/COLLECTION_SEO_ADMIN_CHANGE_LOG.csv
 *     with a timestamp, for a full audit trail / manual rollback reference.
 *
 * Usage (dry run, default):
 *   node scripts/apply_collection_seo_admin.mjs seo-system/COLLECTION_TITLE_SMART_TRIM_PLAN.csv
 *
 * Usage (apply for real):
 *   node scripts/apply_collection_seo_admin.mjs seo-system/COLLECTION_TITLE_SMART_TRIM_PLAN.csv --apply
 */
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const csvPaths = args.filter((a) => !a.startsWith("--"));

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LOG_PATH = path.resolve(ROOT_DIR, "seo-system/COLLECTION_SEO_ADMIN_CHANGE_LOG.csv");

if (!SHOP || !TOKEN) {
  console.error("Missing env. Required: SHOP (or SHOPIFY_STORE_DOMAIN) and SHOPIFY_ADMIN_TOKEN.");
  process.exit(1);
}
if (csvPaths.length === 0) {
  console.error("Usage: node scripts/apply_collection_seo_admin.mjs <csv...> [--apply] [--force]");
  process.exit(1);
}

const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  const cost = json.extensions?.cost;
  if (cost && cost.throttleStatus.currentlyAvailable < cost.throttleStatus.maximumAvailable * 0.2) {
    const wait = Math.ceil(((cost.throttleStatus.maximumAvailable * 0.5) - cost.throttleStatus.currentlyAvailable) / cost.throttleStatus.restoreRate);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait * 1000));
  }
  return json.data;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function getCollection(handle) {
  const q = `query($h:String!){ collectionByHandle(handle:$h){ id handle seo { title description } } }`;
  const data = await gql(q, { h: handle });
  return data.collectionByHandle;
}

async function updateCollectionSeo(id, seo) {
  const m = `mutation($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id handle seo { title description } }
      userErrors { field message }
    }
  }`;
  const data = await gql(m, { input: { id, seo } });
  const errs = data.collectionUpdate.userErrors;
  if (errs && errs.length) throw new Error(`userErrors: ${JSON.stringify(errs)}`);
  return data.collectionUpdate.collection;
}

async function main() {
  console.error(`Mode: ${APPLY ? "APPLY (writing to live Admin)" : "DRY RUN (no writes)"}${FORCE ? " [force]" : ""}`);

  const rows = [];
  for (const p of csvPaths) {
    const text = await fs.readFile(p, "utf-8");
    rows.push(...parseCsv(text));
  }

  const logLines = [];
  let applied = 0, skippedMismatch = 0, skippedNoChange = 0, errors = 0;

  for (const row of rows) {
    const handle = row.handle;
    if (!handle) continue;
    const newTitle = (row.new_title || "").trim();
    const newDesc = row.new_description !== undefined ? row.new_description.trim() : undefined;
    const expectedCurrentTitle = (row.current_title || "").trim();

    let col;
    try {
      col = await getCollection(handle);
    } catch (e) {
      console.error(`[ERROR] ${handle}: fetch failed: ${e.message}`);
      errors++;
      continue;
    }
    if (!col) {
      console.error(`[SKIP] ${handle}: collection not found`);
      continue;
    }

    const liveTitle = col.seo?.title || "";
    const liveDesc = col.seo?.description || "";

    if (expectedCurrentTitle && liveTitle !== expectedCurrentTitle && !FORCE) {
      console.error(`[SKIP-MISMATCH] ${handle}: live title changed since export ("${liveTitle}" != expected "${expectedCurrentTitle}"). Use --force to override.`);
      skippedMismatch++;
      continue;
    }

    const seoInput = {};
    let titleChanges = false, descChanges = false;
    if (newTitle && newTitle !== liveTitle) { seoInput.title = newTitle; titleChanges = true; }
    if (newDesc !== undefined && newDesc && newDesc !== liveDesc) { seoInput.description = newDesc; descChanges = true; }

    if (!titleChanges && !descChanges) {
      skippedNoChange++;
      continue;
    }

    console.log(`${handle}:`);
    if (titleChanges) console.log(`  title: "${liveTitle}" -> "${newTitle}"`);
    if (descChanges) console.log(`  desc:  "${liveDesc}" -> "${newDesc}"`);

    if (APPLY) {
      try {
        await updateCollectionSeo(col.id, seoInput);
        applied++;
        logLines.push([
          new Date().toISOString(), handle, col.id,
          titleChanges ? liveTitle : "", titleChanges ? newTitle : "",
          descChanges ? liveDesc : "", descChanges ? newDesc : "",
        ]);
      } catch (e) {
        console.error(`[ERROR] ${handle}: update failed: ${e.message}`);
        errors++;
      }
    }
  }

  if (APPLY && logLines.length) {
    let existing = "";
    try { existing = await fs.readFile(LOG_PATH, "utf-8"); } catch {}
    const header = "timestamp,handle,collection_id,old_title,new_title,old_description,new_description\n";
    const body = logLines.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
    if (!existing) await fs.writeFile(LOG_PATH, header + body);
    else await fs.appendFile(LOG_PATH, body);
    console.error(`Appended ${logLines.length} rows to ${LOG_PATH}`);
  }

  console.error(`\nDone. applied=${applied} skipped_mismatch=${skippedMismatch} skipped_no_change=${skippedNoChange} errors=${errors} total_rows=${rows.length}`);
  if (!APPLY) console.error("This was a DRY RUN. Re-run with --apply to write to Admin.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
