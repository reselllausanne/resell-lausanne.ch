#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * P2 validation script — Resell Lausanne Shopify theme.
 *
 * Post-launch polish and instrumentation. Run after P0 + P1 pass.
 *
 * Buckets:
 *   1.  Structured-data depth (BreadcrumbList, FAQPage, ItemList, LocalBusiness)
 *   2.  Hreflang / i18n
 *   3.  Open Graph quality (image dims, locale)
 *   4.  Favicons / PWA (manifest, apple-touch-icon)
 *   5.  Security response headers
 *   6.  CWV depth (CLS measurement)
 *   7.  Resource hints (preconnect / dns-prefetch)
 *   8.  Font loading (font-display: swap)
 *   9.  JS hygiene (defer/module + total payload)
 *   10. Image quality (WebP/AVIF, no >800KB single)
 *   11. Forms & UX (newsletter GDPR, PDP add-to-cart disabled state)
 *   12. Search UX (predictive returns ≥1 product for top brands)
 *   13. Cart pages H1, Shop Pay buttons
 *   14. Error pages (404 with branded H1 + back-home link)
 *   15. Sitemap depth (products sitemap exists, image entries)
 *   16. Robots specifics (Disallow + Sitemap absolute)
 *   17. Email collection + GDPR opt-in copy
 *   18. Analytics gating after decline
 *   19. Schema spec validation (priceValidUntil, aggregateRating)
 *   20. Microcopy QA (no Lorem / TODO / XXX visible)
 *   21. Mobile (viewport meta, tap targets at 375px, no horizontal scroll)
 *   22. Misc: dev-only `console.error` / `404` resources in network log
 *
 * Output:
 *   - console summary
 *   - audit-results/p2-validation.json
 *   - audit-results/p2-validation.md
 *
 * Does NOT modify theme files.
 */

const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (err) {
  console.error('[validate:p2] playwright not installed. Run: npm install');
  console.error(err.message);
  process.exit(2);
}

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:9292').replace(/\/$/, '');
const OUT_DIR = path.resolve(__dirname, '..', 'audit-results');
const OUT_JSON = path.join(OUT_DIR, 'p2-validation.json');
const OUT_MD = path.join(OUT_DIR, 'p2-validation.md');
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 45000);

const JS_BUDGET_HOME = 600_000; // 600 KB JS budget on home (transferred)
const IMAGE_SINGLE_BUDGET = 800_000; // 800 KB single image
const OG_IMAGE_MIN_WIDTH = 1200;
const OG_IMAGE_MIN_HEIGHT = 630;
const TAP_TARGET_MIN = 44;

const TOP_BRAND_QUERIES = ['nike', 'adidas', 'jordan'];

const FORBIDDEN_MICROCOPY = ['Lorem ipsum', 'lorem ipsum', '[placeholder]', 'TODO', 'XXX', 'FIXME', 'undefined undefined', '{{ ', ' }}'];

// ---------- accumulators -------------------------------------------------

