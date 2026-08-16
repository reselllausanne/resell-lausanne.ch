#!/usr/bin/env node
/**
 * Create authentication-guide articles on Shopify from data/auth-guides/*.json
 *
 * Each JSON file shape:
 *   {
 *     "handle": "...", "title": "...", "summary": "...",
 *     "seo_title": "...", "seo_description": "...",
 *     "tags": ["guide-authentification", ...],
 *     "image_url": "https://...", "image_alt": "...",
 *     "source_credit": { "name": "...", "url": "..." },
 *     "body_html": "..."   // includes ag-lead, ag-tldr, ag-checks, etc.
 *   }
 *
 * Usage:
 *   node --env-file=apps/.env scripts/create-auth-guides.mjs
 *   node --env-file=apps/.env scripts/create-auth-guides.mjs --dry-run
 *   node --env-file=apps/.env scripts/create-auth-guides.mjs --only=<handle>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const BLOG_HANDLE = process.env.BLOG_HANDLE || "news";
const DATA_DIR = path.join(ROOT, "data/auth-guides");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const DRAFT = args.includes("--draft");
const UPDATE = args.includes("--update");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1] || null;

if (!SHOP || !TOKEN) {
  console.error("Missing SHOP/SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_TOKEN in env.");
  process.exit(1);
}

const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

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

async function getBlog() {
  const data = await gql(
    `query($query: String!) {
      blogs(first: 1, query: $query) {
        nodes { id handle title articles(first: 100) { nodes { handle } } }
      }
    }`,
    { query: `handle:${BLOG_HANDLE}` },
  );
  return data.blogs.nodes[0] || null;
}

async function createArticle(blogId, art) {
  const input = {
    blogId,
    title: art.title,
    handle: art.handle,
    author: { name: art.author || "Authentification Resell Lausanne" },
    body: art.body_html,
    summary: art.summary,
    tags: art.tags,
    isPublished: DRAFT ? false : art.published !== false,
  };
  if (art.image_url) input.image = { url: art.image_url, altText: art.image_alt };
  const data = await gql(
    `mutation($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article { id handle title image { url } }
        userErrors { field message }
      }
    }`,
    { article: input },
  );
  const r = data.articleCreate;
  if (r.userErrors?.length) throw new Error(`${art.handle}: ${JSON.stringify(r.userErrors)}`);
  return r.article;
}

async function findArticleByHandle(_blogId, handle) {
  const data = await gql(
    `query($q: String!) { articles(first: 5, query: $q) { nodes { id handle } } }`,
    { q: `handle:${handle}` },
  );
  return data.articles?.nodes?.find((a) => a.handle === handle) || null;
}

async function updateArticleBody(articleId, art) {
  const input = {
    title: art.title,
    body: art.body_html,
    summary: art.summary,
    tags: art.tags,
    isPublished: DRAFT ? false : art.published !== false,
  };
  if (art.image_url) input.image = { url: art.image_url, altText: art.image_alt };
  const data = await gql(
    `mutation($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        article { id handle title }
        userErrors { field message }
      }
    }`,
    { id: articleId, article: input },
  );
  const r = data.articleUpdate;
  if (r.userErrors?.length) throw new Error(`${art.handle}: ${JSON.stringify(r.userErrors)}`);
  return r.article;
}

async function setSeo(articleId, title, description) {
  const data = await gql(
    `mutation($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) { userErrors { field message } }
    }`,
    {
      id: articleId,
      article: {
        metafields: [
          { namespace: "global", key: "title_tag", value: title, type: "single_line_text_field" },
          {
            namespace: "global",
            key: "description_tag",
            value: description,
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
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data dir not found: ${DATA_DIR}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
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
    const art = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
    if (ONLY && art.handle !== ONLY) continue;
    if (!art.handle || !art.title || !art.body_html) {
      console.warn(`Skip ${file}: missing handle/title/body_html`);
      continue;
    }
    if (existing.has(art.handle)) {
      if (!UPDATE) {
        console.log(`↷ skip ${art.handle} (exists, use --update to overwrite)`);
        skipped += 1;
        continue;
      }
      if (DRY_RUN) {
        console.log(`DRY UPDATE ${art.handle} — ${art.title}`);
        continue;
      }
      const existingArticle = await findArticleByHandle(blog.id, art.handle);
      await updateArticleBody(existingArticle.id, art);
      if (art.seo_title && art.seo_description) {
        await setSeo(existingArticle.id, art.seo_title, art.seo_description);
      }
      console.log(`↻ updated ${art.handle}`);
      created += 1;
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    if (DRY_RUN) {
      console.log(`DRY ${art.handle} — ${art.title}`);
      continue;
    }
    const a = await createArticle(blog.id, art);
    if (art.seo_title && art.seo_description) {
      await setSeo(a.id, art.seo_title, art.seo_description);
    }
    console.log(`✓ ${a.handle} → ${a.image?.url || "no image"}`);
    created += 1;
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`Done. created=${created} skipped=${skipped}${DRY_RUN ? " (dry-run)" : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
