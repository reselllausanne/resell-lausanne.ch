#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * P0 validation script for the Resell Lausanne Shopify theme.
 *
 * Runs against a configurable base URL (default http://127.0.0.1:9292),
 * exercises a curated set of URLs, and validates SEO / SEA / CRO / trust
 * checks defined as P0 before publishing the theme live.
 *
 * Outputs:
 *   - console summary
 *   - audit-results/p0-validation.json
 *   - audit-results/p0-validation.md
 *
 * Does NOT modify any theme files.
 */

const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (err) {
  console.error('[validate:p0] playwright not installed. Run: npm install');
  console.error('[validate:p0] underlying error:', err.message);
  process.exit(2);
}

// ---------- config -------------------------------------------------------

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:9292').replace(/\/$/, '');
const OUT_DIR = path.resolve(__dirname, '..', 'audit-results');
const OUT_JSON = path.join(OUT_DIR, 'p0-validation.json');
const OUT_MD = path.join(OUT_DIR, 'p0-validation.md');

const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 30000);

const BAD_TEXT_PATTERNS = [
  'Resell_lausanne',
  'resell_lausanne',
  'Resell-lausanne',
  'Chronopost',
  'France métropolitaine',
  'France Métropolitaine',
  'DOM-TOM',
  '+33',
  '01 82 28 59 29',
  'Corse',
  '4,90€',
  '10,90€',
  '10€',
  'En France',
  'En Belgique',
  'WeTheNew',
  'Wethenew',
  '5 à 10 jours ouvrés',
  '5 à 10 jours ouvrables',
];

const FRANCE_BELGIUM_EURO_PHONE = [
  'France métropolitaine',
  'France Métropolitaine',
  'DOM-TOM',
  'En France',
  'En Belgique',
  '+33',
  '01 82 28 59 29',
  '€',
];

const UNRELATED_RECO_TERMS = [
  'Panini',
  'Pokémon',
  'Magic',
  'One Piece',
  'Topps',
  'box',
  'booster',
  'ETB',
];

const UNRELATED_FAQ_CATEGORIES = [
  'Authenticité',
  'Échanges et remboursements',
  'Prix et réductions',
  'Guide des tailles',
  'Options de paiement',
];

const HOMEPAGE_H1_KEYWORDS = [
  'sneakers',
  'streetwear',
  'collectibles',
  'authentic',
  'authentique',
  'authentiques',
  'switzerland',
  'suisse',
];

// ---------- result accumulator ------------------------------------------

const results = []; // [{ url, label, checks: [{ id, status, message, evidence? }] }]
const schemaEntities = []; // [{ url, type, name? }]
const badTextOccurrences = []; // [{ url, pattern, sample }]
const brokenLinks = []; // [{ url, href, reason }]
const pageSummaries = []; // [{ url, title, h1, robots }]

function makeReport(url, label) {
  const entry = { url, label, checks: [] };
  results.push(entry);
  return entry;
}

function record(entry, id, status, message, evidence) {
  entry.checks.push({ id, status, message, ...(evidence ? { evidence } : {}) });
}

// ---------- helpers ------------------------------------------------------

function abs(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return BASE_URL + (pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl);
}

function shortSample(html, pattern, around = 60) {
  const idx = html.indexOf(pattern);
  if (idx === -1) return null;
  const start = Math.max(0, idx - around);
  const end = Math.min(html.length, idx + pattern.length + around);
  return html.slice(start, end).replace(/\s+/g, ' ').trim();
}

function parseJsonLd($scripts) {
  const out = [];
  for (const raw of $scripts) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // ignore unparseable
    }
  }
  return out;
}

function collectTypesAndNames(jsonLdObjects) {
  const out = [];
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }
    if (obj['@type']) {
      const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
      for (const t of types) {
        out.push({ type: t, name: obj.name || obj.headline || null });
      }
    }
    if (obj['@graph']) walk(obj['@graph']);
  }
  jsonLdObjects.forEach(walk);
  return out;
}

// ---------- per-URL extraction (run in browser) -------------------------