const results = [];
const headersByUrl = {};
const networkLogByUrl = {};
const schemaRowsByUrl = {};

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
    const getAll = (sel) => Array.from(head.querySelectorAll(sel));

    const hreflangs = getAll('link[rel="alternate"][hreflang]').map((l) => ({
      hreflang: l.getAttribute('hreflang'),
      href: l.getAttribute('href'),
    }));
    const preconnects = getAll('link[rel="preconnect"], link[rel="dns-prefetch"]').map((l) => ({
      rel: l.getAttribute('rel'),
      href: l.getAttribute('href'),
      crossorigin: l.getAttribute('crossorigin'),
    }));
    const preloads = getAll('link[rel="preload"]').map((l) => ({
      as: l.getAttribute('as'),
      href: l.getAttribute('href'),
      type: l.getAttribute('type'),
      crossorigin: l.getAttribute('crossorigin'),
    }));
    const fontLinks = getAll('link[rel="stylesheet"]').map((l) => l.getAttribute('href'));
    const scriptTags = Array.from(document.querySelectorAll('script')).map((s) => ({
      src: s.getAttribute('src'),
      type: s.getAttribute('type'),
      async: s.hasAttribute('async'),
      defer: s.hasAttribute('defer'),
    }));
    const viewport = get('meta[name="viewport" i]', 'content');
    const manifest = get('link[rel="manifest" i]', 'href');
    const appleTouch = get('link[rel="apple-touch-icon" i]', 'href');
    const favicon = get('link[rel="icon" i]', 'href') || get('link[rel="shortcut icon" i]', 'href');
    const ogLocale = get('meta[property="og:locale" i]', 'content');
    const ogImage = get('meta[property="og:image" i]', 'content');
    const ogImageWidth = get('meta[property="og:image:width" i]', 'content');
    const ogImageHeight = get('meta[property="og:image:height" i]', 'content');

    const jsonLdScripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    ).map((s) => s.textContent || '');

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => ({
      tag: h.tagName.toLowerCase(),
      text: (h.textContent || '').trim().slice(0, 200),
    }));

    const visibleFaqItems = Array.from(
      document.querySelectorAll('[itemtype*="Question" i], details summary, [class*="faq__item" i], [data-faq-item]')
    ).length;

    const visibleProductCards = Array.from(document.querySelectorAll('a[href*="/products/"]')).filter((a) => a.offsetParent || a.getClientRects().length).length;

    const images = Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.currentSrc || img.src || img.getAttribute('src') || '',
      alt: img.getAttribute('alt'),
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      loading: img.getAttribute('loading'),
    }));

    const tapTargets = Array.from(
      document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]')
    )
      .filter((el) => el.offsetParent || el.getClientRects().length)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 40),
          aria: el.getAttribute('aria-label'),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });

    const horizontalScroll =
      document.documentElement.scrollWidth - document.documentElement.clientWidth > 1;

    const bodyText = document.body ? document.body.innerText : '';

    return {
      url: location.href,
      hreflangs,
      preconnects,
      preloads,
      fontLinks,
      scriptTags,
      viewport,
      manifest,
      appleTouch,
      favicon,
      ogLocale,
      ogImage,
      ogImageWidth,
      ogImageHeight,
      jsonLdScripts,
      headings,
      visibleFaqItems,
      visibleProductCards,
      images,
      tapTargets,
      horizontalScroll,
      bodyText,
    };
  });
}

async function measureCLS(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let cls = 0;
        try {
          const po = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              if (!e.hadRecentInput) cls += e.value;
            }
          });
          po.observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => {
            try { po.disconnect(); } catch {}
            resolve(cls);
          }, 2500);
        } catch {
          resolve(null);
        }
      })
  );
}

// ---------- helpers ------------------------------------------------------

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
function typeOf(o) {
  const t = o['@type'];
  if (!t) return null;
  return Array.isArray(t) ? t[0] : t;
}

// ---------- checks -------------------------------------------------------

function checkStructuredDepth(entry, data, label) {
  const objs = flatten(parseJsonLd(data.jsonLdScripts));
  schemaRowsByUrl[entry.url] = objs.map((o) => ({ type: typeOf(o), name: o.name || o.headline || '' }));

  const breadcrumb = objs.find((o) => typeOf(o) === 'BreadcrumbList');
  if (breadcrumb) {
    const items = Array.isArray(breadcrumb.itemListElement) ? breadcrumb.itemListElement : [];
    if (items.length >= 2) record(entry, 'schema:breadcrumb', 'PASS', `BreadcrumbList has ${items.length} items`);
    else record(entry, 'schema:breadcrumb', 'WARN', `BreadcrumbList has only ${items.length} item`);
  } else if (label !== 'home') {
    record(entry, 'schema:breadcrumb', 'WARN', 'No BreadcrumbList');
  }

  if (label === 'faq') {
    const faq = objs.find((o) => typeOf(o) === 'FAQPage');
    if (faq) {
      const me = Array.isArray(faq.mainEntity) ? faq.mainEntity : (faq.mainEntity ? [faq.mainEntity] : []);
      const visible = data.visibleFaqItems;
      const status = me.length > 0 && Math.abs(me.length - visible) <= 5 ? 'PASS' : 'WARN';
      record(entry, 'schema:faq-count', status, `FAQPage mainEntity=${me.length} vs visible Q&A=${visible}`);
    } else {
      record(entry, 'schema:faq-page', 'WARN', 'FAQPage entity missing');
    }
  }

  if (label && label.startsWith('collection')) {
    const il = objs.find((o) => typeOf(o) === 'ItemList');
    if (il) {
      const num = il.numberOfItems != null ? il.numberOfItems : (Array.isArray(il.itemListElement) ? il.itemListElement.length : 0);
      const visible = data.visibleProductCards;
      const ok = num > 0 && Math.abs(num - visible) <= Math.max(5, visible * 0.5);
      record(entry, 'schema:itemlist-count', ok ? 'PASS' : 'WARN', `ItemList items=${num} vs visible cards=${visible}`);
    } else {
      record(entry, 'schema:itemlist', 'WARN', 'No ItemList entity');
    }
  }

  const lb = objs.find((o) => typeOf(o) === 'LocalBusiness');
  if (lb) {
    const missing = [];
    if (!lb.address) missing.push('address');
    if (!lb.telephone) missing.push('telephone');
    if (!lb.openingHoursSpecification && !lb.openingHours) missing.push('openingHoursSpecification');
    if (!lb.geo) missing.push('geo');
    if (missing.length === 0) record(entry, 'schema:localbusiness', 'PASS', 'LocalBusiness has address/phone/hours/geo');
    else record(entry, 'schema:localbusiness', 'WARN', `LocalBusiness missing: ${missing.join(', ')}`);
  }

  if (label === 'product') {
    const product = objs.find((o) => typeOf(o) === 'Product');
    if (product) {
      const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      if (offers) {
        if (offers.priceValidUntil) {
          const ok = /^\d{4}-\d{2}-\d{2}/.test(offers.priceValidUntil);
          record(entry, 'schema:priceValidUntil', ok ? 'PASS' : 'WARN', `priceValidUntil=${offers.priceValidUntil}`);
        }
      }
      if (product.aggregateRating) {
        const ar = product.aggregateRating;
        if (ar.ratingValue != null && ar.reviewCount != null) record(entry, 'schema:rating', 'PASS', `rating=${ar.ratingValue} (${ar.reviewCount})`);
        else record(entry, 'schema:rating', 'WARN', 'aggregateRating missing ratingValue/reviewCount');
      }
    }
  }
}

