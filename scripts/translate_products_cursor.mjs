#!/usr/bin/env node
/*
 * translate_products_cursor.mjs
 * --------------------------------------------------------------------------
 * Translates StockX EN product descriptions → FR using Cursor API (your plan
 * quota — no DeepL). Injects internal links to brand/model collections.
 *
 * SETUP (one time):
 *   npm install @cursor/sdk
 *   Cursor → Settings → API → create key → CURSOR_API_KEY in apps/.env
 *   node scripts/build-collection-link-map.mjs
 *
 * ENV:
 *   CURSOR_API_KEY          — bills against Cursor Ultra API usage ($400/mo)
 *   SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN
 *   BATCH_SIZE=25           — products per Cursor call (default 25)
 *   WRITE_CONCURRENCY=8     — parallel Shopify writes per batch
 *   CANDIDATES_CACHE=1      — cache EN product list (skip 30s catalog scan)
 *   SHARD=0 TOTAL_SHARDS=1  — parallel runs: shard 0..3 with total 4 (~4× faster)
 *   DRY_RUN=1               — preview prompt + skip writes
 *   LIMIT=100               — cap products (pilot)
 *   REPAIR=1                 — re-translate live EN bodies (ignores main checkpoint)
 *   OFFSET=N                — skip first N candidates (resume)
 *
 * RESUME: seo-system/product-translate-checkpoint.json (or product-translate-repair-* when REPAIR=1)
 * LOG:    seo-system/PRODUCT_TRANSLATE_LOG.csv
 */
import fs from 'node:fs';
import path from 'node:path';

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION || '2026-04';
const CURSOR_KEY = process.env.CURSOR_API_KEY;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '25', 10);
const WRITE_CONCURRENCY = parseInt(process.env.WRITE_CONCURRENCY || '12', 10);
const USE_CANDIDATES_CACHE = process.env.CANDIDATES_CACHE !== '0';
const REPAIR = process.env.REPAIR === '1';
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const OFFSET = parseInt(process.env.OFFSET || '0', 10);
const SHARD = parseInt(process.env.SHARD || '0', 10);
const TOTAL_SHARDS = parseInt(process.env.TOTAL_SHARDS || '1', 10);
const DRY_RUN = process.env.DRY_RUN === '1';
// Cheapest Cursor API tiers: *-nano, *-mini, *-flash, haiku. Avoid opus/sonnet/codex for bulk.
const MODEL = process.env.CURSOR_MODEL || 'gpt-5.4-nano';