async function extract(page) {
  return page.evaluate(() => {
    const titleEl = document.querySelector('title');
    const robotsEl = document.querySelector('meta[name="robots" i]');
    const h1s = Array.from(document.querySelectorAll('h1')).map((h) => ({
      text: (h.textContent || '').trim(),
      visible: !!(h.offsetParent || h.getClientRects().length),
    }));

    const announcementEl =
      document.querySelector('.announcement-bar, [class*="announcement-bar" i], [data-announcement-bar]') ||
      null;

    const recommendationsEl =
      document.querySelector(
        '[id*="recommendation" i], [class*="recommendation" i], [data-product-recommendations], .product-recommendations'
      ) || null;

    const paymentsSectionEl =
      document.querySelector('[class*="payment" i], [id*="payment" i]') || null;

    const anchors = Array.from(document.querySelectorAll('a')).map((a) => {
      const href = a.getAttribute('href');
      const text = (a.textContent || '').trim();
      const aria = a.getAttribute('aria-label');
      const title = a.getAttribute('title');
      return { href, text, aria, title };
    });

    const productCardAnchors = Array.from(
      document.querySelectorAll(
        'a[href*="/products/"], .product-card a, [class*="product-card"] a, [data-product-card] a'
      )
    ).map((a) => ({
      href: a.getAttribute('href'),
      text: (a.textContent || '').trim(),
      aria: a.getAttribute('aria-label'),
      hasImg: !!a.querySelector('img'),
      imgAlt: a.querySelector('img') ? a.querySelector('img').getAttribute('alt') : null,
    }));

    const jsonLdScripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    ).map((s) => s.textContent || '');

    const bodyText = document.body ? document.body.innerText : '';

    return {
      title: titleEl ? (titleEl.textContent || '').trim() : '',
      robots: robotsEl ? (robotsEl.getAttribute('content') || '').trim() : '',
      h1s,
      announcementText: announcementEl ? (announcementEl.innerText || '').trim() : '',
      recommendationsText: recommendationsEl ? (recommendationsEl.innerText || '').trim() : '',
      hasPaymentsSection: !!paymentsSectionEl,
      paymentsText: paymentsSectionEl ? (paymentsSectionEl.innerText || '').trim() : '',
      anchors,
      productCardAnchors,
      jsonLdScripts,
      bodyText,
    };
  });
}

// ---------- check implementations ---------------------------------------

function checkBadText(entry, url, html, data, options = {}) {
  const tolerateOuvrables = !!options.tolerateOuvrables;
  let anyBad = false;
  for (const pattern of BAD_TEXT_PATTERNS) {
    if (html.includes(pattern)) {
      // `5 à 10 jours ouvrables` is downgraded to WARN on livraison page
      // when it's listed as part of approved wording context. We still flag.
      const sample = shortSample(html, pattern);
      badTextOccurrences.push({ url, pattern, sample });
      if (pattern === '5 à 10 jours ouvrables' && tolerateOuvrables) {
        record(entry, `badtext:${pattern}`, 'WARN', `Bad text present: ${pattern}`, sample);
      } else {
        record(entry, `badtext:${pattern}`, 'FAIL', `Bad text present: ${pattern}`, sample);
        anyBad = true;
      }
    }
  }
  if (!anyBad) {
    record(entry, 'badtext:none', 'PASS', 'No P0 bad-text patterns rendered.');
  }
}

function checkJsonLd(entry, url, data) {
  const objs = parseJsonLd(data.jsonLdScripts);
  const flat = collectTypesAndNames(objs);
  const productEntities = flat.filter((x) => x.type === 'Product');

  flat.forEach((x) => schemaEntities.push({ url, type: x.type, name: x.name }));

  record(
    entry,
    'jsonld:types',
    'PASS',
    `Found JSON-LD @types: ${flat.map((x) => x.type).join(', ') || '(none)'}`
  );

  if (productEntities.length > 1) {
    record(
      entry,
      'jsonld:product-duplicate',
      'FAIL',
      `Multiple Product JSON-LD entities (${productEntities.length}).`
    );
  } else {
    record(entry, 'jsonld:product-duplicate', 'PASS', 'Single or no Product JSON-LD entity.');
  }

  const badNamed = flat.filter(
    (x) =>
      (x.type === 'Organization' || x.type === 'WebSite') &&
      x.name &&
      /resell[_-]lausanne/i.test(x.name)
  );
  if (badNamed.length) {
    record(
      entry,
      'jsonld:org-name',
      'FAIL',
      `Organization/WebSite name contains Resell_lausanne: ${badNamed
        .map((x) => `${x.type}=${x.name}`)
        .join('; ')}`
    );
  } else {
    record(entry, 'jsonld:org-name', 'PASS', 'Organization/WebSite names look clean.');
  }
}

