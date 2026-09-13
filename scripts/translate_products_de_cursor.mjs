#!/usr/bin/env node
/*
 * translate_products_de_cursor.mjs
 * --------------------------------------------------------------------------
 * Translates already-FR Shopify product bodies → DE (Swiss German) and writes
 * to Shopify Translations for locale `de` (does NOT overwrite the FR
 * body_html). Also translates title, meta_title, meta_description.
 *
 * SETUP (one time):
 *   Cursor → Settings → API → create key → CURSOR_API_KEY in apps/.env
 *   node scripts/build-collection-link-map.mjs   (reuses existing map)
 *
 * ENV:
 *   CURSOR_API_KEY          — bills against Cursor Ultra API usage
 *   SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN
 *   BATCH_SIZE=15           — products per Cursor call (DE bodies are longer)
 *   WRITE_CONCURRENCY=8     — parallel Shopify translationsRegister writes
 *   CANDIDATES_CACHE=1      — cache FR product list (skip 30s catalog scan)
 *   SHARD=0 TOTAL_SHARDS=1  — parallel runs
 *   DRY_RUN=1               — preview prompt + skip writes
 *   LIMIT=100               — cap products (pilot)
 *   FORCE=1                 — re-translate even if DE translation exists
 *   OFFSET=N                — skip first N candidates
 *   MODEL=gpt-5.4-nano      — Cursor model (avoid opus/sonnet for bulk)
 *   FIELDS=body_html,title,meta_title,meta_description  (default all 4)
 *
 * RESUME: seo-system/product-translate-de-checkpoint.json
 *         (+ product-translate-de-checkpoint-shard-N.json when sharded)
 * LOG:    seo-system/PRODUCT_TRANSLATE_DE_LOG.csv
 *
 * NOTES:
 *   - Never overwrites the FR body_html. Writes are strictly to the DE
 *     locale via `translationsRegister`.
 *   - Requires each translation to include the source's `translatableContentDigest`
 *     — we fetch it from `translatableResource` for every product before writing.
 *   - Priority order: body_html > title > meta_description > meta_title
 *     (safe to Ctrl-C mid-run; body_html landed first for SEO impact).
 */
import fs from 'node:fs';
import path from 'node:path';

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION || '2026-04';
const CURSOR_KEY = process.env.CURSOR_API_KEY;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '15', 10);
const WRITE_CONCURRENCY = parseInt(process.env.WRITE_CONCURRENCY || '8', 10);
const USE_CANDIDATES_CACHE = process.env.CANDIDATES_CACHE !== '0';
const FORCE = process.env.FORCE === '1';
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const OFFSET = parseInt(process.env.OFFSET || '0', 10);
const SHARD = parseInt(process.env.SHARD || '0', 10);
const TOTAL_SHARDS = parseInt(process.env.TOTAL_SHARDS || '1', 10);
const DRY_RUN = process.env.DRY_RUN === '1';
const MODEL = process.env.CURSOR_MODEL || 'gpt-5.4-nano';
const TARGET_LOCALE = 'de';
const FIELDS = (process.env.FIELDS || 'body_html,title,meta_title,meta_description')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const LINK_MAP_PATH = path.resolve('seo-system/collection-link-map.json');
const CHECKPOINT = path.resolve('seo-system/product-translate-de-checkpoint.json');
const CANDIDATES_CACHE_PATH = path.resolve('seo-system/product-translate-de-candidates.json');
const LOG_PATH = path.resolve('seo-system/PRODUCT_TRANSLATE_DE_LOG.csv');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const csv = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const stripHtml = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** FR detector — only accept bodies that are already French (avoid EN carry-over). */
function looksFrench(html) {
  const t = stripHtml(html);
  if (!t || t.length < 40) return false;
  const low = t.toLowerCase();
  const frSignals = (
    low.match(
      /\b(chez|authentique|livraison|suisse|chaussure|paire|notre|vous|avec|cette|découvrez|semelle|coloris|conçu|fabriqué|associe|rend hommage|prix|date de sortie|détail)\b/g,
    ) || []
  ).length;
  const enSignals = (
    low.match(/\b(the|this release|was released|stands out|all day wear|style code|retail price)\b/g) || []
  ).length;
  return frSignals >= 3 && frSignals > enSignals;
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

/**
 * Fetch translatable content per product (key + value + digest + existing DE).
 * We rely on translatableResource for the digest — required by translationsRegister.
 */
async function fetchProductTranslatableContent(id) {
  const q = `query($id:ID!,$loc:String!){
    translatableResource(resourceId:$id){
      resourceId
      translatableContent{ key value digest locale type }
      translations(locale:$loc){ key value locale }
    }
  }`;
  const r = await gql(q, { id, loc: TARGET_LOCALE });
  return r.data?.translatableResource;
}

/** Fetch product handles/titles/vendor + FR body via a bulk-safe pagination scan. */
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
      if (!looksFrench(p.descriptionHtml)) continue;
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
        console.log(`[de] candidates cache: ${cached.products.length} FR products`);
        return cached.products;
      }
    } catch {
      /* refresh below */
    }
  }
  console.log('[de] scanning catalog for FR descriptions...');
  const products = await fetchCandidatesFromShopify();
  fs.writeFileSync(
    CANDIDATES_CACHE_PATH,
    JSON.stringify({ updatedAt: new Date().toISOString(), products }, null, 0),
  );
  console.log(`[de] cached ${products.length} FR candidates`);
  return products;
}

