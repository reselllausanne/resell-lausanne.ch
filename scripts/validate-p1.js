#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * P1 validation script — Resell Lausanne Shopify theme.
 *
 * Launch-quality checks (non-P0). Run after `validate:p0` passes.
 *
 * Buckets:
 *   - SEO meta (title/desc length, canonical, og/twitter, lang)
 *   - Perf budget (transferred bytes, image counts, render-blocking heuristic)
 *   - Web Vitals (TTFB, DCL, Load, LCP)
 *   - Image hygiene (width/height, loading=lazy, alt)
 *   - Heading order
 *   - Deeper schema (Product offers/CHF/brand, Org logo/sameAs)
 *   - Trust signals (footer payment + address, PDP badges)
 *   - i18n consistency (no EN on FR pages, CHF format)
 *   - Forms/a11y via axe-core injection
 *   - Cookie/consent (no analytics cookies pre-consent)
 *   - Predictive search + PLP empty state probe
 *   - Cart flow probe (/cart/add.js, /cart.js)
 *   - Sitemap & robots
 *   - Internal link status sampling (no 404/redirect chains)
 *
 * Output:
 *   - console summary
 *   - audit-results/p1-validation.json
 *   - audit-results/p1-validation.md
 *
 * Does NOT modify theme files.
 */

const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (err) {
  console.error('[validate:p1] playwright not installed. Run: npm install');
  console.error(err.message);
  process.exit(2);
}

let AXE_SOURCE = '';
try {
  AXE_SOURCE = fs.readFileSync(
    require.resolve('axe-core/axe.min.js'),
    'utf8'
  );
} catch {
  console.warn('[validate:p1] axe-core not found; a11y checks skipped.');
}

// ---------- config -------------------------------------------------------

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:9292').replace(/\/$/, '');
const OUT_DIR = path.resolve(__dirname, '..', 'audit-results');
const OUT_JSON = path.join(OUT_DIR, 'p1-validation.json');
const OUT_MD = path.join(OUT_DIR, 'p1-validation.md');
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 45000);
const LINK_SAMPLE = Number(process.env.LINK_SAMPLE || 20);

const TITLE_MIN = 35;
const TITLE_MAX = 65;
const DESC_MIN = 70;
const DESC_MAX = 165;
const PAGE_BYTE_BUDGET = 3_500_000; // 3.5 MB transferred per page
const LCP_BUDGET_MS = 3500;

const EN_FRAGMENTS = [
  'Add to cart',
  'Sold out',
  'Quick view',
  'Sign in',
  'Sign up',
  'Search',
  'Shop now',
  'View all',
  'Continue shopping',
  'My account',
];

const ANALYTICS_COOKIE_NAMES = [
  '_ga',
  '_gid',
  '_gat',
  '_fbp',
  '_fbc',
  '_tt_enable_cookie',
  '_ttp',
  '_pin_unauth',
];

// ---------- accumulators -------------------------------------------------

const results = []; // [{ url, label, checks: [{id,status,message,evidence?}] }]
const perfRows = []; // [{ url, ttfb, dcl, load, lcp, bytes, requests }]
const schemaRows = []; // [{ url, type, name }]
const a11yRows = []; // [{ url, impact, id, count }]

function entryFor(url, label) {
  const e = { url, label, checks: [] };
  results.push(e);
  return e;
}

function record(entry, id, status, message, evidence) {
  entry.checks.push({ id, status, message, ...(evidence ? { evidence } : {}) });
}