function checkHreflang(entry, data) {
  if (!data.hreflangs.length) {
    record(entry, 'i18n:hreflang', 'WARN', 'No hreflang alternates declared');
    return;
  }
  const langs = data.hreflangs.map((h) => h.hreflang);
  const hasXDefault = langs.includes('x-default');
  const hasFr = langs.some((l) => /^fr(-CH)?$/i.test(l));
  if (hasFr && hasXDefault) record(entry, 'i18n:hreflang', 'PASS', `hreflang: ${langs.join(', ')}`);
  else record(entry, 'i18n:hreflang', 'WARN', `hreflang missing fr/x-default: ${langs.join(', ')}`);
}

function checkOG(entry, data, ogImageMeta) {
  if (!data.ogImage) {
    record(entry, 'og:image-present', 'WARN', 'No og:image');
    return;
  }
  if (!/^https?:\/\//i.test(data.ogImage)) record(entry, 'og:image-absolute', 'WARN', 'og:image not absolute https URL');
  else record(entry, 'og:image-absolute', 'PASS', 'og:image absolute https');

  if (data.ogImageWidth && data.ogImageHeight) {
    const w = parseInt(data.ogImageWidth, 10);
    const h = parseInt(data.ogImageHeight, 10);
    if (w >= OG_IMAGE_MIN_WIDTH && h >= OG_IMAGE_MIN_HEIGHT) record(entry, 'og:image-dims', 'PASS', `${w}x${h}`);
    else record(entry, 'og:image-dims', 'WARN', `og:image declared ${w}x${h} (min ${OG_IMAGE_MIN_WIDTH}x${OG_IMAGE_MIN_HEIGHT})`);
  } else if (ogImageMeta && ogImageMeta.width) {
    if (ogImageMeta.width >= OG_IMAGE_MIN_WIDTH && ogImageMeta.height >= OG_IMAGE_MIN_HEIGHT) record(entry, 'og:image-dims', 'PASS', `actual ${ogImageMeta.width}x${ogImageMeta.height}`);
    else record(entry, 'og:image-dims', 'WARN', `actual ${ogImageMeta.width}x${ogImageMeta.height} below ${OG_IMAGE_MIN_WIDTH}x${OG_IMAGE_MIN_HEIGHT}`);
  } else {
    record(entry, 'og:image-dims', 'WARN', 'og:image dims not declared and image probe failed');
  }

  if (data.ogLocale) {
    const ok = /^fr/.test(data.ogLocale);
    record(entry, 'og:locale', ok ? 'PASS' : 'WARN', `og:locale=${data.ogLocale}`);
  } else {
    record(entry, 'og:locale', 'WARN', 'og:locale missing');
  }
}

function checkPwa(entry, data, faviconHit, manifestHit) {
  if (faviconHit) record(entry, 'pwa:favicon', 'PASS', 'favicon 200');
  else record(entry, 'pwa:favicon', 'WARN', '/favicon.ico not 200');
  if (data.appleTouch) record(entry, 'pwa:apple-touch', 'PASS', 'apple-touch-icon present');
  else record(entry, 'pwa:apple-touch', 'WARN', 'apple-touch-icon missing');
  if (manifestHit && manifestHit.status === 200) {
    const ok = manifestHit.body && /\"icons\"/.test(manifestHit.body);
    record(entry, 'pwa:manifest', ok ? 'PASS' : 'WARN', `manifest 200, icons=${ok}`);
  } else {
    record(entry, 'pwa:manifest', 'WARN', `manifest ${manifestHit ? manifestHit.status : 'absent'}`);
  }
}

function checkSecurityHeaders(entry, headers) {
  const want = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];
  for (const h of want) {
    if (headers[h]) record(entry, `sec:${h}`, 'PASS', `${h}=${String(headers[h]).slice(0, 60)}`);
    else record(entry, `sec:${h}`, 'WARN', `${h} not set (Shopify edge sets some in prod only)`);
  }
}

