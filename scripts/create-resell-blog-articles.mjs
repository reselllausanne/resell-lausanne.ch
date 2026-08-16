#!/usr/bin/env node
/**
 * Import Resell blog pack into Shopify blog `news`.
 *
 * Usage:
 *   node --env-file=apps/.env scripts/create-resell-blog-articles.mjs
 *   node --env-file=apps/.env scripts/create-resell-blog-articles.mjs --dry-run
 *   node --env-file=apps/.env scripts/create-resell-blog-articles.mjs --only=asics-gel-kayano-14-vs-gel-nyc-vs-gel-1130
 *
 * Images: Pexels (free license) — generic stock, not brand official assets.
 */

import fs from "node:fs";
import path from "node:path";

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const PACK_DIR =
  process.env.BLOG_PACK_DIR ||
  path.join(process.env.HOME || "", "Downloads/resell_blog_pack_10_articles_plus_bonus");
const BLOG_HANDLE = process.env.BLOG_HANDLE || "news";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1] || null;

if (!SHOP || !TOKEN) {
  console.error("Missing SHOP/SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN in env.");
  process.exit(1);
}

const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

/** @type {Record<string, { url: string, alt: string }>} */
const IMAGES = {
  "sites-sneakers-retours-suisse": {
    url: "https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Paire de sneakers dans leur boîte",
  },
  "acheter-sneakers-authentiques-suisse": {
    url: "https://images.pexels.com/photos/1598505/pexels-photo-1598505.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Mur de boîtes à sneakers en boutique",
  },
  "guide-tailles-nike-dunk-sb-dunk": {
    url: "https://images.pexels.com/photos/1464625/pexels-photo-1464625.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Sneakers blanches vues de dessus",
  },
  "reconnaitre-fausse-air-jordan-1-travis-scott": {
    url: "https://images.pexels.com/photos/6775632/pexels-photo-6775632.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Sneakers rouges sur fond neutre",
  },
  "asics-gel-kayano-14-vs-gel-nyc-vs-gel-1130": {
    url: "https://images.pexels.com/photos/2526875/pexels-photo-2526875.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Plusieurs paires de sneakers running",
  },
  "adidas-handball-spezial-suisse": {
    url: "https://images.pexels.com/photos/1244625/pexels-photo-1244625.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Sneakers en daim sur fond clair",
  },
  "nike-tn-air-max-plus-guide-suisse": {
    url: "https://images.pexels.com/photos/2529156/pexels-photo-2529156.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Sneakers colorées sur étagère",
  },
  "fear-of-god-essentials-suisse-guide-tailles-authenticite": {
    url: "https://images.pexels.com/photos/1183266/pexels-photo-1183266.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Hoodie gris et streetwear",
  },
  "crampons-foot-suisse-fg-sg-ag-tf": {
    url: "https://images.pexels.com/photos/274422/pexels-photo-274422.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Crampons de football sur gazon",
  },
  "chrome-hearts-suisse-guide-achat-authenticite": {
    url: "https://images.pexels.com/photos/1926769/pexels-photo-1926769.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Bijoux argent sur fond sombre",
  },
  "labubu-pop-mart-suisse-authenticite": {
    url: "https://images.pexels.com/photos/8133177/pexels-photo-8133177.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Peluches et collectibles colorés",
  },
};

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

function parseArticleFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const meta = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^<!--\s*(\w+):\s*(.*?)\s*-->$/);
    if (!m) break;
    meta[m[1]] = m[2];
  }
  const body = raw.replace(/^(?:<!--[\s\S]*?-->\s*)+/m, "").trim();
  const tags = (meta.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    title: meta.title,
    meta_title: meta.meta_title,
    meta_description: meta.meta_description,
    handle: meta.handle,
    author: meta.author || "Rédaction Resell Lausanne",
    tags,
    body,
  };
}

async function getBlog() {
  const data = await gql(
    `query($query: String!) {
      blogs(first: 1, query: $query) {
        nodes {
          id
          handle
          title
          articles(first: 100) { nodes { handle } }
        }
      }
    }`,
    { query: `handle:${BLOG_HANDLE}` },
  );
  return data.blogs.nodes[0] || null;
}

async function createArticle(blogId, article, image) {
  const data = await gql(
    `mutation($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article { id handle title image { url } }
        userErrors { field message }
      }
    }`,
    {
      article: {
        blogId,
        title: article.title,
        author: { name: article.author },
        handle: article.handle,
        body: article.body,
        summary: article.meta_description,
        tags: article.tags,
        isPublished: true,
        image: { url: image.url, altText: image.alt },
      },
    },
  );
  const result = data.articleCreate;
  if (result.userErrors?.length) {
    throw new Error(`${article.handle}: ${JSON.stringify(result.userErrors)}`);
  }
  return result.article;
}

async function updateArticleSeo(articleId, metaTitle, metaDescription) {
  const data = await gql(
    `mutation($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        userErrors { field message }
      }
    }`,
    {
      id: articleId,
      article: {
        metafields: [
          {
            namespace: "global",
            key: "title_tag",
            value: metaTitle,
            type: "single_line_text_field",
          },
          {
            namespace: "global",
            key: "description_tag",
            value: metaDescription,
            type: "single_line_text_field",
          },
        ],
      },
    },
  );
  const errors = data.articleUpdate.userErrors;
  if (errors?.length) throw new Error(JSON.stringify(errors));
}

async function main() {
  if (!fs.existsSync(PACK_DIR)) {
    console.error(`Pack not found: ${PACK_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(PACK_DIR)
    .filter((f) => /^\d{2}_.+\.html$/.test(f))
    .sort();

  const blog = await getBlog();
  if (!blog) {
    console.error(`Blog handle "${BLOG_HANDLE}" not found.`);
    process.exit(1);
  }

  const existing = new Set(blog.articles.nodes.map((a) => a.handle));
  console.log(`Blog: ${blog.title} (${blog.handle}) — ${existing.size} articles existants`);

  let created = 0;
  let skipped = 0;

  for (const file of files) {
    const article = parseArticleFile(path.join(PACK_DIR, file));
    if (!article.handle || !article.title) {
      console.warn(`Skip ${file}: missing handle/title`);
      continue;
    }
    if (ONLY && article.handle !== ONLY) continue;
    if (existing.has(article.handle)) {
      console.log(`↷ skip ${article.handle} (exists)`);
      skipped += 1;
      continue;
    }

    const image = IMAGES[article.handle];
    if (!image) {
      console.warn(`Skip ${article.handle}: no image mapping`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`DRY ${article.handle} — ${article.title}`);
      continue;
    }

    const createdArticle = await createArticle(blog.id, article, image);
    await updateArticleSeo(createdArticle.id, article.meta_title, article.meta_description);
    console.log(`✓ ${createdArticle.handle} → ${createdArticle.image?.url || "no image"}`);
    created += 1;
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`Done. created=${created} skipped=${skipped}${DRY_RUN ? " (dry-run)" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