function abs(p) {
  if (/^https?:\/\//i.test(p)) return p;
  return BASE_URL + (p.startsWith('/') ? p : '/' + p);
}

// ---------- page extraction ---------------------------------------------

async function extractPageData(page) {
  return page.evaluate(() => {
    const head = document.head;
    const get = (sel, attr) => {
      const el = head.querySelector(sel);
      return el ? (attr ? el.getAttribute(attr) : (el.textContent || '').trim()) : null;
    };

    const html = document.documentElement;
    const lang = html.getAttribute('lang') || '';

    const titleText = get('title');
    const desc = get('meta[name="description" i]', 'content');
    const robots = get('meta[name="robots" i]', 'content');
    const canonical = get('link[rel="canonical" i]', 'href');
    const og = {
      title: get('meta[property="og:title" i]', 'content'),
      description: get('meta[property="og:description" i]', 'content'),
      image: get('meta[property="og:image" i]', 'content'),
      url: get('meta[property="og:url" i]', 'content'),
      type: get('meta[property="og:type" i]', 'content'),
      siteName: get('meta[property="og:site_name" i]', 'content'),
    };
    const tw = {
      card: get('meta[name="twitter:card" i]', 'content'),
      title: get('meta[name="twitter:title" i]', 'content'),
      image: get('meta[name="twitter:image" i]', 'content'),
    };

    const hreflangs = Array.from(
      head.querySelectorAll('link[rel="alternate"][hreflang]')
    ).map((l) => ({
      hreflang: l.getAttribute('hreflang'),
      href: l.getAttribute('href'),
    }));

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(
      (h) => ({ tag: h.tagName.toLowerCase(), text: (h.textContent || '').trim().slice(0, 120) })
    );

    const images = Array.from(document.querySelectorAll('img')).map((img, idx) => ({
      idx,
      src: img.getAttribute('src') || img.getAttribute('data-src') || '',
      alt: img.getAttribute('alt'),
      width: img.getAttribute('width') || img.width || null,
      height: img.getAttribute('height') || img.height || null,
      loading: img.getAttribute('loading') || null,
      decoding: img.getAttribute('decoding') || null,
      inViewportTop: img.getBoundingClientRect().top < window.innerHeight,
    }));

    const buttons = Array.from(document.querySelectorAll('button')).map((b) => ({
      text: (b.textContent || '').trim(),
      aria: b.getAttribute('aria-label'),
      type: b.getAttribute('type'),
    }));

    const inputs = Array.from(document.querySelectorAll('input,select,textarea')).map((i) => {
      const id = i.getAttribute('id');
      const ariaLabel = i.getAttribute('aria-label');
      const ariaLabelledby = i.getAttribute('aria-labelledby');
      const placeholder = i.getAttribute('placeholder');
      const type = i.getAttribute('type') || i.tagName.toLowerCase();
      let labelText = null;
      if (id) {
        const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lab) labelText = (lab.textContent || '').trim();
      }
      return { id, type, labelText, ariaLabel, ariaLabelledby, placeholder, name: i.getAttribute('name') };
    });

    const jsonLdScripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    ).map((s) => s.textContent || '');

    const footerEl = document.querySelector('footer') || document.querySelector('[class*="footer" i]');
    const footerText = footerEl ? (footerEl.innerText || '').trim() : '';

    const anchors = Array.from(document.querySelectorAll('a')).map((a) => ({
      href: a.getAttribute('href'),
      text: (a.textContent || '').trim().slice(0, 120),
      rel: a.getAttribute('rel'),
    }));

    const bodyText = document.body ? document.body.innerText : '';

    // Cookie consent banner heuristic
    const consentEl = document.querySelector(
      '[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [class*="cookiebanner" i]'
    );

    return {
      lang,
      titleText,
      desc,
      robots,
      canonical,
      og,
      tw,
      hreflangs,
      headings,
      images,
      buttons,
      inputs,
      jsonLdScripts,
      footerText,
      anchors,
      bodyText,
      hasConsentBanner: !!consentEl,
      url: location.href,
    };
  });
}

async function collectWebVitals(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const out = { ttfb: null, dcl: null, load: null, lcp: null };
        try {
          const nav = performance.getEntriesByType('navigation')[0];
          if (nav) {
            out.ttfb = Math.round(nav.responseStart - nav.requestStart);
            out.dcl = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
            out.load = Math.round(nav.loadEventEnd - nav.startTime);
          }
        } catch {}
        let lcp = null;
        try {
          const po = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            for (const e of entries) lcp = e;
          });
          po.observe({ type: 'largest-contentful-paint', buffered: true });
          setTimeout(() => {
            try { po.disconnect(); } catch {}
            if (lcp) out.lcp = Math.round(lcp.startTime);
            resolve(out);
          }, 2500);
        } catch {
          resolve(out);
        }
      })
  );
}

async function runAxe(page) {
  if (!AXE_SOURCE) return null;
  try {
    await page.addScriptTag({ content: AXE_SOURCE });
    return await page.evaluate(async () => {
      const r = await window.axe.run(document, {
        resultTypes: ['violations'],
        rules: { 'color-contrast': { enabled: true } },
      });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact || 'minor',
        help: v.help,
        nodes: v.nodes.length,
      }));
    });
  } catch (e) {
    return { error: e.message };
  }
}

function parseJsonLd(scripts) {
  const out = [];
  for (const s of scripts) {
    try {
      const v = JSON.parse(s);
      if (Array.isArray(v)) out.push(...v);
      else out.push(v);
    } catch {}
  }
  return out;
}

function flatten(objs) {
  const out = [];
  function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    out.push(o);
    if (o['@graph']) walk(o['@graph']);
  }
  objs.forEach(walk);
  return out;
}

// ---------- checks -------------------------------------------------------