function checkLinks(entry, url, data) {
  let broken = 0;
  let faqCategoryLinks = 0;
  for (const a of data.anchors) {
    if (a.href === null || a.href === undefined) {
      broken++;
      brokenLinks.push({ url, href: '(missing)', reason: 'missing href attribute' });
      continue;
    }
    const trimmed = (a.href || '').trim();
    if (trimmed === '' || trimmed === '#' || trimmed.startsWith('javascript:')) {
      broken++;
      brokenLinks.push({ url, href: a.href, reason: 'empty / # / javascript:' });
    }
    if (trimmed.includes('/pages/faq?category=')) {
      faqCategoryLinks++;
    }
  }
  if (broken === 0) {
    record(entry, 'links:broken', 'PASS', 'No empty/#/javascript: anchors.');
  } else {
    record(entry, 'links:broken', 'WARN', `${broken} suspicious anchors. See brokenLinks.`);
  }
  if (faqCategoryLinks > 0) {
    record(
      entry,
      'links:faq-category',
      'WARN',
      `${faqCategoryLinks} link(s) to /pages/faq?category= — ensure target page emits noindex.`
    );
  }
}

function checkHomepage(entry, data) {
  const h1Count = data.h1s.length;
  if (h1Count === 1) {
    record(entry, 'home:h1-count', 'PASS', 'Exactly one H1.');
  } else {
    record(entry, 'home:h1-count', 'FAIL', `Expected 1 H1, found ${h1Count}.`);
  }
  const h1Text = (data.h1s[0]?.text || '').toLowerCase();
  const matched = HOMEPAGE_H1_KEYWORDS.some((k) => h1Text.includes(k.toLowerCase()));
  if (matched) {
    record(entry, 'home:h1-content', 'PASS', `H1 contains expected keyword: "${data.h1s[0]?.text || ''}"`);
  } else {
    record(
      entry,
      'home:h1-content',
      'FAIL',
      `H1 missing required keywords: "${data.h1s[0]?.text || '(empty)'}"`
    );
  }
  if (data.title && /resell[_-]lausanne/i.test(data.title)) {
    record(entry, 'home:title-clean', 'FAIL', `Title contains Resell_lausanne: ${data.title}`);
  } else {
    record(entry, 'home:title-clean', 'PASS', `Title clean: ${data.title}`);
  }
  if (data.announcementText && data.announcementText.includes('€')) {
    record(
      entry,
      'home:announcement-no-euro',
      'FAIL',
      `Announcement bar contains €: "${data.announcementText.slice(0, 200)}"`
    );
  } else {
    record(entry, 'home:announcement-no-euro', 'PASS', 'Announcement bar contains no €.');
  }
}