const LINK_MAP_PATH = path.resolve('seo-system/collection-link-map.json');
const CHECKPOINT = path.resolve(
  REPAIR ? 'seo-system/product-translate-repair-checkpoint.json' : 'seo-system/product-translate-checkpoint.json',
);
const CANDIDATES_CACHE_PATH = path.resolve(
  REPAIR ? 'seo-system/product-translate-repair-candidates.json' : 'seo-system/product-translate-candidates.json',
);
const LOG_PATH = path.resolve(
  REPAIR ? 'seo-system/PRODUCT_TRANSLATE_REPAIR_LOG.csv' : 'seo-system/PRODUCT_TRANSLATE_LOG.csv',
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function csv(s) {
  return '"' + String(s ?? '').replace(/"/g, '""') + '"';
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function looksEnglish(html) {
  const t = stripHtml(html);
  if (!t || t.length < 40) return false;
  const low = t.toLowerCase();
  const frSignals = (low.match(/\b(chez|authentique|livraison|suisse|chaussure|paire|notre|vous|avec|cette|la paire|découvrez|semelle|coloris)\b/g) || []).length;
  const enSignals = (low.match(/\b(the|this release|was released|stands out|all day wear|style code|retail price|fans care)\b/g) || []).length;
  return enSignals >= 2 && enSignals > frSignals;
}

/** Stricter detector for repair pass — skips already-FR bodies. */
function needsRepairTranslation(html) {
  const t = stripHtml(html);
  if (!t || t.length < 40) return false;
  const low = t.toLowerCase();
  if (
    /\b(chez resell|coloris|date de sortie|prix de détail|authentique en suisse|la paire|découvrez la|conçu|fabriqué|semelle|coloris :|rend hommage|s'inscrit|associe un|marie l'inspiration)\b/.test(
      low,
    )
  ) {
    return false;
  }
  const enSignals = (
    low.match(
      /\b(this release|was released|stands out|all day wear|style code|retail price|fans care|designed for|features a|offers a|boasts a|debuting in|blends retro|came together|was designed|allows for a)\b/g,
    ) || []
  ).length;
  if (enSignals >= 2) return true;
  if (/^the (nike|adidas|asics|jordan|new balance|supreme|puma|reebok|converse|vans|ugg|salomon)/i.test(t)) return true;
  return enSignals >= 1 && /^the [a-z]/i.test(t);
}

function isEnglishCandidate(html) {
  return REPAIR ? needsRepairTranslation(html) : looksEnglish(html);
}

const SKIP_LINK_HANDLES = /^basketball-|^autre-|^other-|^performance-|^nike-other|^adidas-other|^new-balance-other/;

/** Per-product link targets: collab > model > brand (max 4). */
function resolveProductLinks(product, linkMap) {
  const hay = `${product.title} ${product.handle} ${stripHtml(product.descriptionHtml)}`.toLowerCase();
  const links = [];
  const usedHandles = new Set();

  const push = (entry) => {
    if (!entry || !entry.url || usedHandles.has(entry.handle) || links.length >= 4) return;
    if (SKIP_LINK_HANDLES.test(entry.handle)) return;
    usedHandles.add(entry.handle);
    links.push({ type: entry.type, label: entry.label, url: entry.url, handle: entry.handle });
  };

  for (const c of linkMap.collabs || []) {
    if (c.phrases.some((p) => hay.includes(p))) {
      push({ type: 'collab', label: c.label, url: c.url, handle: c.handle });
    }
  }

  // Explicit silhouette hints from handle/title (before generic slug scan)
  const silhouetteRules = [
    { re: /air-jordan-1|jordan-1|aj1/, handle: 'air-jordan-1-low', label: 'Air Jordan 1' },
    { re: /air-jordan-4|jordan-4|aj4/, handle: 'air-jordan-4', label: 'Air Jordan 4' },
    { re: /air-jordan-11|jordan-11|aj11/, handle: 'air-jordan-11', label: 'Air Jordan 11' },
    { re: /gel-1130|gel 1130/, handle: 'gel-1130', label: 'ASICS Gel-1130' },
    { re: /gel-nyc|gel nyc/, handle: 'gel-nyc', label: 'ASICS Gel-NYC' },
    { re: /gel-kayano-14|kayano-14|kayano 14/, handle: 'asics-gel-kayano-14', label: 'ASICS Gel-Kayano 14' },
    { re: /samba/, handle: 'adidas-samba', label: 'Adidas Samba' },
    { re: /dunk-low|dunk low/, handle: 'dunk-low', label: 'Nike Dunk Low' },
    { re: /dunk sb|dunk-sb/, handle: 'dunk-sb', label: 'Nike Dunk SB' },
    { re: /air-force-1|air force 1|af1/, handle: 'air-force-1', label: 'Nike Air Force 1' },
    { re: /air max plus|air-max-plus| tn/, handle: 'nike-air-max-plus-tn', label: 'Nike TN' },
  ];
  for (const rule of silhouetteRules) {
    if (rule.re.test(hay) && linkMap.collections?.[rule.handle]) {
      push({
        type: 'model',
        label: rule.label,
        url: linkMap.collections[rule.handle].url,
        handle: rule.handle,
      });
    }
  }

  for (const m of linkMap.models || []) {
    const labelHit = hay.includes(m.labelLower);
    const handleHit = hay.includes(m.handle.replace(/-/g, ' '));
    const col = linkMap.collections?.[m.handle];
    if (labelHit || handleHit) {
      push({
        type: 'model',
        label: m.label,
        url: m.url || col?.url || `/collections/${m.handle}`,
        handle: m.handle,
      });
    }
  }

  if (links.length < 4 && linkMap.collections) {
    const parts = product.handle.split('-');
    for (let len = Math.min(5, parts.length); len >= 2; len--) {
      for (let i = 0; i <= parts.length - len; i++) {
        const slug = parts.slice(i, i + len).join('-');
        if (linkMap.collections[slug] && !SKIP_LINK_HANDLES.test(slug)) {
          push({
            type: 'model',
            label: linkMap.collections[slug].title,
            url: linkMap.collections[slug].url,
            handle: slug,
          });
          break;
        }
      }
      if (links.filter((l) => l.type === 'model').length >= 2) break;
    }
  }

  const vendor = (product.vendor || '').toLowerCase().trim();
  if (vendor && linkMap.vendors[vendor]) {
    const v = linkMap.vendors[vendor];
    push({ type: 'brand', label: v.title, url: v.url, handle: v.handle });
  } else {
    for (const [key, v] of Object.entries(linkMap.vendors || {})) {
      if (hay.includes(key)) {
        push({ type: 'brand', label: v.title, url: v.url, handle: v.handle });
        break;
      }
    }
  }

  return links;
}

/** Wrap first plain-text occurrence of term (skip existing anchors/tags). */
function wrapFirstPlainText(html, term, wrapFn) {
  if (!term || term.length < 2) return null;
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const parts = html.split(/(<[^>]+>)/);
  let anchorDepth = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('<')) {
      if (/^<a[\s>]/i.test(part)) anchorDepth++;
      if (/^<\/a>/i.test(part)) anchorDepth--;
      continue;
    }
    if (anchorDepth > 0) continue;
    const m = part.match(re);
    if (m) {
      parts[i] = part.replace(re, wrapFn(m[0]));
      return parts.join('');
    }
  }
  return null;
}

function linkTerms(link) {
  const terms = [link.label];
  const parts = link.label.split(/\s+/);
  if (parts.length > 1) {
    terms.push(parts.slice(-2).join(' '));
    terms.push(parts[parts.length - 1]);
  }
  if (link.handle) terms.push(link.handle.replace(/-/g, ' '));
  return [...new Set(terms.filter((t) => t && t.length >= 3))];
}

/** Guarantee collab/model/brand links even if the LLM skipped them. */
function injectMissingLinks(html, links) {
  if (!html || !links?.length) return html;
  let out = html;
  const presentHandles = new Set(
    [...out.matchAll(/href="\/collections\/([^"?#]+)/gi)].map((m) => m[1]),
  );
  const typeOrder = { collab: 0, model: 1, brand: 2 };
  const missing = links
    .filter((l) => l.handle && !presentHandles.has(l.handle))
    .sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9));

  for (const link of missing) {
    const url = link.url?.startsWith('/') ? link.url : `/collections/${link.handle}`;
    let linked = false;
    for (const term of linkTerms(link)) {
      const wrapped = wrapFirstPlainText(out, term, (t) => `<a href="${url}">${t}</a>`);
      if (wrapped) {
        out = wrapped;
        presentHandles.add(link.handle);
        linked = true;
        break;
      }
    }
    if (!linked) {
      out = out.replace(/<p(\s[^>]*)?>/i, (m) => `${m}<a href="${url}">${link.label}</a> `);
      presentHandles.add(link.handle);
    }
  }
  return out;
}

async function gql(query, variables) {
  for (let a = 0; a < 15; a++) {
    const res = await fetch(`https://${SHOP}/admin/api/${V}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) {
      await sleep(Math.min(30000, 2000 * (a + 1)));
      continue;
    }
    const json = await res.json();
    if (json.errors && JSON.stringify(json.errors).includes('THROTTLED')) {
      await sleep(Math.min(30000, 1500 * (a + 1)));
      continue;
    }
    const ts = json.extensions?.cost?.throttleStatus;
    if (ts && ts.currentlyAvailable < 100) {
      const wait = Math.ceil((100 - ts.currentlyAvailable) / Math.max(ts.restoreRate || 50, 1)) * 1000;
      await sleep(Math.min(wait, 15000));
    }
    return json;
  }
  throw new Error('Shopify throttled out');
}

async function fetchCandidatesFromShopify() {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 400; page++) {
    const d = await gql(
      `query($c:String){products(first:100,after:$c,query:"status:active"){pageInfo{hasNextPage endCursor} nodes{id handle title vendor descriptionHtml}}}`,
      { c: cursor },
    );
    if (!d.data) break;
    for (const p of d.data.products.nodes) {
      if (!isEnglishCandidate(p.descriptionHtml)) continue;
      out.push(p);
    }
    if (!d.data.products.pageInfo.hasNextPage) break;
    cursor = d.data.products.pageInfo.endCursor;
  }
  return out;
}

async function fetchCandidates() {
  if (USE_CANDIDATES_CACHE && fs.existsSync(CANDIDATES_CACHE_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CANDIDATES_CACHE_PATH, 'utf8'));
      if (Array.isArray(cached.products) && cached.products.length > 0) {
        console.log(`[translate] candidates cache: ${cached.products.length} EN products`);
        return cached.products;
      }
    } catch {
      /* refresh below */
    }
  }
  console.log('[translate] scanning catalog for EN descriptions...');
  const products = await fetchCandidatesFromShopify();
  fs.writeFileSync(
    CANDIDATES_CACHE_PATH,
    JSON.stringify({ updatedAt: new Date().toISOString(), repair: REPAIR, products }, null, 0),
  );
  console.log(`[translate] cached ${products.length} ${REPAIR ? 'repair' : 'EN'} candidates`);
  return products;
}

function checkpointPath() {
  if (REPAIR) {
    return TOTAL_SHARDS > 1
      ? path.resolve(`seo-system/product-translate-repair-checkpoint-shard-${SHARD}.json`)
      : CHECKPOINT;
  }
  return TOTAL_SHARDS > 1
    ? path.resolve(`seo-system/product-translate-checkpoint-shard-${SHARD}.json`)
    : CHECKPOINT;
}

function logPath() {
  if (REPAIR) {
    return TOTAL_SHARDS > 1
      ? path.resolve(`seo-system/PRODUCT_TRANSLATE_REPAIR_LOG-shard-${SHARD}.csv`)
      : LOG_PATH;
  }
  return TOTAL_SHARDS > 1
    ? path.resolve(`seo-system/PRODUCT_TRANSLATE_LOG-shard-${SHARD}.csv`)
    : LOG_PATH;
}

function loadDoneSet() {
  const ids = new Set();
  const prefix = REPAIR ? 'product-translate-repair-checkpoint' : 'product-translate-checkpoint';
  const files = [CHECKPOINT];
  if (fs.existsSync(path.dirname(CHECKPOINT))) {
    for (const name of fs.readdirSync(path.dirname(CHECKPOINT))) {
      if (name.startsWith(`${prefix}-shard-`) && name.endsWith('.json')) {
        files.push(path.resolve(path.dirname(CHECKPOINT), name));
      }
    }
  }
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      for (const id of JSON.parse(fs.readFileSync(file, 'utf8')).doneIds || []) ids.add(id);
    } catch {
      /* skip corrupt file */
    }
  }
  return ids;
}

function loadShardCheckpoint() {
  const file = checkpointPath();
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  return { doneIds: [] };
}

function saveShardCheckpoint(cp) {
  fs.writeFileSync(checkpointPath(), JSON.stringify(cp, null, 2));
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function shardFilter(products) {
  return products.filter((_, i) => i % TOTAL_SHARDS === SHARD);
}

function buildPrompt(batch, linkMap) {
  return `You are a Swiss French ecommerce copywriter for Resell Lausanne (sneaker/streetwear resale).

Translate each product description from English to natural French (Switzerland). Rules:
- Keep brand names, colorways, style codes, SKUs, dates, prices unchanged
- Remove all StockX / marketplace references
- Output valid HTML: <p> paragraphs; specs as <p><strong>Label :</strong> value</p>
- Tone: professional, concise, not keyword-stuffed
- Include specs at end if present (Coloris, Style Code, Date de sortie, etc.) with French labels

INTERNAL LINKS (required when suggestedLinks is non-empty):
- Use ONLY URLs from each product's suggestedLinks array
- Priority: collab first, then model, then brand
- Max 4 links per product, first mention only
- Format: <a href="/collections/handle">Label</a>
- Example: Travis Scott AJ1 → link collab + model; Gel-1130 → link model + brand

Return ONLY valid JSON array (no markdown):
[{"id":"gid://shopify/Product/...","descriptionHtml":"<p>...</p>"}]

Products:
${JSON.stringify(
    batch.map((p) => ({
      id: p.id,
      handle: p.handle,
      title: p.title,
      vendor: p.vendor,
      suggestedLinks: resolveProductLinks(p, linkMap),
      descriptionHtml: p.descriptionHtml,
    })),
    null,
    0,
  )}`;
}

async function translateBatch(batch, linkMap) {
  const { Agent } = await import('@cursor/sdk');
  const prompt = buildPrompt(batch, linkMap);
  if (DRY_RUN) {
    console.log('--- DRY RUN PROMPT (first 800 chars) ---\n', prompt.slice(0, 800), '...\n');
    return batch.map((p) => ({
      id: p.id,
      descriptionHtml: `<p>[DRY RUN FR] ${p.title} — authentique en Suisse chez Resell Lausanne.</p>`,
    }));
  }
  const result = await Agent.prompt(prompt, {
    apiKey: CURSOR_KEY,
    model: { id: MODEL },
    local: { cwd: process.cwd() },
  });
  if (result.status === 'error') throw new Error(`Cursor run failed: ${result.id}`);
  const text = result.result || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`No JSON in Cursor response: ${text.slice(0, 400)}`);
  return JSON.parse(jsonMatch[0]);
}

async function writeProduct(id, descriptionHtml) {
  const m = `mutation($p:ProductUpdateInput!){productUpdate(product:$p){product{id handle} userErrors{message}}}`;
  for (let a = 0; a < 8; a++) {
    try {
      const r = await gql(m, { p: { id, descriptionHtml } });
      const errs = r.data?.productUpdate?.userErrors;
      if (errs?.length) throw new Error(JSON.stringify(errs));
      return r.data.productUpdate.product;
    } catch (e) {
      if (a === 7) throw e;
      await sleep(Math.min(30000, 2000 * (a + 1)));
    }
  }
}

async function main() {
  if (process.env.WARM_CACHE_ONLY === '1') {
    if (!SHOP || !TOKEN) {
      console.error('Missing Shopify env');
      process.exit(1);
    }
    await fetchCandidates();
    console.log('[translate] cache warm complete');
    return;
  }

  if (!SHOP || !TOKEN) {
    console.error('Missing Shopify env');
    process.exit(1);
  }
  if (!CURSOR_KEY && !DRY_RUN) {
    console.error('Missing CURSOR_API_KEY — get it from Cursor Settings → API');
    console.error('This uses your Cursor Ultra API quota ($400/mo), not DeepL.');
    process.exit(1);
  }
  if (!fs.existsSync(LINK_MAP_PATH)) {
    console.error(`Run first: node scripts/build-collection-link-map.mjs`);
    process.exit(1);
  }

  const linkMap = JSON.parse(fs.readFileSync(LINK_MAP_PATH, 'utf8'));
  const cp = loadShardCheckpoint();
  const doneSet = loadDoneSet();
  const runLog = logPath();

  console.log(
    `[translate] mode=${REPAIR ? 'REPAIR' : 'normal'} shard=${SHARD}/${TOTAL_SHARDS} model=${MODEL} batch=${BATCH_SIZE} write=${WRITE_CONCURRENCY} DRY_RUN=${DRY_RUN}`,
  );

  let all = shardFilter(await fetchCandidates());
  all = all.filter((p) => !doneSet.has(p.id));
  if (OFFSET) all = all.slice(OFFSET);
  if (LIMIT) all = all.slice(0, LIMIT);

  console.log(`[translate] candidates this run: ${all.length} (${REPAIR ? 'repair' : 'English'} descriptions)`);

  if (!fs.existsSync(runLog)) {
    fs.writeFileSync(runLog, 'timestamp,product_id,handle,title,chars\n');
  }

  let written = 0;
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = all.slice(i, i + BATCH_SIZE);
    console.log(`[translate] batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(all.length / BATCH_SIZE)} (${batch.length} products)...`);

    let translated;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        translated = await translateBatch(batch, linkMap);
        break;
      } catch (e) {
        console.warn(`  retry ${attempt + 1}: ${e.message}`);
        await sleep(3000 * (attempt + 1));
      }
    }
    if (!translated) {
      console.error('  batch failed after retries — skipping');
      continue;
    }

    const rows = translated
      .map((row) => {
        const src = batch.find((b) => b.id === row.id);
        if (!src || !row.descriptionHtml) return null;
        const suggestedLinks = resolveProductLinks(src, linkMap);
        const descriptionHtml = injectMissingLinks(row.descriptionHtml, suggestedLinks);
        return { src, id: row.id, descriptionHtml };
      })
      .filter(Boolean);

    if (!DRY_RUN) {
      await mapPool(rows, WRITE_CONCURRENCY, async (row) => {
        await writeProduct(row.id, row.descriptionHtml);
      });
      const ts = (await gql(`query{}`, {})).extensions?.cost?.throttleStatus;
      if (ts && ts.currentlyAvailable < 200) await sleep(800);
    }

    for (const row of rows) {
      cp.doneIds.push(row.id);
      doneSet.add(row.id);
      written++;
      fs.appendFileSync(
        runLog,
        [new Date().toISOString(), row.id, csv(row.src.handle), csv(row.src.title), row.descriptionHtml.length].join(',') + '\n',
      );
    }
    saveShardCheckpoint(cp);
    console.log(`  written so far: ${written}`);
  }

  console.log(`[translate] DONE written=${written} checkpoint=${checkpointPath()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