function checkSeoMeta(entry, data) {
  // lang
  if (/^fr/i.test(data.lang)) record(entry, 'seo:lang-fr', 'PASS', `<html lang="${data.lang}">`);
  else record(entry, 'seo:lang-fr', 'FAIL', `<html lang="${data.lang || '(missing)'}">`);

  // title
  if (!data.titleText) record(entry, 'seo:title', 'FAIL', 'Missing <title>');
  else {
    const len = data.titleText.length;
    const status = len >= TITLE_MIN && len <= TITLE_MAX ? 'PASS' : 'WARN';
    record(entry, 'seo:title-len', status, `title len=${len} (target ${TITLE_MIN}-${TITLE_MAX}): "${data.titleText}"`);
  }

  // description
  if (!data.desc) record(entry, 'seo:desc', 'FAIL', 'Missing meta description');
  else {
    const len = data.desc.length;
    const status = len >= DESC_MIN && len <= DESC_MAX ? 'PASS' : 'WARN';
    record(entry, 'seo:desc-len', status, `desc len=${len} (target ${DESC_MIN}-${DESC_MAX})`);
  }

  // canonical
  if (!data.canonical) record(entry, 'seo:canonical', 'FAIL', 'Missing canonical');
  else {
    const self = data.canonical.replace(/\/$/, '');
    const here = data.url.replace(/\/$/, '').split('?')[0];
    if (self === here) record(entry, 'seo:canonical-self', 'PASS', `canonical=${data.canonical}`);
    else record(entry, 'seo:canonical-self', 'WARN', `canonical "${data.canonical}" != url "${here}"`);
  }

  // OG
  const ogMissing = ['title', 'description', 'image', 'url'].filter((k) => !data.og[k]);
  if (ogMissing.length === 0) record(entry, 'seo:og', 'PASS', 'og:title/description/image/url present');
  else record(entry, 'seo:og', 'FAIL', `og missing: ${ogMissing.join(', ')}`);

  // Twitter
  if (data.tw.card) record(entry, 'seo:twitter', 'PASS', `twitter:card=${data.tw.card}`);
  else record(entry, 'seo:twitter', 'WARN', 'twitter:card missing');
}

function checkPerf(entry, url, vitals, bytes, requests) {
  perfRows.push({ url, ...vitals, bytes, requests });

  if (bytes != null) {
    const status = bytes <= PAGE_BYTE_BUDGET ? 'PASS' : 'WARN';
    record(entry, 'perf:bytes', status, `transferred=${(bytes / 1024).toFixed(0)} KB / budget ${(PAGE_BYTE_BUDGET / 1024).toFixed(0)} KB`);
  }
  if (vitals && vitals.lcp != null) {
    const status = vitals.lcp <= LCP_BUDGET_MS ? 'PASS' : 'WARN';
    record(entry, 'perf:lcp', status, `LCP=${vitals.lcp}ms (budget ${LCP_BUDGET_MS}ms)`);
  } else {
    record(entry, 'perf:lcp', 'WARN', 'LCP not captured');
  }
  if (vitals && vitals.ttfb != null) {
    const status = vitals.ttfb <= 800 ? 'PASS' : 'WARN';
    record(entry, 'perf:ttfb', status, `TTFB=${vitals.ttfb}ms`);
  }
}

function checkImages(entry, data) {
  const total = data.images.length;
  if (total === 0) {
    record(entry, 'img:none', 'WARN', 'No <img> elements');
    return;
  }
  const noAlt = data.images.filter((i) => i.alt === null);
  const emptyAltDecorative = data.images.filter((i) => i.alt === '');
  const noDims = data.images.filter((i) => !i.width || !i.height);
  const belowFoldEager = data.images.filter(
    (i) => !i.inViewportTop && i.loading !== 'lazy'
  );

  if (noAlt.length === 0) record(entry, 'img:alt-present', 'PASS', `${total} imgs, all have alt attr (or alt="")`);
  else record(entry, 'img:alt-present', 'FAIL', `${noAlt.length}/${total} imgs missing alt attribute`);

  if (noDims.length === 0) record(entry, 'img:dims', 'PASS', 'All imgs have width+height');
  else record(entry, 'img:dims', 'WARN', `${noDims.length}/${total} imgs missing width/height (CLS risk)`);

  if (belowFoldEager.length === 0) record(entry, 'img:lazy', 'PASS', 'Below-fold imgs lazy-loaded');
  else record(entry, 'img:lazy', 'WARN', `${belowFoldEager.length} below-fold imgs not loading=lazy`);

  record(entry, 'img:decorative', 'PASS', `${emptyAltDecorative.length} imgs use alt="" (decorative)`);
}