function checkpointPath() {
  return TOTAL_SHARDS > 1
    ? path.resolve(`seo-system/product-translate-de-checkpoint-shard-${SHARD}.json`)
    : CHECKPOINT;
}

function logPath() {
  return TOTAL_SHARDS > 1
    ? path.resolve(`seo-system/PRODUCT_TRANSLATE_DE_LOG-shard-${SHARD}.csv`)
    : LOG_PATH;
}

function loadDoneSet() {
  const ids = new Set();
  const files = [CHECKPOINT];
  if (fs.existsSync(path.dirname(CHECKPOINT))) {
    for (const name of fs.readdirSync(path.dirname(CHECKPOINT))) {
      if (name.startsWith('product-translate-de-checkpoint-shard-') && name.endsWith('.json')) {
        files.push(path.resolve(path.dirname(CHECKPOINT), name));
      }
    }
  }
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      for (const id of JSON.parse(fs.readFileSync(file, 'utf8')).doneIds || []) ids.add(id);
    } catch {
      /* skip */
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

/** Reuse link-map resolver from FR script (same silhouette rules). */
function resolveProductLinks(product, linkMap) {
  const SKIP = /^basketball-|^autre-|^other-|^performance-|^nike-other|^adidas-other|^new-balance-other/;
  const hay = `${product.title} ${product.handle} ${stripHtml(product.descriptionHtml)}`.toLowerCase();
  const links = [];
  const used = new Set();
  const push = (e) => {
    if (!e || !e.url || used.has(e.handle) || links.length >= 4 || SKIP.test(e.handle)) return;
    used.add(e.handle);
    links.push(e);
  };
  for (const c of linkMap.collabs || []) {
    if (c.phrases.some((p) => hay.includes(p))) {
      push({ type: 'collab', label: c.label, url: c.url, handle: c.handle });
    }
  }
  const silhouetteRules = [
    { re: /air-jordan-1|jordan-1|aj1/, handle: 'air-jordan-1-low', label: 'Air Jordan 1' },
    { re: /air-jordan-4|jordan-4|aj4/, handle: 'air-jordan-4', label: 'Air Jordan 4' },
    { re: /gel-nyc|gel nyc/, handle: 'gel-nyc', label: 'ASICS Gel-NYC' },
    { re: /gel-kayano-14|kayano-14|kayano 14/, handle: 'asics-gel-kayano-14', label: 'ASICS Gel-Kayano 14' },
    { re: /samba/, handle: 'adidas-samba', label: 'Adidas Samba' },
    { re: /dunk-low|dunk low/, handle: 'dunk-low', label: 'Nike Dunk Low' },
    { re: /air-force-1|air force 1|af1/, handle: 'air-force-1', label: 'Nike Air Force 1' },
    { re: /air max plus|air-max-plus| tn/, handle: 'nike-air-max-plus-tn', label: 'Nike TN' },
  ];
  for (const rule of silhouetteRules) {
    if (rule.re.test(hay) && linkMap.collections?.[rule.handle]) {
      push({ type: 'model', label: rule.label, url: linkMap.collections[rule.handle].url, handle: rule.handle });
    }
  }
  const vendor = (product.vendor || '').toLowerCase().trim();
  if (vendor && linkMap.vendors?.[vendor]) {
    const v = linkMap.vendors[vendor];
    push({ type: 'brand', label: v.title, url: v.url, handle: v.handle });
  }
  return links;
}

function buildPrompt(batch, linkMap) {
  return `You are a Swiss German ecommerce copywriter for Resell Lausanne (sneaker/streetwear resale).

Translate each product from French to natural Swiss German (Schweizerdeutsch). Rules:
- Use Swiss German conventions: "ss" instead of "ß" always. CHF for prices.
- Keep brand names, colorways, style codes, SKUs, dates, prices UNCHANGED.
- Remove any StockX / marketplace references.
- Output valid HTML: <p> paragraphs; specs as <p><strong>Label:</strong> Wert</p> (no space before colon, DE convention).
- Tone: professional, concise, not keyword-stuffed.
- Include specs at end if present with German labels:
    Coloris → Farbe, Colorway → Colorway, Style Code → Style-Code,
    Date de sortie → Erscheinungsdatum, Prix de détail → UVP,
    Marque → Marke, Modèle → Modell
- Translate the title to natural German (keep proper nouns like "Nike Air Force 1" as-is; translate descriptors).
- meta_title MAX 60 chars, meta_description MAX 155 chars, both keyword-rich for DE search (schweiz, authentisch, sneakers).

INTERNAL LINKS (required when suggestedLinks is non-empty):
- Use ONLY URLs from each product's suggestedLinks array
- Priority: collab > model > brand
- Max 4 links per product, first mention only
- Format: <a href="/collections/handle">Label</a>

Return ONLY valid JSON array (no markdown fence, no prose):
[{"id":"gid://shopify/Product/...","body_html":"<p>...</p>","title":"...","meta_title":"...","meta_description":"..."}]

Products:
${JSON.stringify(
  batch.map((p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    vendor: p.vendor,
    suggestedLinks: resolveProductLinks(p, linkMap),
    body_html_fr: p.descriptionHtml,
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
      body_html: `<p>[DRY RUN DE] ${p.title} — authentisch in der Schweiz bei Resell Lausanne.</p>`,
      title: `[DE] ${p.title}`,
      meta_title: `${p.title} kaufen Schweiz`.slice(0, 60),
      meta_description: `Authentische ${p.title} in der Schweiz bei Resell Lausanne. Geprüfte Echtheit, Gratisversand ab 50 CHF.`.slice(0, 155),
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

/**
 * Write DE translations for one product. Uses the product's translatable
 * digests fetched right before write (digests can rotate when the source
 * changes; fetching per-product avoids stale-digest errors).
 */
async function writeDeTranslations(productId, translated) {
  const resource = await fetchProductTranslatableContent(productId);
  if (!resource) throw new Error(`translatableResource missing for ${productId}`);
  const byKey = Object.fromEntries(resource.translatableContent.map((c) => [c.key, c]));
  const existing = new Set((resource.translations || []).map((t) => t.key));

  const inputs = [];
  const map = {
    body_html: translated.body_html,
    title: translated.title,
    // Meta-title / meta-description are stored on `global.title_tag` and
    // `global.description_tag` metafields under the product's translatable
    // resource — Shopify exposes them as separate translatable keys via
    // translatableContent (key names match namespace.key).
    'meta_title': translated.meta_title,
    'meta_description': translated.meta_description,
  };
  const legacyKeys = {
    meta_title: 'global.title_tag',
    meta_description: 'global.description_tag',
  };

  for (const field of FIELDS) {
    const value = map[field];
    if (!value) continue;
    // Try both direct key and legacy metafield key for meta_*
    const candidateKeys = [field, legacyKeys[field]].filter(Boolean);
    let chosen = null;
    for (const k of candidateKeys) {
      if (byKey[k]) {
        chosen = byKey[k];
        break;
      }
    }
    if (!chosen) continue;
    if (!FORCE && existing.has(chosen.key)) continue;
    inputs.push({
      locale: TARGET_LOCALE,
      key: chosen.key,
      value,
      translatableContentDigest: chosen.digest,
    });
  }

  if (inputs.length === 0) return { skipped: true, wrote: 0 };

  const m = `mutation($id:ID!,$t:[TranslationInput!]!){translationsRegister(resourceId:$id,translations:$t){translations{key locale} userErrors{message field}}}`;
  for (let a = 0; a < 8; a++) {
    try {
      const r = await gql(m, { id: productId, t: inputs });
      const errs = r.data?.translationsRegister?.userErrors;
      if (errs?.length) throw new Error(JSON.stringify(errs));
      return { wrote: inputs.length };
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
    console.log('[de] cache warm complete');
    return;
  }
  if (!SHOP || !TOKEN) {
    console.error('Missing Shopify env (SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_ACCESS_TOKEN)');
    process.exit(1);
  }
  if (!CURSOR_KEY && !DRY_RUN) {
    console.error('Missing CURSOR_API_KEY — get from Cursor Settings → API');
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
    `[de] shard=${SHARD}/${TOTAL_SHARDS} model=${MODEL} batch=${BATCH_SIZE} write=${WRITE_CONCURRENCY} fields=${FIELDS.join('+')} DRY_RUN=${DRY_RUN} FORCE=${FORCE}`,
  );

  let all = shardFilter(await fetchCandidates());
  all = all.filter((p) => !doneSet.has(p.id));
  if (OFFSET) all = all.slice(OFFSET);
  if (LIMIT) all = all.slice(0, LIMIT);

  console.log(`[de] candidates this run: ${all.length}`);

  if (!fs.existsSync(runLog)) {
    fs.writeFileSync(runLog, 'timestamp,product_id,handle,title,wrote_fields\n');
  }

  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = all.slice(i, i + BATCH_SIZE);
    console.log(`[de] batch ${i / BATCH_SIZE + 1}/${Math.ceil(all.length / BATCH_SIZE)} (${batch.length} products)`);
    let translations;
    try {
      translations = await translateBatch(batch, linkMap);
    } catch (e) {
      console.error(`[de] batch failed: ${e.message}`);
      await sleep(5000);
      continue;
    }
    const byId = Object.fromEntries(translations.map((t) => [t.id, t]));
    await mapPool(batch, WRITE_CONCURRENCY, async (p) => {
      const t = byId[p.id];
      if (!t) {
        console.warn(`[de] no translation for ${p.handle}`);
        return;
      }
      try {
        const r = await writeDeTranslations(p.id, t);
        if (!r?.skipped) {
          fs.appendFileSync(
            runLog,
            [new Date().toISOString(), p.id, p.handle, csv(p.title), r?.wrote ?? 0].join(',') + '\n',
          );
        }
        cp.doneIds.push(p.id);
      } catch (e) {
        console.error(`[de] write failed ${p.handle}: ${e.message}`);
      }
    });
    saveShardCheckpoint(cp);
  }
  console.log(`[de] done — checkpoint has ${cp.doneIds.length} products`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