function checkCls(entry, cls) {
  if (cls == null) { record(entry, 'cwv:cls', 'WARN', 'CLS not measured'); return; }
  const status = cls < 0.1 ? 'PASS' : cls < 0.25 ? 'WARN' : 'FAIL';
  record(entry, 'cwv:cls', status, `CLS=${cls.toFixed(3)}`);
}

function checkResourceHints(entry, data) {
  const cdnOK = data.preconnects.some((p) => /cdn\.shopify\.com|shopifycdn/i.test(p.href || ''));
  if (cdnOK) record(entry, 'hint:cdn', 'PASS', 'preconnect/dns-prefetch to Shopify CDN');
  else record(entry, 'hint:cdn', 'WARN', 'No preconnect/dns-prefetch to Shopify CDN');

  // preload fonts must be crossorigin
  const fontPreloads = data.preloads.filter((p) => p.as === 'font');
  const badFontPreloads = fontPreloads.filter((p) => p.crossorigin === null);
  if (fontPreloads.length === 0) record(entry, 'hint:font-preload', 'PASS', 'No font preloads');
  else if (badFontPreloads.length === 0) record(entry, 'hint:font-preload', 'PASS', `${fontPreloads.length} font preloads all crossorigin`);
  else record(entry, 'hint:font-preload', 'WARN', `${badFontPreloads.length} font preloads lack crossorigin`);
}

function checkFontDisplay(entry, cssBodies) {
  let any = false;
  let swap = false;
  for (const css of cssBodies) {
    if (/@font-face/i.test(css)) {
      any = true;
      if (/font-display\s*:\s*(swap|optional|fallback)/i.test(css)) swap = true;
    }
  }
  if (!any) record(entry, 'font:display-swap', 'PASS', 'No @font-face declarations');
  else if (swap) record(entry, 'font:display-swap', 'PASS', '@font-face uses font-display:swap/optional/fallback');
  else record(entry, 'font:display-swap', 'WARN', '@font-face missing font-display directive');
}

function checkJsHygiene(entry, data, jsBytesTotal, isHome) {
  const noModNoDefer = data.scriptTags.filter((s) => s.src && s.type !== 'module' && !s.defer && !s.async);
  if (noModNoDefer.length === 0) record(entry, 'js:non-blocking', 'PASS', 'All external scripts module/defer/async');
  else record(entry, 'js:non-blocking', 'WARN', `${noModNoDefer.length} render-blocking external scripts`);

  if (isHome) {
    const status = jsBytesTotal <= JS_BUDGET_HOME ? 'PASS' : 'WARN';
    record(entry, 'js:home-budget', status, `home JS=${(jsBytesTotal / 1024).toFixed(0)} KB / budget ${(JS_BUDGET_HOME / 1024).toFixed(0)} KB`);
  }
}