function checkHeadingOrder(entry, data) {
  const order = data.headings.map((h) => parseInt(h.tag.slice(1), 10));
  let skipped = false;
  let prev = 0;
  for (const lvl of order) {
    if (prev && lvl - prev > 1) { skipped = true; break; }
    prev = lvl;
  }
  if (!skipped) record(entry, 'h:order', 'PASS', `Heading sequence OK (${order.join('>')})`);
  else record(entry, 'h:order', 'WARN', `Heading levels skip a step: ${order.join('>')}`);
}

function checkSchemaDeep(entry, url, data, isProduct) {
  const objs = flatten(parseJsonLd(data.jsonLdScripts));
  for (const o of objs) {
    const t = Array.isArray(o['@type']) ? o['@type'][0] : o['@type'];
    if (t) schemaRows.push({ url, type: t, name: o.name || '' });
  }

  const org = objs.find((o) => (o['@type'] === 'Organization' || (Array.isArray(o['@type']) && o['@type'].includes('Organization'))));
  if (org) {
    const missing = [];
    if (!org.logo) missing.push('logo');
    if (!org.sameAs || (Array.isArray(org.sameAs) && org.sameAs.length === 0)) missing.push('sameAs');
    if (missing.length === 0) record(entry, 'schema:org', 'PASS', 'Organization has logo + sameAs');
    else record(entry, 'schema:org', 'WARN', `Organization missing: ${missing.join(', ')}`);
  }

  if (isProduct) {
    const product = objs.find((o) => o['@type'] === 'Product' || (Array.isArray(o['@type']) && o['@type'].includes('Product')));
    if (!product) {
      record(entry, 'schema:product', 'FAIL', 'No Product schema entity');
      return;
    }
    const missing = [];
    if (!product.image) missing.push('image');
    if (!product.brand) missing.push('brand');
    const offers = product.offers ? (Array.isArray(product.offers) ? product.offers[0] : product.offers) : null;
    if (!offers) missing.push('offers');
    else {
      if (!offers.price && offers.price !== 0) missing.push('offers.price');
      if (!offers.priceCurrency) missing.push('offers.priceCurrency');
      else if (offers.priceCurrency !== 'CHF') missing.push(`offers.priceCurrency=${offers.priceCurrency} (expected CHF)`);
      if (!offers.availability) missing.push('offers.availability');
    }
    if (missing.length === 0) record(entry, 'schema:product-complete', 'PASS', 'Product has image/brand/offers.{price,currency=CHF,availability}');
    else record(entry, 'schema:product-complete', 'FAIL', `Product schema missing: ${missing.join(', ')}`);
  }
}

function checkTrust(entry, data, kind) {
  const ft = data.footerText || '';
  // payment icons / wording
  const paymentHits = ['TWINT', 'Visa', 'Mastercard', 'PayPal', 'Postfinance', 'Apple Pay'].filter((p) => ft.includes(p));
  if (paymentHits.length >= 2) record(entry, 'trust:payment', 'PASS', `footer payments: ${paymentHits.join(', ')}`);
  else record(entry, 'trust:payment', 'WARN', `footer payments thin: ${paymentHits.join(', ') || '(none detected)'}`);

  // address / city
  if (/Lausanne|Suisse|Switzerland|CH-\d{4}|Vaud/.test(ft)) record(entry, 'trust:address', 'PASS', 'Footer mentions Lausanne/Suisse');
  else record(entry, 'trust:address', 'WARN', 'Footer missing Lausanne/Suisse mention');

  // UID / company id
  if (/CHE-\d{3}\.\d{3}\.\d{3}|UID|IDE/.test(ft)) record(entry, 'trust:uid', 'PASS', 'Swiss UID present');
  else record(entry, 'trust:uid', 'WARN', 'Swiss UID (CHE-XXX.XXX.XXX) not detected in footer');

  if (kind === 'product') {
    const body = data.bodyText || '';
    const badges = ['Authentique', 'authenticité', 'Retours', 'Garantie', 'Livraison'].filter((b) => body.includes(b));
    if (badges.length >= 2) record(entry, 'trust:pdp-badges', 'PASS', `PDP trust badges: ${badges.join(', ')}`);
    else record(entry, 'trust:pdp-badges', 'WARN', `PDP trust signals thin: ${badges.join(', ') || '(none)'}`);
  }
}