function checkProduct(entry, data, html) {
  const h1Count = data.h1s.length;
  if (h1Count === 1) {
    record(entry, 'pdp:h1-count', 'PASS', 'Exactly one H1.');
  } else {
    record(entry, 'pdp:h1-count', 'FAIL', `Expected 1 H1, found ${h1Count}.`);
  }
  const h1Text = data.h1s[0]?.text || '';
  const titleHead = (data.title || '').split(/[|–-]/)[0].trim();
  if (h1Text && titleHead && (h1Text.includes(titleHead) || titleHead.includes(h1Text))) {
    record(entry, 'pdp:h1-matches-title', 'PASS', `H1 matches product title: "${h1Text}"`);
  } else {
    record(
      entry,
      'pdp:h1-matches-title',
      'WARN',
      `H1 "${h1Text}" does not obviously match title head "${titleHead}"`
    );
  }

  const objs = parseJsonLd(data.jsonLdScripts);
  const productEntities = collectTypesAndNames(objs).filter((x) => x.type === 'Product');
  if (productEntities.length === 1) {
    record(entry, 'pdp:single-product-schema', 'PASS', 'Exactly one Product schema entity.');
  } else {
    record(
      entry,
      'pdp:single-product-schema',
      'FAIL',
      `Found ${productEntities.length} Product schema entities.`
    );
  }

  // Duplicate brand in title (e.g. "Nike Nike Air Max ...")
  if (data.title) {
    const words = data.title.split(/\s+/).filter(Boolean);
    let dupBrand = false;
    if (words.length >= 2 && words[0] && words[0] === words[1]) {
      dupBrand = true;
    }
    if (dupBrand) {
      record(entry, 'pdp:title-no-dup-brand', 'FAIL', `Duplicate brand in title: ${data.title}`);
    } else {
      record(entry, 'pdp:title-no-dup-brand', 'PASS', `Title brand looks clean: ${data.title}`);
    }
  }

  // Delivery wording
  if (data.bodyText.includes('2 à 8 jours ouvrables')) {
    record(entry, 'pdp:delivery-wording', 'PASS', 'Delivery wording "2 à 8 jours ouvrables" present.');
  } else {
    record(
      entry,
      'pdp:delivery-wording',
      'WARN',
      'Did not find "2 à 8 jours ouvrables" in PDP body. Verify delivery copy.'
    );
  }

  // Recommendations content
  if (data.recommendationsText) {
    const hits = UNRELATED_RECO_TERMS.filter((t) =>
      new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
        data.recommendationsText
      )
    );
    if (hits.length === 0) {
      record(entry, 'pdp:reco-relevant', 'PASS', 'No collectible terms in recommendations.');
    } else {
      record(
        entry,
        'pdp:reco-relevant',
        'FAIL',
        `Recommendations contain unrelated collectible terms: ${hits.join(', ')}`
      );
    }
  } else {
    record(entry, 'pdp:reco-relevant', 'WARN', 'No recommendations section detected.');
  }
}

function checkFaq(entry, url, data, isCategory) {
  const hasFaqH1 = data.h1s.some((h) => /faq/i.test(h.text));
  if (hasFaqH1) {
    record(entry, 'faq:h1', 'PASS', 'H1 contains FAQ.');
  } else {
    record(entry, 'faq:h1', 'FAIL', `H1 missing FAQ: ${data.h1s.map((h) => h.text).join(' | ')}`);
  }
  const fbHits = FRANCE_BELGIUM_EURO_PHONE.filter((p) => data.bodyText.includes(p));
  if (fbHits.length === 0) {
    record(entry, 'faq:no-fr-be-euro-phone', 'PASS', 'No France/Belgium/euro/phone content.');
  } else {
    record(
      entry,
      'faq:no-fr-be-euro-phone',
      'FAIL',
      `France/Belgium/euro/phone content present: ${fbHits.join(', ')}`
    );
  }
  if (data.hasPaymentsSection) {
    const swiss =
      /TWINT|Postfinance|CHF|Suisse/i.test(data.paymentsText) ||
      /TWINT|Postfinance|CHF|Suisse/i.test(data.bodyText);
    if (swiss) {
      record(entry, 'faq:swiss-payment', 'PASS', 'Swiss payment wording present.');
    } else {
      record(
        entry,
        'faq:swiss-payment',
        'WARN',
        'Payment section detected but no Swiss-specific wording (TWINT/Postfinance/CHF/Suisse).'
      );
    }
  }
  if (isCategory) {
    if (/noindex/i.test(data.robots) && /follow/i.test(data.robots)) {
      record(entry, 'faq:category-noindex', 'PASS', `robots="${data.robots}"`);
    } else {
      record(
        entry,
        'faq:category-noindex',
        'FAIL',
        `Expected robots noindex,follow; got "${data.robots || '(none)'}"`
      );
    }
  }
}