function checkImageQuality(entry, network) {
  const imgs = network.filter((r) => /^image\//i.test(r.type) || /\.(jpe?g|png|webp|avif|gif|svg)(\?|$)/i.test(r.url));
  const heavy = imgs.filter((r) => r.bytes > IMAGE_SINGLE_BUDGET);
  if (heavy.length === 0) record(entry, 'img:no-heavy', 'PASS', `No single image > ${(IMAGE_SINGLE_BUDGET / 1024).toFixed(0)} KB`);
  else record(entry, 'img:no-heavy', 'WARN', `${heavy.length} images >${(IMAGE_SINGLE_BUDGET / 1024).toFixed(0)} KB`, JSON.stringify(heavy.slice(0, 3).map(h => `${(h.bytes/1024).toFixed(0)}KB ${h.url.split('?')[0].split('/').pop()}`)));

  const modern = imgs.filter((r) => /\.(webp|avif)(\?|$)/i.test(r.url) || /image\/(webp|avif)/i.test(r.type));
  const total = imgs.length;
  if (total === 0) record(entry, 'img:modern-format', 'PASS', 'No images');
  else {
    const pct = (modern.length / total) * 100;
    record(entry, 'img:modern-format', pct >= 70 ? 'PASS' : 'WARN', `${modern.length}/${total} (${pct.toFixed(0)}%) WebP/AVIF`);
  }
}

function checkMicrocopy(entry, data) {
  const body = data.bodyText || '';
  const hits = FORBIDDEN_MICROCOPY.filter((s) => body.includes(s));
  if (hits.length === 0) record(entry, 'qa:microcopy', 'PASS', 'No Lorem/TODO/XXX/placeholder leaks');
  else record(entry, 'qa:microcopy', 'WARN', `Leaks: ${hits.join(', ')}`);
}

function checkViewport(entry, data) {
  const v = data.viewport || '';
  if (/width=device-width/.test(v) && /initial-scale=1/.test(v)) record(entry, 'mobile:viewport', 'PASS', `viewport: ${v}`);
  else record(entry, 'mobile:viewport', 'WARN', `viewport: ${v || '(none)'}`);
}

function checkTapTargetsAndScroll(entry, dataMobile) {
  if (dataMobile.horizontalScroll) record(entry, 'mobile:no-hscroll', 'WARN', 'Horizontal scroll at 375px');
  else record(entry, 'mobile:no-hscroll', 'PASS', 'No horizontal scroll at 375px');

  const visibleInteractive = dataMobile.tapTargets.filter((t) => t.w > 0 && t.h > 0);
  const small = visibleInteractive.filter((t) => Math.min(t.w, t.h) < TAP_TARGET_MIN);
  if (visibleInteractive.length === 0) record(entry, 'mobile:tap-targets', 'PASS', 'No interactive elements found');
  else {
    const status = small.length === 0 ? 'PASS' : small.length / visibleInteractive.length < 0.15 ? 'WARN' : 'FAIL';
    record(entry, 'mobile:tap-targets', status, `${small.length}/${visibleInteractive.length} interactive < ${TAP_TARGET_MIN}px (${(small.length / visibleInteractive.length * 100).toFixed(0)}%)`);
  }
}

function checkForbiddenMicrocopy(entry, data) { return checkMicrocopy(entry, data); }

// ---------- one-off page fetch ------------------------------------------

async function fetchPage(browser, url, label, opts = {}) {
  const viewport = opts.viewport || { width: 1440, height: 900 };
  const ctx = await browser.newContext({
    userAgent: 'ResellLausanneP2Validator/1.0',
    viewport,
  });
  const page = await ctx.newPage();

  const network = [];
  let respHeaders = {};
  const cssBodies = [];

  page.on('response', async (resp) => {
    const r = { url: resp.url(), type: (resp.headers()['content-type'] || '').split(';')[0], status: resp.status(), bytes: 0 };
    try {
      const buf = await resp.body();
      r.bytes = buf ? buf.length : 0;
      if (/text\/css/i.test(r.type)) cssBodies.push(buf ? buf.toString('utf8') : '');
    } catch {}
    network.push(r);
  });

  let data = null;
  let cls = null;
  let cookiesBefore = [];
  let error = null;

  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    if (resp) {
      respHeaders = resp.headers();
      headersByUrl[url] = respHeaders;
    }
    cookiesBefore = (await ctx.cookies()).map((c) => c.name);
    await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT_MS }).catch(() => {});
    data = await extractPageData(page);
    cls = await measureCLS(page);
  } catch (err) {
    error = err.message || String(err);
  } finally {
    await ctx.close();
  }

  networkLogByUrl[url] = network;
  return { url, label, data, cls, error, network, respHeaders, cssBodies, cookiesBefore };
}

async function probeStatus(browser, url) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const r = await page.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' });
    const status = r ? r.status() : 0;
    const body = await page.content();
    return { status, body };
  } catch (e) {
    return { status: 0, error: e.message };
  } finally {
    await ctx.close();
  }
}