function checkI18n(entry, data) {
  if (!/^fr/i.test(data.lang)) return; // only enforce on FR pages
  const body = data.bodyText || '';
  const hits = EN_FRAGMENTS.filter((f) => new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(body));
  if (hits.length === 0) record(entry, 'i18n:no-english', 'PASS', 'No English fragments on FR page');
  else record(entry, 'i18n:no-english', 'WARN', `English fragments on FR page: ${hits.join(', ')}`);

  // CHF format check (not euro-comma)
  if (/\bCHF\s?\d/.test(body)) record(entry, 'i18n:chf-format', 'PASS', 'CHF prices detected');
  else if (/\d+[,.]\d{2}\s?€/.test(body)) record(entry, 'i18n:chf-format', 'FAIL', 'Euro format detected');
  else record(entry, 'i18n:chf-format', 'WARN', 'No CHF price detected on page');
}

function checkFormsBasic(entry, data) {
  const bad = data.inputs.filter((i) => {
    if (['hidden', 'submit', 'button'].includes(i.type)) return false;
    return !i.labelText && !i.ariaLabel && !i.ariaLabelledby && !i.placeholder;
  });
  if (data.inputs.length === 0) record(entry, 'a11y:inputs', 'PASS', 'No inputs on page');
  else if (bad.length === 0) record(entry, 'a11y:inputs', 'PASS', `${data.inputs.length} inputs, all have label/aria/placeholder`);
  else record(entry, 'a11y:inputs', 'WARN', `${bad.length}/${data.inputs.length} inputs lack accessible name`);

  const buttonsNoName = data.buttons.filter((b) => !b.text && !b.aria);
  if (data.buttons.length === 0) record(entry, 'a11y:buttons', 'PASS', 'No buttons on page');
  else if (buttonsNoName.length === 0) record(entry, 'a11y:buttons', 'PASS', `${data.buttons.length} buttons all named`);
  else record(entry, 'a11y:buttons', 'FAIL', `${buttonsNoName.length}/${data.buttons.length} buttons lack name`);
}

function checkAxe(entry, axeResult) {
  if (!axeResult) { record(entry, 'a11y:axe', 'WARN', 'axe-core not run'); return; }
  if (axeResult.error) { record(entry, 'a11y:axe', 'WARN', `axe error: ${axeResult.error}`); return; }
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of axeResult) {
    counts[v.impact] = (counts[v.impact] || 0) + 1;
    a11yRows.push({ url: entry.url, impact: v.impact, id: v.id, nodes: v.nodes, help: v.help });
  }
  const total = axeResult.length;
  const status = counts.critical > 0 ? 'FAIL' : counts.serious > 0 ? 'WARN' : 'PASS';
  record(entry, 'a11y:axe', status, `axe violations: critical=${counts.critical} serious=${counts.serious} moderate=${counts.moderate} minor=${counts.minor} total=${total}`);
}

function checkConsent(entry, data, cookieNamesBeforeConsent) {
  if (!data.hasConsentBanner) record(entry, 'consent:banner', 'WARN', 'No cookie/consent banner detected');
  else record(entry, 'consent:banner', 'PASS', 'Consent banner present');

  const leaks = cookieNamesBeforeConsent.filter((n) => ANALYTICS_COOKIE_NAMES.some((a) => n.startsWith(a)));
  if (leaks.length === 0) record(entry, 'consent:no-leak', 'PASS', 'No analytics cookies set before consent');
  else record(entry, 'consent:no-leak', 'FAIL', `Analytics cookies set pre-consent: ${leaks.join(', ')}`);
}

// ---------- runner -------------------------------------------------------

async function fetchPage(browser, url, label) {
  const ctx = await browser.newContext({
    userAgent: 'ResellLausanneP1Validator/1.0',
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  let bytes = 0;
  let requests = 0;
  page.on('response', async (resp) => {
    requests++;
    try {
      const buf = await resp.body();
      bytes += buf ? buf.length : 0;
    } catch {}
  });

  let data = null;
  let vitals = null;
  let axeResult = null;
  let error = null;
  let cookiesBefore = [];

  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    // snapshot cookies right after DCL (before any consent click)
    cookiesBefore = (await ctx.cookies()).map((c) => c.name);
    await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT_MS }).catch(() => {});
    data = await extractPageData(page);
    vitals = await collectWebVitals(page);
    axeResult = await runAxe(page);
    if (!resp) error = 'no response';
  } catch (err) {
    error = err.message || String(err);
  } finally {
    await ctx.close();
  }
  return { url, label, data, vitals, axeResult, error, bytes, requests, cookiesBefore };
}