function checkLivraison(entry, data) {
  const livraisonH1 = data.h1s.find((h) => /livraison/i.test(h.text) && /délais/i.test(h.text));
  if (livraisonH1) {
    record(entry, 'livraison:h1', 'PASS', `H1 OK: "${livraisonH1.text}"`);
  } else {
    record(
      entry,
      'livraison:h1',
      'FAIL',
      `H1 must contain "Livraison & délais"; got: ${data.h1s.map((h) => h.text).join(' | ')}`
    );
  }
  if (data.bodyText.includes('2 à 8 jours ouvrables')) {
    record(entry, 'livraison:wording', 'PASS', '"2 à 8 jours ouvrables" present.');
  } else {
    record(entry, 'livraison:wording', 'FAIL', '"2 à 8 jours ouvrables" missing.');
  }
  if (/La Poste Suisse|DHL|FedEx/.test(data.bodyText)) {
    record(entry, 'livraison:carriers', 'PASS', 'Mentions La Poste Suisse / DHL / FedEx.');
  } else {
    record(entry, 'livraison:carriers', 'FAIL', 'No mention of La Poste Suisse, DHL or FedEx.');
  }
  const fbHits = FRANCE_BELGIUM_EURO_PHONE.filter((p) => data.bodyText.includes(p));
  if (fbHits.length === 0) {
    record(entry, 'livraison:no-fr-be-euro-phone', 'PASS', 'No France/Belgium/euro/phone content.');
  } else {
    record(
      entry,
      'livraison:no-fr-be-euro-phone',
      'FAIL',
      `France/Belgium/euro/phone content: ${fbHits.join(', ')}`
    );
  }

  // Unrelated FAQ categories: only OK if confined to bottom related-links area.
  const main = data.bodyText;
  const presentCats = UNRELATED_FAQ_CATEGORIES.filter((c) => main.includes(c));
  if (presentCats.length === 0) {
    record(entry, 'livraison:no-unrelated-faq-cats', 'PASS', 'No unrelated FAQ categories rendered.');
  } else {
    record(
      entry,
      'livraison:no-unrelated-faq-cats',
      'WARN',
      `Unrelated FAQ categories present (verify they only appear in bottom related-links): ${presentCats.join(
        ', '
      )}`
    );
  }
}

function checkCollectionNoindex(entry, data) {
  if (/noindex/i.test(data.robots) && /follow/i.test(data.robots)) {
    record(entry, 'col:noindex-follow', 'PASS', `robots="${data.robots}"`);
  } else {
    record(
      entry,
      'col:noindex-follow',
      'FAIL',
      `Expected robots noindex,follow; got "${data.robots || '(none)'}"`
    );
  }
}

function checkCollectionFrench(entry, data) {
  const required = ['Accueil'];
  const optional = ['Liens associés', 'Questions fréquentes'];
  const missingRequired = required.filter((s) => !data.bodyText.includes(s));
  if (missingRequired.length === 0) {
    record(entry, 'col:french-required', 'PASS', `Found: ${required.join(', ')}`);
  } else {
    record(entry, 'col:french-required', 'FAIL', `Missing required FR strings: ${missingRequired.join(', ')}`);
  }
  const presentOptional = optional.filter((s) => data.bodyText.includes(s));
  record(
    entry,
    'col:french-optional',
    'PASS',
    `Optional FR strings present: ${presentOptional.join(', ') || '(none)'}`
  );
}

function checkProductCardAccessibility(entry, data) {
  const cards = data.productCardAnchors.filter((a) => a.href && a.href.includes('/products/'));
  if (cards.length === 0) {
    record(entry, 'col:card-a11y', 'WARN', 'No product card anchors detected.');
    return;
  }
  const bad = cards.filter((c) => {
    const hasText = c.text && c.text.length > 0;
    const hasAria = c.aria && c.aria.length > 0;
    return !hasText && !hasAria;
  });
  if (bad.length === 0) {
    record(entry, 'col:card-a11y', 'PASS', `${cards.length} product card anchors all have names.`);
  } else {
    record(
      entry,
      'col:card-a11y',
      'FAIL',
      `${bad.length}/${cards.length} product card anchors lack accessible names.`
    );
  }
}

// ---------- runner -------------------------------------------------------