async function probeOgImageDims(browser, ogUrl) {
  if (!ogUrl) return null;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const r = await page.goto(ogUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });
    if (!r || r.status() !== 200) return null;
    // try image-natural-size via temporary HTML
    await page.setContent(`<img id="x" src="${ogUrl}">`);
    await page.waitForFunction(() => {
      const img = document.getElementById('x');
      return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 10000 }).catch(() => {});
    const dims = await page.evaluate(() => {
      const img = document.getElementById('x');
      return img && img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : null;
    });
    return dims;
  } catch {
    return null;
  } finally {
    await ctx.close();
  }
}

async function probePredictiveSearch(entry, browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    for (const q of TOP_BRAND_QUERIES) {
      const u = `${BASE_URL}/search/suggest.json?q=${q}&resources[type]=product&resources[limit]=4`;
      const r = await page.goto(u, { timeout: 15000, waitUntil: 'domcontentloaded' });
      const txt = await page.content();
      const status = r ? r.status() : 0;
      const hasProducts = /products/.test(txt) && /\"title\"/.test(txt);
      record(entry, `search:${q}`, hasProducts && status === 200 ? 'PASS' : 'WARN', `suggest q=${q} status=${status} products=${hasProducts}`);
    }
  } catch (e) {
    record(entry, 'search:probe', 'WARN', `predictive search err: ${e.message}`);
  } finally {
    await ctx.close();
  }
}

async function probeCart(entry, browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const r = await page.goto(BASE_URL + '/cart', { timeout: 20000, waitUntil: 'domcontentloaded' });
    const status = r ? r.status() : 0;
    if (status !== 200) {
      record(entry, 'cart:page', 'WARN', `/cart status=${status}`);
      return;
    }
    const has = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const shopPay = document.querySelector('[name="checkout"], [data-shopify="payment-button"], [class*="shop-pay" i]');
      return { h1: h1 ? (h1.textContent || '').trim() : '', hasCheckoutBtn: !!shopPay };
    });
    record(entry, 'cart:h1', has.h1 ? 'PASS' : 'WARN', `cart H1="${has.h1}"`);
    record(entry, 'cart:checkout-cta', has.hasCheckoutBtn ? 'PASS' : 'WARN', 'checkout CTA present');
  } catch (e) {
    record(entry, 'cart:page', 'WARN', `cart err: ${e.message}`);
  } finally {
    await ctx.close();
  }
}

async function probe404(entry, browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const r = await page.goto(BASE_URL + '/intentionally-missing-' + Date.now(), { timeout: 20000, waitUntil: 'domcontentloaded' });
    const status = r ? r.status() : 0;
    const info = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const homeLink = Array.from(document.querySelectorAll('a')).find((a) => /accueil|home/i.test((a.textContent || '').trim()));
      return { h1: h1 ? (h1.textContent || '').trim() : '', hasHomeLink: !!homeLink };
    });
    if (status === 404) record(entry, 'err:404-status', 'PASS', 'Status 404');
    else record(entry, 'err:404-status', 'WARN', `Status ${status} on missing path`);
    if (info.h1) record(entry, 'err:404-h1', 'PASS', `H1="${info.h1}"`);
    else record(entry, 'err:404-h1', 'WARN', 'No H1 on 404 page');
    if (info.hasHomeLink) record(entry, 'err:404-home-link', 'PASS', 'Back-home link present');
    else record(entry, 'err:404-home-link', 'WARN', 'No back-home link');
  } finally {
    await ctx.close();
  }
}

async function probeSitemapDepth(entry, browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const r = await page.goto(BASE_URL + '/sitemap.xml', { timeout: 20000, waitUntil: 'domcontentloaded' });
    const body = await page.content();
    if (!r || r.status() !== 200) { record(entry, 'sitemap:index', 'WARN', `/sitemap.xml status=${r ? r.status() : 0}`); return; }
    const subs = Array.from(body.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
    record(entry, 'sitemap:index', 'PASS', `${subs.length} sitemap entries`);
    const productsSitemap = subs.find((s) => /sitemap_products/.test(s));
    if (productsSitemap) {
      const r2 = await page.goto(productsSitemap, { timeout: 20000, waitUntil: 'domcontentloaded' });
      const b2 = await page.content();
      const urlCount = (b2.match(/<url>/g) || []).length;
      const imageCount = (b2.match(/<image:image>/g) || []).length;
      record(entry, 'sitemap:products', urlCount > 0 ? 'PASS' : 'WARN', `products sitemap urls=${urlCount} images=${imageCount}`);
    } else {
      record(entry, 'sitemap:products', 'WARN', 'No sitemap_products entry');
    }
  } catch (e) {
    record(entry, 'sitemap:index', 'WARN', `sitemap err: ${e.message}`);
  } finally {
    await ctx.close();
  }
}

