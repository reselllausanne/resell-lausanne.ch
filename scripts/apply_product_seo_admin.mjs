#!/usr/bin/env node
/*
 * apply_product_seo_admin.mjs
 * --------------------------------------------------------------------------
 * Fills MISSING product meta descriptions (seo.description) on ACTIVE products
 * via the Shopify Admin GraphQL API. Takes effect on the live storefront
 * immediately (no theme push required).
 *
 * SAFETY CONTRACT:
 *  - Only writes seo.description when it is currently empty. Never overwrites
 *    an existing description.
 *  - Never touches seo.title (the theme already builds titles dynamically;
 *    writing admin titles would double-prepend the vendor).
 *  - Always re-sends the existing seo.title back in the same mutation so the
 *    title is provably preserved.
 *  - Logs every change (old empty -> new) to a CSV for full reversibility.
 *  - Idempotent / resumable: re-running skips products that now have a
 *    description.
 *
 * ENV:
 *  SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION
 *  DRY_RUN=1   -> preview only, no writes (prints samples)
 *  LIMIT=N     -> stop after N candidate products (0 = all)
 *  SAMPLE=N    -> in DRY_RUN, how many before/after rows to print (default 20)
 */
import fs from 'node:fs';
import path from 'node:path';

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION || '2026-04';
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const SAMPLE = parseInt(process.env.SAMPLE || '20', 10);

if (!SHOP || !TOKEN) {
  console.error('Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN');
  process.exit(1);
}

const LOG_PATH = path.resolve('seo-system/PRODUCT_SEO_ADMIN_CHANGE_LOG.csv');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`https://${SHOP}/admin/api/${V}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) { await sleep(2000); continue; }
    const json = await res.json();
    if (json.errors && JSON.stringify(json.errors).includes('THROTTLED')) { await sleep(2000); continue; }
    return json;
  }
  throw new Error('Too many throttled retries');
}

function wordSafe(s, max) {
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const i = cut.lastIndexOf(' ');
  if (i > 40) cut = cut.slice(0, i);
  return cut.replace(/[\s,;:.\u2013\u2014-]+$/, '');
}

// Brand-aware display name so the description carries the brand keyword.
function displayName(title, vendor) {
  const t = (title || '').trim();
  if (vendor && vendor.toLowerCase() !== 'resell_lausanne' && !t.toLowerCase().includes(vendor.toLowerCase())) {
    return `${vendor} ${t}`;
  }
  return t;
}

// FR meta description, front-loaded keyword + geo, trust clauses greedily added.
function genDesc(title, vendor) {
  const name = displayName(title, vendor);
  let base = `Achetez ${name} authentique en Suisse.`;
  if (base.length > 155) return wordSafe(base, 155);
  const clauses = [
    ' Livraison rapide.',
    ' Paiement en plusieurs fois.',
    ' Authenticité garantie, certificat inclus.',
    ' Resell Lausanne.',
  ];
  let out = base;
  for (const c of clauses) if ((out + c).length <= 155) out += c;
  return out;
}

function csvCell(s) {
  const v = (s == null ? '' : String(s));
  return '"' + v.replace(/"/g, '""') + '"';
}

async function main() {
  console.log(`[product-seo] shop=${SHOP} api=${V} DRY_RUN=${DRY_RUN} LIMIT=${LIMIT || 'all'}`);
  if (!DRY_RUN && !fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, 'timestamp,product_id,handle,vendor,new_description,description_length\n');
  }

  let cursor = null;
  let scanned = 0, candidates = 0, written = 0, printed = 0;
  const t0 = Date.now();

  outer:
  for (let page = 0; page < 400; page++) {
    const q = `query($c:String){products(first:100,after:$c,query:"status:active"){pageInfo{hasNextPage endCursor} nodes{id handle title vendor seo{title description}}}}`;
    const d = await gql(q, { c: cursor });
    if (!d.data) { console.error(JSON.stringify(d.errors || d)); break; }
    const conn = d.data.products;

    for (const p of conn.nodes) {
      scanned++;
      const hasDesc = p.seo && p.seo.description && p.seo.description.trim().length > 0;
      if (hasDesc) continue;
      candidates++;
      const newDesc = genDesc(p.title, p.vendor);

      if (DRY_RUN) {
        if (printed < SAMPLE) {
          console.log(`  ${p.title}  ->  "${newDesc}" [${newDesc.length}]`);
          printed++;
        }
      } else {
        const m = `mutation($product:ProductUpdateInput!){productUpdate(product:$product){product{id} userErrors{field message}}}`;
        // Re-send existing title unchanged so it is provably preserved.
        const seoInput = { description: newDesc };
        if (p.seo && p.seo.title) seoInput.title = p.seo.title;
        const r = await gql(m, { product: { id: p.id, seo: seoInput } });
        const errs = r.data && r.data.productUpdate && r.data.productUpdate.userErrors;
        if (errs && errs.length) {
          console.error(`  ERROR ${p.handle}: ${JSON.stringify(errs)}`);
        } else {
          written++;
          fs.appendFileSync(LOG_PATH,
            [new Date().toISOString(), p.id, csvCell(p.handle), csvCell(p.vendor), csvCell(newDesc), newDesc.length].join(',') + '\n');
        }
        const ext = r.extensions && r.extensions.cost;
        const ts = ext && ext.throttleStatus;
        const qc = (ext && ext.requestedQueryCost) || 10;
        if (ts) {
          const need = qc * 2;
          if (ts.currentlyAvailable < need) {
            const restore = ts.restoreRate || 100;
            await sleep(Math.min(1500, Math.ceil(((need - ts.currentlyAvailable) / restore) * 1000)));
          }
        }
      }

      if (LIMIT && candidates >= LIMIT) break outer;
    }

    if (written && written % 250 === 0) {
      const rate = (written / ((Date.now() - t0) / 1000)).toFixed(1);
      console.log(`  ...scanned=${scanned} candidates=${candidates} written=${written} (${rate}/s)`);
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  console.log(`[product-seo] DONE scanned=${scanned} candidates=${candidates} written=${written} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (!DRY_RUN) console.log(`[product-seo] change log -> ${LOG_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