async function fetchPage(browser, url, label) {
  const ctx = await browser.newContext({ userAgent: 'ResellLausanneP0Validator/1.0' });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err && err.message ? err.message : err)));
  let html = '';
  let data = null;
  let error = null;
  let status = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    status = resp ? resp.status() : null;
    await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT_MS }).catch(() => {});
    html = await page.content();
    data = await extract(page);
  } catch (err) {
    error = err && err.message ? err.message : String(err);
  } finally {
    await ctx.close();
  }
  return { url, label, html, data, error, status, consoleErrors };
}

async function autoDetectProductAndCollection(homeData) {
  let productUrl = null;
  let collectionUrl = null;
  if (homeData && Array.isArray(homeData.anchors)) {
    for (const a of homeData.anchors) {
      const href = a.href || '';
      if (!productUrl && href.includes('/products/')) productUrl = href.split('?')[0];
      if (
        !collectionUrl &&
        href.includes('/collections/') &&
        !href.includes('/collections/all')
      ) {
        collectionUrl = href.split('?')[0];
      }
      if (productUrl && collectionUrl) break;
    }
  }
  return { productUrl, collectionUrl };
}

(async function main() {
  console.log(`[validate:p0] Base URL: ${BASE_URL}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let fatalError = null;
  try {
    // First fetch homepage to allow auto-detection.
    const homepageFetch = await fetchPage(browser, abs('/'), 'home');
    if (homepageFetch.error) {
      console.error(`[validate:p0] Homepage fetch failed: ${homepageFetch.error}`);
    }

    const { productUrl, collectionUrl } = homepageFetch.data
      ? await autoDetectProductAndCollection(homepageFetch.data)
      : { productUrl: null, collectionUrl: null };

    const queue = [
      { url: abs('/'), label: 'home', prefetched: homepageFetch },
      { url: abs('/collections/all'), label: 'collection-all' },
      { url: abs('/collections/all?page=2'), label: 'collection-all-page2' },
      { url: abs('/pages/faq'), label: 'faq' },
      { url: abs('/pages/faq?category=livraison'), label: 'faq-livraison' },
      { url: abs('/pages/livraison'), label: 'livraison' },
    ];
    if (productUrl) queue.push({ url: abs(productUrl), label: 'product' });
    else console.warn('[validate:p0] No product URL auto-detected.');
    if (collectionUrl) queue.push({ url: abs(collectionUrl), label: 'collection' });
    else console.warn('[validate:p0] No secondary collection auto-detected.');

    for (const item of queue) {
      console.log(`[validate:p0] -> ${item.label} ${item.url}`);
      const fetched = item.prefetched || (await fetchPage(browser, item.url, item.label));
      const entry = makeReport(item.url, item.label);

      if (fetched.error || !fetched.data) {
        record(entry, 'fetch', 'FAIL', `Fetch failed: ${fetched.error || 'no data'}`);
        continue;
      }

      record(entry, 'fetch', 'PASS', `HTTP ${fetched.status || '?'}`);
      pageSummaries.push({
        url: item.url,
        label: item.label,
        title: fetched.data.title,
        h1: fetched.data.h1s.map((h) => h.text).join(' | '),
        robots: fetched.data.robots,
      });

      // Global bad-text + JSON-LD + links
      checkBadText(entry, item.url, fetched.html, fetched.data, {
        tolerateOuvrables: item.label === 'livraison',
      });
      checkJsonLd(entry, item.url, fetched.data);
      checkLinks(entry, item.url, fetched.data);

      // Per-type checks
      switch (item.label) {
        case 'home':
          checkHomepage(entry, fetched.data);
          break;
        case 'product':
          checkProduct(entry, fetched.data, fetched.html);
          break;
        case 'faq':
          checkFaq(entry, item.url, fetched.data, false);
          break;
        case 'faq-livraison':
          checkFaq(entry, item.url, fetched.data, true);
          break;
        case 'livraison':
          checkLivraison(entry, fetched.data);
          break;
        case 'collection-all':
        case 'collection-all-page2':
          checkCollectionNoindex(entry, fetched.data);
          checkCollectionFrench(entry, fetched.data);
          checkProductCardAccessibility(entry, fetched.data);
          break;
        case 'collection':
          checkCollectionFrench(entry, fetched.data);
          checkProductCardAccessibility(entry, fetched.data);
          break;
      }
    }
  } catch (err) {
    fatalError = err && err.stack ? err.stack : String(err);
    console.error('[validate:p0] Fatal error:', fatalError);
  } finally {
    await browser.close();
  }

  // ---------- summary ----------------------------------------------------

  const summary = { pass: 0, fail: 0, warn: 0 };
  for (const r of results) {
    for (const c of r.checks) {
      if (c.status === 'PASS') summary.pass++;
      else if (c.status === 'FAIL') summary.fail++;
      else if (c.status === 'WARN') summary.warn++;
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    summary,
    fatalError,
    results,
    schemas: schemaEntities,
    badTextOccurrences,
    brokenLinks,
    pageSummaries,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(report), 'utf8');

  // Console summary
  console.log('');
  console.log('================ P0 VALIDATION SUMMARY ================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`PASS: ${summary.pass}  FAIL: ${summary.fail}  WARN: ${summary.warn}`);
  console.log(`JSON: ${OUT_JSON}`);
  console.log(`MD  : ${OUT_MD}`);
  console.log('=======================================================');
  for (const r of results) {
    const fails = r.checks.filter((c) => c.status === 'FAIL');
    const warns = r.checks.filter((c) => c.status === 'WARN');
    if (fails.length === 0 && warns.length === 0) continue;
    console.log(`\n[${r.label}] ${r.url}`);
    fails.forEach((c) => console.log(`  FAIL  ${c.id}: ${c.message}`));
    warns.forEach((c) => console.log(`  WARN  ${c.id}: ${c.message}`));
  }

  process.exit(summary.fail > 0 || fatalError ? 1 : 0);
})();

// ---------- markdown renderer -------------------------------------------

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# P0 Validation Report`);
  lines.push('');
  lines.push(`- **Timestamp:** ${report.timestamp}`);
  lines.push(`- **Base URL:** ${report.baseUrl}`);
  lines.push(
    `- **Result:** ${report.summary.fail === 0 && !report.fatalError ? 'PASS' : 'FAIL'} — pass ${report.summary.pass} / fail ${report.summary.fail} / warn ${report.summary.warn}`
  );
  if (report.fatalError) {
    lines.push('');
    lines.push('> Fatal error during run:');
    lines.push('```');
    lines.push(report.fatalError);
    lines.push('```');
  }

  // 1. pass/fail summary
  lines.push('');
  lines.push('## 1. Pass / Fail Summary');
  lines.push('');
  lines.push('| URL | Label | PASS | FAIL | WARN |');
  lines.push('|---|---|---:|---:|---:|');
  for (const r of report.results) {
    const p = r.checks.filter((c) => c.status === 'PASS').length;
    const f = r.checks.filter((c) => c.status === 'FAIL').length;
    const w = r.checks.filter((c) => c.status === 'WARN').length;
    lines.push(`| ${r.url} | ${r.label} | ${p} | ${f} | ${w} |`);
  }

  // 2. failed checks
  lines.push('');
  lines.push('## 2. Failed Checks');
  let anyFail = false;
  for (const r of report.results) {
    const fails = r.checks.filter((c) => c.status === 'FAIL');
    if (!fails.length) continue;
    anyFail = true;
    lines.push('');
    lines.push(`### ${r.label} — ${r.url}`);
    for (const c of fails) {
      lines.push(`- **${c.id}** — ${c.message}`);
      if (c.evidence) lines.push(`  - evidence: \`${String(c.evidence).slice(0, 240)}\``);
    }
  }
  if (!anyFail) lines.push('\n_None._');

  // 3. warnings
  lines.push('');
  lines.push('## 3. Warnings');
  let anyWarn = false;
  for (const r of report.results) {
    const warns = r.checks.filter((c) => c.status === 'WARN');
    if (!warns.length) continue;
    anyWarn = true;
    lines.push('');
    lines.push(`### ${r.label} — ${r.url}`);
    for (const c of warns) {
      lines.push(`- **${c.id}** — ${c.message}`);
      if (c.evidence) lines.push(`  - evidence: \`${String(c.evidence).slice(0, 240)}\``);
    }
  }
  if (!anyWarn) lines.push('\n_None._');

  // 4. tested URLs
  lines.push('');
  lines.push('## 4. Tested URLs');
  for (const r of report.results) {
    lines.push(`- \`${r.label}\` ${r.url}`);
  }

  // 5. schema entities
  lines.push('');
  lines.push('## 5. Schema Entities');
  if (!report.schemas.length) {
    lines.push('_No JSON-LD entities found._');
  } else {
    lines.push('');
    lines.push('| URL | @type | name |');
    lines.push('|---|---|---|');
    for (const s of report.schemas) {
      lines.push(`| ${s.url} | ${s.type} | ${s.name || ''} |`);
    }
  }

  // 6. H1 / title / meta
  lines.push('');
  lines.push('## 6. H1 / Title / Robots Meta');
  lines.push('');
  lines.push('| URL | title | H1 | robots |');
  lines.push('|---|---|---|---|');
  for (const p of report.pageSummaries) {
    lines.push(
      `| ${p.url} | ${(p.title || '').replace(/\|/g, '\\|')} | ${(p.h1 || '').replace(/\|/g, '\\|')} | ${p.robots || ''} |`
    );
  }

  // 7. bad text occurrences
  lines.push('');
  lines.push('## 7. Bad Text Occurrences');
  if (!report.badTextOccurrences.length) {
    lines.push('_None._');
  } else {
    lines.push('');
    lines.push('| URL | pattern | sample |');
    lines.push('|---|---|---|');
    for (const b of report.badTextOccurrences) {
      lines.push(
        `| ${b.url} | \`${b.pattern}\` | ${(b.sample || '').replace(/\|/g, '\\|').slice(0, 200)} |`
      );
    }
  }

  // 8. next recommended fixes
  lines.push('');
  lines.push('## 8. Next Recommended Fixes');
  const fixes = [];
  if (report.fatalError) {
    fixes.push('Resolve fatal runtime error before re-running validation.');
  }
  if (report.summary.fail === 0 && !report.fatalError) {
    fixes.push('All P0 checks passed. Recommended next steps:');
    fixes.push('- Address WARN items if they reflect real copy/UX issues.');
    fixes.push('- Run a Lighthouse / CWV audit on `/` and one PDP.');
    fixes.push('- Verify hreflang / canonical / sitemap.xml after publish.');
  } else {
    if (report.badTextOccurrences.length) {
      const uniqPatterns = Array.from(new Set(report.badTextOccurrences.map((b) => b.pattern)));
      fixes.push(
        `Replace lingering FR/wethenew/euro strings: ${uniqPatterns.join(', ')}.`
      );
    }
    const failIds = new Set();
    for (const r of report.results) for (const c of r.checks) if (c.status === 'FAIL') failIds.add(c.id);
    if (failIds.has('home:announcement-no-euro'))
      fixes.push('Remove € from announcement bar (use CHF).');
    if (failIds.has('home:h1-count') || failIds.has('home:h1-content'))
      fixes.push('Restore single H1 on homepage with sneakers / streetwear / Suisse keyword.');
    if (failIds.has('pdp:single-product-schema') || failIds.has('jsonld:product-duplicate'))
      fixes.push('Deduplicate Product JSON-LD on PDP (remove standalone Brand/Product blocks).');
    if (failIds.has('pdp:delivery-wording'))
      fixes.push('PDP delivery copy: use "2 à 8 jours ouvrables".');
    if (failIds.has('faq:category-noindex') || failIds.has('col:noindex-follow'))
      fixes.push('Emit `<meta name="robots" content="noindex,follow">` on /collections/all and /pages/faq?category=*.');
    if (failIds.has('livraison:h1'))
      fixes.push('Livraison page must have H1 "Livraison & délais".');
    if (failIds.has('livraison:carriers'))
      fixes.push('Mention Swiss carriers (La Poste Suisse / DHL / FedEx) on livraison page.');
    if (failIds.has('pdp:reco-relevant'))
      fixes.push('Filter PDP recommendations to remove collectibles (Panini/Pokémon/etc.) on sneaker PDPs.');
    if (!fixes.length) fixes.push('Review individual FAIL items above and patch theme accordingly.');
  }
  for (const f of fixes) lines.push(`- ${f}`);

  lines.push('');
  return lines.join('\n');
}