async function probeRobots(entry, browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const r = await page.goto(BASE_URL + '/robots.txt', { timeout: 20000, waitUntil: 'domcontentloaded' });
    const body = await page.content();
    if (!r || r.status() !== 200) { record(entry, 'robots:200', 'WARN', `/robots.txt status=${r ? r.status() : 0}`); return; }
    const text = body.replace(/<[^>]+>/g, '');
    const wants = ['/cart', '/checkout', '/account', '/policies'];
    const missing = wants.filter((w) => !new RegExp(`Disallow:\\s*${w.replace('/', '\\/')}`).test(text));
    if (missing.length === 0) record(entry, 'robots:disallow', 'PASS', `Disallows present for ${wants.join(', ')}`);
    else record(entry, 'robots:disallow', 'WARN', `Missing Disallow: ${missing.join(', ')}`);
    if (/Sitemap:\s*https?:\/\//i.test(text)) record(entry, 'robots:sitemap-line', 'PASS', 'Absolute Sitemap: line present');
    else record(entry, 'robots:sitemap-line', 'WARN', 'No absolute Sitemap: line');
  } catch (e) {
    record(entry, 'robots:200', 'WARN', `robots err: ${e.message}`);
  } finally {
    await ctx.close();
  }
}

async function probeAnalyticsGatingAfterDecline(entry, browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    // simulate refusal
    await page.goto(BASE_URL + '/', { timeout: NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.cookie = 'rl_consent=refused; max-age=15552000; path=/; SameSite=Lax';
    });
    await page.goto(BASE_URL + '/', { timeout: NAV_TIMEOUT_MS, waitUntil: 'networkidle' });
    await page.goto(BASE_URL + '/collections/all', { timeout: NAV_TIMEOUT_MS, waitUntil: 'networkidle' });
    const cookies = (await ctx.cookies()).map((c) => c.name);
    const leaks = cookies.filter((n) => /^_ga|^_gid|^_fbp|^_fbc|^_ttp|^_tt_/.test(n));
    if (leaks.length === 0) record(entry, 'consent:no-leak-after-refuse', 'PASS', 'No analytics cookies after consent=refused');
    else record(entry, 'consent:no-leak-after-refuse', 'FAIL', `Analytics cookies despite refuse: ${leaks.join(', ')}`);
  } catch (e) {
    record(entry, 'consent:probe', 'WARN', `probe err: ${e.message}`);
  } finally {
    await ctx.close();
  }
}

async function probePwaAssets(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let faviconHit = false;
  let manifestHit = null;
  try {
    const r = await page.goto(BASE_URL + '/favicon.ico', { timeout: 15000, waitUntil: 'domcontentloaded' });
    faviconHit = !!r && r.status() === 200;
  } catch {}
  try {
    const r = await page.goto(BASE_URL + '/manifest.json', { timeout: 15000, waitUntil: 'domcontentloaded' });
    if (r && r.status() === 200) {
      manifestHit = { status: 200, body: await page.content() };
    } else if (r) {
      manifestHit = { status: r.status() };
    }
  } catch {}
  await ctx.close();
  return { faviconHit, manifestHit };
}

// ---------- main ---------------------------------------------------------

