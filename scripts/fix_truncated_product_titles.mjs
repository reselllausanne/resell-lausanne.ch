#!/usr/bin/env node
/*
 * fix_truncated_product_titles.mjs
 * --------------------------------------------------------------------------
 * Repairs product SEO titles left with a truncated shop-name fragment
 * (e.g. "... | Resell") by an earlier bulk title apply. For each affected
 * title:
 *   - rebuild "{head} | Resell Lausanne" if it fits <= 60 chars, else
 *   - drop the dangling fragment and keep "{head}".
 *
 * SAFETY:
 *  - Only touches titles whose trailing " | X" fragment is a *proper prefix*
 *    of "Resell Lausanne" (i.e. clearly a cut-off shop name). Full
 *    "... | Resell Lausanne" titles and unrelated titles are left untouched.
 *  - Re-sends the existing seo.description in the same mutation (preserved).
 *  - Logs old -> new to a CSV (reversible).
 *  - Idempotent: a title already ending in the full shop name is skipped.
 *
 * ENV: DRY_RUN=1 (preview), LIMIT=N, SAMPLE=N
 */
import fs from 'node:fs';
import path from 'node:path';

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION || '2026-04';
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const SAMPLE = parseInt(process.env.SAMPLE || '20', 10);
const SHOP_FULL = 'Resell Lausanne';
const LOG_PATH = path.resolve('seo-system/PRODUCT_TITLE_FIX_LOG.csv');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  for (let a = 0; a < 6; a++) {
    const res = await fetch(`https://${SHOP}/admin/api/${V}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) { await sleep(2000); continue; }
    const j = await res.json();
    if (j.errors && JSON.stringify(j.errors).includes('THROTTLED')) { await sleep(2000); continue; }
    return j;
  }
  throw new Error('throttled out');
}

// Returns fixed title, or null if the title is fine / not a truncated shop name.
function fixTitle(t) {
  if (!t) return null;
  const idx = t.lastIndexOf(' | ');
  if (idx <= 0) return null;
  const head = t.slice(0, idx).trim();
  const frag = t.slice(idx + 3).trim();
  if (!head) return null;
  if (frag === SHOP_FULL) return null; // already correct
  // frag must be a non-empty proper prefix of "Resell Lausanne"
  if (frag.length === 0 || frag.length >= SHOP_FULL.length) return null;
  if (!SHOP_FULL.startsWith(frag)) return null;
  const rebuilt = `${head} | ${SHOP_FULL}`;
  return rebuilt.length <= 60 ? rebuilt : head;
}

function csv(s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; }

async function main() {
  console.log(`[title-fix] shop=${SHOP} api=${V} DRY_RUN=${DRY_RUN} LIMIT=${LIMIT || 'all'}`);
  if (!DRY_RUN && !fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, 'timestamp,product_id,handle,old_title,new_title\n');
  }
  let cursor = null, scanned = 0, fixed = 0, printed = 0;
  for (let page = 0; page < 400; page++) {
    const q = `query($c:String){products(first:100,after:$c,query:"status:active"){pageInfo{hasNextPage endCursor} nodes{id handle seo{title description}}}}`;
    const d = await gql(q, { c: cursor });
    if (!d.data) { console.error(JSON.stringify(d.errors || d)); break; }
    for (const p of d.data.products.nodes) {
      scanned++;
      const old = p.seo && p.seo.title;
      const neu = fixTitle(old);
      if (!neu || neu === old) continue;
      if (DRY_RUN) {
        if (printed < SAMPLE) { console.log(`  "${old}"  ->  "${neu}" [${neu.length}]`); printed++; }
        fixed++;
      } else {
        const m = `mutation($product:ProductUpdateInput!){productUpdate(product:$product){userErrors{field message}}}`;
        const seoInput = { title: neu };
        if (p.seo && p.seo.description) seoInput.description = p.seo.description;
        const r = await gql(m, { product: { id: p.id, seo: seoInput } });
        const errs = r.data && r.data.productUpdate && r.data.productUpdate.userErrors;
        if (errs && errs.length) { console.error(`  ERR ${p.handle}: ${JSON.stringify(errs)}`); }
        else {
          fixed++;
          fs.appendFileSync(LOG_PATH, [new Date().toISOString(), p.id, csv(p.handle), csv(old), csv(neu)].join(',') + '\n');
        }
        const ts = r.extensions && r.extensions.cost && r.extensions.cost.throttleStatus;
        const qc = (r.extensions && r.extensions.cost && r.extensions.cost.requestedQueryCost) || 10;
        if (ts && ts.currentlyAvailable < qc * 2) await sleep(Math.min(1500, Math.ceil(((qc * 2 - ts.currentlyAvailable) / (ts.restoreRate || 100)) * 1000)));
      }
      if (LIMIT && fixed >= LIMIT) { console.log(`[title-fix] LIMIT reached`); console.log(`[title-fix] DONE scanned=${scanned} fixed=${fixed}`); return; }
    }
    if (!d.data.products.pageInfo.hasNextPage) break;
    cursor = d.data.products.pageInfo.endCursor;
  }
  console.log(`[title-fix] DONE scanned=${scanned} fixed=${fixed}`);
  if (!DRY_RUN) console.log(`[title-fix] log -> ${LOG_PATH}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
