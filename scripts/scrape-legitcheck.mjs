#!/usr/bin/env node
/**
 * Scrape legitcheck.app/category/guides/ (page 1) for inspiration:
 *  - List of guide URLs + card titles + excerpts + cover image
 *  - For each guide: full HTML body, title, hero image, image URLs in order
 *
 * Output:
 *   audit-results/legitcheck-scrape/index.json
 *   audit-results/legitcheck-scrape/articles/<slug>.json
 *   audit-results/legitcheck-scrape/images/<slug>/<n>.<ext>   (only if --images)
 *
 * Usage:
 *   npx playwright install chromium   # one-time
 *   node scripts/scrape-legitcheck.mjs               # list + bodies (no image download)
 *   node scripts/scrape-legitcheck.mjs --images      # also download images
 *   node scripts/scrape-legitcheck.mjs --only=fake-vs-real-margiela-gats
 *
 * NOTE: research only. Rewrite content in own words before publishing.
 *       Always credit + link source in published version.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "audit-results/legitcheck-scrape");
const ARTICLES_DIR = path.join(OUT, "articles");
const IMAGES_DIR = path.join(OUT, "images");
const BASE = "https://legitcheck.app";
const LIST_URL = `${BASE}/category/guides/`;

const args = process.argv.slice(2);
const WANT_IMAGES = args.includes("--images");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1] || null;

fs.mkdirSync(ARTICLES_DIR, { recursive: true });
if (WANT_IMAGES) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const slugFromUrl = (u) => {
  const m = u.match(/\/guides\/([^/]+)\/?/);
  return m ? m[1] : u.split("/").filter(Boolean).pop();
};

async function downloadImage(ctx, url, destDir, idx) {
  try {
    const res = await ctx.request.get(url);
    if (!res.ok()) return null;
    const buf = await res.body();
    const ext = (url.match(/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i) || [, "jpg"])[1].toLowerCase();
    const file = path.join(destDir, `${String(idx).padStart(2, "0")}.${ext}`);
    fs.writeFileSync(file, buf);
    return path.relative(ROOT, file);
  } catch {
    return null;
  }
}

async function scrapeList(page) {
  console.log(`[list] ${LIST_URL}`);
  await page.goto(LIST_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  const cards = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    document.querySelectorAll('a[href*="/guides/"]').forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (!/\/guides\/[^/]+\/?$/.test(href)) return;
      const abs = new URL(href, location.origin).toString();
      if (seen.has(abs)) return;
      seen.add(abs);
      const card = a.closest("article, .post, .card, li, div") || a;
      const title = (card.querySelector("h1,h2,h3,h4")?.textContent || a.textContent || "").trim();
      const excerpt = (card.querySelector("p")?.textContent || "").trim();
      const img = card.querySelector("img");
      const imgUrl = img?.getAttribute("src") || img?.getAttribute("data-src") || null;
      out.push({ url: abs, title, excerpt, image: imgUrl });
    });
    return out;
  });
  return cards;
}

async function scrapeArticle(page, url) {
  console.log(`[article] ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  return page.evaluate(() => {
    const pick = (sel) => document.querySelector(sel);
    const title = (pick("h1")?.textContent || document.title || "").trim();
    const main =
      pick("article .entry-content") ||
      pick("article .post-content") ||
      pick("article") ||
      pick("main");
    const html = main ? main.innerHTML : document.body.innerHTML;
    const text = (main || document.body).innerText.trim();
    const hero =
      pick('meta[property="og:image"]')?.getAttribute("content") ||
      pick("article img")?.getAttribute("src") ||
      null;
    const images = Array.from((main || document).querySelectorAll("img"))
      .map((img) => img.getAttribute("src") || img.getAttribute("data-src"))
      .filter(Boolean);
    const description =
      pick('meta[name="description"]')?.getAttribute("content") ||
      pick('meta[property="og:description"]')?.getAttribute("content") ||
      null;
    return { title, hero, description, images, html, text };
  });
}

async function main() {
  const launchOpts = {
    headless: process.env.HEADLESS !== "0",
    args: ["--disable-blink-features=AutomationControlled"],
  };
  if (process.env.USE_CHROME === "1") launchOpts.channel = "chrome";
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Upgrade-Insecure-Requests": "1",
    },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await ctx.newPage();

  let list;
  if (ONLY && /^[a-z0-9-]+$/.test(ONLY)) {
    list = [{ url: `${BASE}/guides/${ONLY}/`, title: ONLY, excerpt: "", image: null }];
  } else {
    list = await scrapeList(page);
    if (ONLY) list = list.filter((c) => c.url.includes(ONLY));
  }
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(list, null, 2));
  console.log(`[list] ${list.length} guides → ${path.relative(ROOT, path.join(OUT, "index.json"))}`);

  for (const card of list) {
    const slug = slugFromUrl(card.url);
    try {
      const art = await scrapeArticle(page, card.url);
      const record = { slug, source_url: card.url, card, ...art };
      if (WANT_IMAGES) {
        const dir = path.join(IMAGES_DIR, slug);
        fs.mkdirSync(dir, { recursive: true });
        const localImages = [];
        let i = 0;
        for (const u of [art.hero, ...art.images].filter(Boolean)) {
          const abs = new URL(u, card.url).toString();
          const rel = await downloadImage(ctx, abs, dir, i++);
          localImages.push({ src: abs, local: rel });
        }
        record.local_images = localImages;
      }
      fs.writeFileSync(path.join(ARTICLES_DIR, `${slug}.json`), JSON.stringify(record, null, 2));
    } catch (e) {
      console.warn(`[article] failed ${card.url}: ${e.message}`);
    }
  }

  await browser.close();
  console.log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