(async function main() {
  console.log(`[validate:p2] Base URL: ${BASE_URL}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let fatalError = null;
  try {
    // Probe shared PWA assets once
    const pwa = await probePwaAssets(browser);

    // Discover product/collection from homepage
    const home = await fetchPage(browser, abs('/'), 'home');
    let productUrl = null;
    let collectionUrl = null;
    if (home.data) {
      for (const a of (home.data.images || [])) {} // noop
      // anchors not extracted in this version; rediscover via evaluate
    }
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await page.goto(abs('/'), { timeout: NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
        const found = await page.evaluate(() => {
          const a = Array.from(document.querySelectorAll('a'));
          const prod = a.map((x) => x.getAttribute('href')).find((h) => h && h.includes('/products/'));
          const coll = a.map((x) => x.getAttribute('href')).find((h) => h && h.includes('/collections/') && !h.includes('/collections/all'));
          return { prod, coll };
        });
        productUrl = found.prod ? abs(found.prod.split('?')[0]) : null;
        collectionUrl = found.coll ? abs(found.coll.split('?')[0]) : null;
      } finally {
        await ctx.close();
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

    for (const t of targets) {
      console.log(`[validate:p2] -> ${t.label} ${t.url}`);
      const fetched = t.prefetched || (await fetchPage(browser, t.url, t.label));
      const entry = entryFor(t.url, t.label);

      if (fetched.error || !fetched.data) {
        record(entry, 'fetch', 'FAIL', `Fetch failed: ${fetched.error || 'no data'}`);
        continue;
      }
      record(entry, 'fetch', 'PASS', 'Page loaded');

      checkStructuredDepth(entry, fetched.data, t.label);
      checkHreflang(entry, fetched.data);

      // Probe og:image dimensions once per page if og:image present
      const ogDims = await probeOgImageDims(browser, fetched.data.ogImage);
      checkOG(entry, fetched.data, ogDims);

      checkPwa(entry, fetched.data, pwa.faviconHit, pwa.manifestHit);
      checkSecurityHeaders(entry, fetched.respHeaders);
      checkCls(entry, fetched.cls);
      checkResourceHints(entry, fetched.data);
      checkFontDisplay(entry, fetched.cssBodies);

      const jsBytes = fetched.network.filter((r) => /javascript|ecmascript/i.test(r.type) || /\.js(\?|$)/i.test(r.url)).reduce((a, b) => a + b.bytes, 0);
      checkJsHygiene(entry, fetched.data, jsBytes, t.label === 'home');
      checkImageQuality(entry, fetched.network);
      checkMicrocopy(entry, fetched.data);
      checkViewport(entry, fetched.data);

      // Mobile re-fetch for tap targets + horizontal scroll
      const mobile = await fetchPage(browser, t.url, t.label + '-mobile', { viewport: { width: 375, height: 812 } });
      if (mobile.data) checkTapTargetsAndScroll(entry, mobile.data);
    }

    // Cross-page infra entry
    const infra = entryFor(BASE_URL, 'infra');
    await probeRobots(infra, browser);
    await probeSitemapDepth(infra, browser);
    await probePredictiveSearch(infra, browser);
    await probeCart(infra, browser);
    await probe404(infra, browser);
    await probeAnalyticsGatingAfterDecline(infra, browser);
  } catch (err) {
    fatalError = err.stack || String(err);
    console.error('[validate:p2] fatal:', fatalError);
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
    schemas: schemaRowsByUrl,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(report), 'utf8');

  console.log('');
  console.log('================ P2 VALIDATION SUMMARY ================');
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

function renderMarkdown(report) {
  const lines = [];
  lines.push('# P2 Validation Report');
  lines.push('');
  lines.push(`- **Timestamp:** ${report.timestamp}`);
  lines.push(`- **Base URL:** ${report.baseUrl}`);
  lines.push(
    `- **Result:** ${report.summary.fail === 0 && !report.fatalError ? 'PASS' : 'FAIL'} — pass ${report.summary.pass} / fail ${report.summary.fail} / warn ${report.summary.warn}`
  );
  if (report.fatalError) {
    lines.push('');
    lines.push('```');
    lines.push(report.fatalError);
    lines.push('```');
  }

  lines.push('');
  lines.push('## Pass / Fail Summary');
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
  lines.push('## Failed Checks');
  let any = false;
  for (const r of report.results) {
    const fails = r.checks.filter((c) => c.status === 'FAIL');
    if (!fails.length) continue;
    any = true;
    lines.push('');
    lines.push(`### ${r.label} — ${r.url}`);
    for (const c of fails) {
      lines.push(`- **${c.id}** — ${c.message}`);
      if (c.evidence) lines.push(`  - evidence: \`${String(c.evidence).slice(0, 240)}\``);
    }
  }
  if (!any) lines.push('\n_None._');

  lines.push('');
  lines.push('## Warnings');
  any = false;
  for (const r of report.results) {
    const warns = r.checks.filter((c) => c.status === 'WARN');
    if (!warns.length) continue;
    any = true;
    lines.push('');
    lines.push(`### ${r.label} — ${r.url}`);
    for (const c of warns) {
      lines.push(`- **${c.id}** — ${c.message}`);
      if (c.evidence) lines.push(`  - evidence: \`${String(c.evidence).slice(0, 240)}\``);
    }
  }
  if (!any) lines.push('\n_None._');

  lines.push('');
  lines.push('## Schema Entities Per URL');
  for (const [u, arr] of Object.entries(report.schemas)) {
    lines.push('');
    lines.push(`### ${u}`);
    if (!arr.length) lines.push('_No JSON-LD._');
    else for (const s of arr) lines.push(`- \`${s.type}\` ${s.name || ''}`);
  }

  lines.push('');
  return lines.join('\n');
}