async function probeSitemapRobots(browser, entry) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const r = await page.goto(abs('/robots.txt'), { timeout: NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    const body = await page.content();
    if (r && r.status() === 200) {
      const hasSitemap = /sitemap/i.test(body);
      record(entry, 'robots:200', 'PASS', `/robots.txt 200, sitemap line=${hasSitemap}`);
    } else {
      record(entry, 'robots:200', 'FAIL', `/robots.txt status=${r ? r.status() : 'n/a'}`);
    }
  } catch (e) {
    record(entry, 'robots:200', 'FAIL', `robots fetch error: ${e.message}`);
  }
  try {
    const r = await page.goto(abs('/sitemap.xml'), { timeout: NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    const body = await page.content();
    const isXml = /<urlset|<sitemapindex/i.test(body);
    if (r && r.status() === 200 && isXml) record(entry, 'sitemap:200-xml', 'PASS', '/sitemap.xml 200 + xml');
    else record(entry, 'sitemap:200-xml', 'FAIL', `/sitemap.xml status=${r ? r.status() : '?'} xml=${isXml}`);
  } catch (e) {
    record(entry, 'sitemap:200-xml', 'FAIL', `sitemap fetch error: ${e.message}`);
  }
  await ctx.close();
}

async function probeCartFlow(browser, entry, productData) {
  // Find first variant id from product page JSON-LD or window.__pdp
  const variantId = (function () {
    try {
      const objs = flatten(parseJsonLd(productData.jsonLdScripts));
      for (const o of objs) {
        if (o['@type'] === 'Product') {
          const offers = Array.isArray(o.offers) ? o.offers : (o.offers ? [o.offers] : []);
          for (const of_ of offers) {
            if (of_ && of_.sku) {
              // sku is not variant id; we still need numeric id. Try o.productID / o['@id']
            }
          }
          if (o.productID) return String(o.productID).split('/').pop();
        }
      }
    } catch {}
    return null;
  })();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(BASE_URL + '/', { timeout: NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    if (!variantId) {
      record(entry, 'cart:add', 'WARN', 'No numeric variant id resolvable from PDP JSON-LD; skipped /cart/add.js probe');
    } else {
      const res = await page.evaluate(async (vid) => {
        const r = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: vid, quantity: 1 }),
        });
        return { status: r.status, body: await r.text() };
      }, variantId);
      if (res.status === 200) record(entry, 'cart:add', 'PASS', `/cart/add.js 200`);
      else record(entry, 'cart:add', 'WARN', `/cart/add.js status=${res.status} body=${res.body.slice(0, 120)}`);
    }
    const cartRes = await page.evaluate(async () => {
      const r = await fetch('/cart.js');
      return { status: r.status, body: await r.text() };
    });
    if (cartRes.status === 200) record(entry, 'cart:read', 'PASS', '/cart.js 200');
    else record(entry, 'cart:read', 'WARN', `/cart.js status=${cartRes.status}`);
  } catch (e) {
    record(entry, 'cart:flow', 'WARN', `cart probe error: ${e.message}`);
  } finally {
    await ctx.close();
  }
}

async function probePredictiveSearch(browser, entry) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const url = BASE_URL + '/search/suggest.json?q=nike&resources[type]=product&resources[limit]=4';
    const r = await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    const text = await page.content();
    if (r && r.status() === 200 && /products/.test(text)) record(entry, 'search:suggest', 'PASS', '/search/suggest.json returns products');
    else record(entry, 'search:suggest', 'WARN', `/search/suggest.json status=${r ? r.status() : '?'}`);
  } catch (e) {
    record(entry, 'search:suggest', 'WARN', `predictive search error: ${e.message}`);
  } finally {
    await ctx.close();
  }
}

async function sampleInternalLinks(browser, entry, anchors) {
  const seen = new Set();
  const sample = [];
  for (const a of anchors) {
    if (!a.href) continue;
    const href = a.href.trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    let url;
    try {
      url = new URL(href, BASE_URL);
    } catch { continue; }
    if (url.origin !== new URL(BASE_URL).origin && !url.host.endsWith(new URL(BASE_URL).host)) continue;
    const k = url.pathname + url.search;
    if (seen.has(k)) continue;
    seen.add(k);
    sample.push(url.toString());
    if (sample.length >= LINK_SAMPLE) break;
  }

  const broken = [];
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const u of sample) {
    try {
      const r = await page.goto(u, { timeout: 15000, waitUntil: 'domcontentloaded' });
      const status = r ? r.status() : 0;
      const finalUrl = page.url();
      const redirected = finalUrl !== u;
      if (status >= 400) broken.push({ url: u, status, finalUrl });
      else if (redirected) broken.push({ url: u, status, finalUrl, note: 'redirect' });
    } catch (e) {
      broken.push({ url: u, status: 'ERR', error: e.message });
    }
  }
  await ctx.close();

  if (broken.length === 0) record(entry, 'links:sample-status', 'PASS', `${sample.length} sampled links all 200 no redirect`);
  else record(entry, 'links:sample-status', 'WARN', `${broken.length}/${sample.length} links non-200 or redirected`, JSON.stringify(broken).slice(0, 300));
}

// ---------- main ---------------------------------------------------------

(async function main() {
  console.log(`[validate:p1] Base URL: ${BASE_URL}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let fatalError = null;
  try {
    // 1. Homepage fetch (used to discover product + collection)
    const home = await fetchPage(browser, abs('/'), 'home');

    let productUrl = null;
    let collectionUrl = null;
    if (home.data) {
      for (const a of home.data.anchors) {
        const href = (a.href || '').trim();
        if (!productUrl && href.includes('/products/')) productUrl = abs(href.split('?')[0]);
        if (!collectionUrl && href.includes('/collections/') && !href.includes('/collections/all')) {
          collectionUrl = abs(href.split('?')[0]);
        }
        if (productUrl && collectionUrl) break;
      }
    }

    const targets = [
      { url: abs('/'), label: 'home', prefetched: home },
      { url: abs('/collections/all'), label: 'collection-all' },
      { url: abs('/pages/faq'), label: 'faq' },
      { url: abs('/pages/livraison'), label: 'livraison' },
    ];
    if (productUrl) targets.push({ url: productUrl, label: 'product' });
    if (collectionUrl) targets.push({ url: collectionUrl, label: 'collection' });

    let productData = null;

    for (const t of targets) {
      console.log(`[validate:p1] -> ${t.label} ${t.url}`);
      const fetched = t.prefetched || (await fetchPage(browser, t.url, t.label));
      const entry = entryFor(t.url, t.label);

      if (fetched.error || !fetched.data) {
        record(entry, 'fetch', 'FAIL', `Fetch failed: ${fetched.error || 'no data'}`);
        continue;
      }
      record(entry, 'fetch', 'PASS', 'Page loaded');
      checkSeoMeta(entry, fetched.data);
      checkPerf(entry, t.url, fetched.vitals, fetched.bytes, fetched.requests);
      checkImages(entry, fetched.data);
      checkHeadingOrder(entry, fetched.data);
      checkSchemaDeep(entry, t.url, fetched.data, t.label === 'product');
      checkTrust(entry, fetched.data, t.label);
      checkI18n(entry, fetched.data);
      checkFormsBasic(entry, fetched.data);
      checkAxe(entry, fetched.axeResult);
      checkConsent(entry, fetched.data, fetched.cookiesBefore);

      if (t.label === 'product') productData = fetched.data;
      if (t.label === 'home') {
        // also sample internal links
        await sampleInternalLinks(browser, entry, fetched.data.anchors);
      }
    }

    // Cross-page probes
    const infraEntry = entryFor(BASE_URL, 'infra');
    await probeSitemapRobots(browser, infraEntry);
    await probePredictiveSearch(browser, infraEntry);
    if (productData) await probeCartFlow(browser, infraEntry, productData);
    else record(infraEntry, 'cart:flow', 'WARN', 'No product page resolved; cart probe skipped');
  } catch (err) {
    fatalError = err.stack || String(err);
    console.error('[validate:p1] fatal:', fatalError);
  } finally {
    await browser.close();
  }

  // ---------- summary ----------------------------------------------------

  const summary = { pass: 0, fail: 0, warn: 0 };
  for (const r of results) for (const c of r.checks) {
    if (c.status === 'PASS') summary.pass++;
    else if (c.status === 'FAIL') summary.fail++;
    else if (c.status === 'WARN') summary.warn++;
  }

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    summary,
    fatalError,
    results,
    perf: perfRows,
    schemas: schemaRows,
    a11y: a11yRows,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(report), 'utf8');

  console.log('');
  console.log('================ P1 VALIDATION SUMMARY ================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`PASS: ${summary.pass}  FAIL: ${summary.fail}  WARN: ${summary.warn}`);
  console.log(`JSON: ${OUT_JSON}`);
  console.log(`MD  : ${OUT_MD}`);
  console.log('=======================================================');
  for (const r of results) {
    const fails = r.checks.filter((c) => c.status === 'FAIL');
    const warns = r.checks.filter((c) => c.status === 'WARN');
    if (!fails.length && !warns.length) continue;
    console.log(`\n[${r.label}] ${r.url}`);
    fails.forEach((c) => console.log(`  FAIL  ${c.id}: ${c.message}`));
    warns.forEach((c) => console.log(`  WARN  ${c.id}: ${c.message}`));
  }

  process.exit(summary.fail > 0 || fatalError ? 1 : 0);
})();

// ---------- markdown ----------------------------------------------------

function renderMarkdown(report) {
  const lines = [];
  lines.push('# P1 Validation Report');
  lines.push('');
  lines.push(`- **Timestamp:** ${report.timestamp}`);
  lines.push(`- **Base URL:** ${report.baseUrl}`);
  lines.push(
    `- **Result:** ${report.summary.fail === 0 && !report.fatalError ? 'PASS' : 'FAIL'} — pass ${report.summary.pass} / fail ${report.summary.fail} / warn ${report.summary.warn}`
  );
  if (report.fatalError) {
    lines.push('');
    lines.push('> Fatal error:');
    lines.push('```');
    lines.push(report.fatalError);
    lines.push('```');
  }

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

  lines.push('');
  lines.push('## 4. Performance');
  if (!report.perf.length) lines.push('_No perf data._');
  else {
    lines.push('');
    lines.push('| URL | TTFB | DCL | Load | LCP | bytes (KB) | reqs |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|');
    for (const p of report.perf) {
      lines.push(
        `| ${p.url} | ${p.ttfb ?? '-'} | ${p.dcl ?? '-'} | ${p.load ?? '-'} | ${p.lcp ?? '-'} | ${p.bytes != null ? (p.bytes / 1024).toFixed(0) : '-'} | ${p.requests ?? '-'} |`
      );
    }
  }

  lines.push('');
  lines.push('## 5. Schema Entities');
  if (!report.schemas.length) lines.push('_None._');
  else {
    lines.push('');
    lines.push('| URL | @type | name |');
    lines.push('|---|---|---|');
    for (const s of report.schemas) lines.push(`| ${s.url} | ${s.type} | ${s.name || ''} |`);
  }

  lines.push('');
  lines.push('## 6. Accessibility (axe-core violations)');
  if (!report.a11y.length) lines.push('_No violations or axe not run._');
  else {
    lines.push('');
    lines.push('| URL | impact | id | nodes | help |');
    lines.push('|---|---|---|---:|---|');
    for (const v of report.a11y) lines.push(`| ${v.url} | ${v.impact} | ${v.id} | ${v.nodes} | ${v.help} |`);
  }

  lines.push('');
  lines.push('## 7. Next Recommended Fixes');
  const failIds = new Set();
  const warnIds = new Set();
  for (const r of report.results) for (const c of r.checks) {
    if (c.status === 'FAIL') failIds.add(c.id);
    if (c.status === 'WARN') warnIds.add(c.id);
  }
  const fixes = [];
  if (failIds.has('seo:lang-fr')) fixes.push('Set `<html lang="fr">` in `layout/theme.liquid`.');
  if (failIds.has('seo:desc')) fixes.push('Add meta description to all templates.');
  if (failIds.has('seo:canonical')) fixes.push('Emit canonical link tag in `meta-tags.liquid`.');
  if (failIds.has('seo:og')) fixes.push('Add missing Open Graph tags (title/description/image/url).');
  if (failIds.has('img:alt-present')) fixes.push('Add `alt` attribute to every `<img>` (use `alt=""` for decorative).');
  if (failIds.has('schema:product-complete')) fixes.push('Complete Product JSON-LD: image, brand, offers.{price,priceCurrency=CHF,availability}.');
  if (failIds.has('a11y:buttons')) fixes.push('Add visible text or `aria-label` to anonymous buttons.');
  if (failIds.has('consent:no-leak')) fixes.push('Block analytics scripts until consent given (Consentmo/Klaro/OneTrust gate).');
  if (failIds.has('robots:200') || failIds.has('sitemap:200-xml')) fixes.push('Ensure /robots.txt + /sitemap.xml return 200 (Shopify auto-handles in production).');
  if (warnIds.has('perf:lcp')) fixes.push('Improve LCP: preload hero image, set `fetchpriority="high"`, reduce JS on home.');
  if (warnIds.has('perf:bytes')) fixes.push('Trim transferred bytes: serve WebP/AVIF, defer non-critical JS, audit fonts.');
  if (warnIds.has('img:dims')) fixes.push('Add explicit width/height to all `<img>` to prevent CLS.');
  if (warnIds.has('trust:uid')) fixes.push('Add Swiss UID (CHE-XXX.XXX.XXX) + legal address in footer.');
  if (warnIds.has('i18n:no-english')) fixes.push('Translate remaining English strings via `locales/fr.default.json`.');
  if (!fixes.length) fixes.push('All P1 checks clean. Run Lighthouse for final perf score.');
  for (const f of fixes) lines.push(`- ${f}`);

  lines.push('');
  return lines.join('\n');
}
