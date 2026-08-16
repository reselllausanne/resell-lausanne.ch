#!/usr/bin/env node
/**
 * Seed Rentrée 2026 editorial campaign in Shopify Admin.
 *
 * - Creates blog `guides` if missing
 * - Creates/updates hub + 4 guide articles (templateSuffix, SEO, tags, hero)
 * - Writes per-guide theme templates with collection/product GIDs
 *
 * Usage:
 *   node --env-file=apps/.env scripts/seed-rentree-2026-editorial.mjs
 *   node --env-file=apps/.env scripts/seed-rentree-2026-editorial.mjs --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const THEME_DIR = path.join(ROOT, "fullstack_2_3_1");
const DATA_PATH = path.join(__dirname, "data/rentree-2026-guides.json");

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const STOREFRONT = process.env.STOREFRONT_URL || "https://www.resell-lausanne.ch";
const BLOG_HANDLE = "news";

const DRY_RUN = process.argv.includes("--dry-run");

/** Pexels — libre de droits, placeholders jusqu'à upload manuel */
const HERO_IMAGES = {
  "chaussures-sneakers-rentree-2026": {
    url: "https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg?auto=compress&cs=tinysrgb&w=1920",
    alt: "Sneakers de rentrée scolaire — guide Resell Lausanne 2026",
  },
  "sneakers-rentree-2026-ado-fille": {
    url: "https://images.pexels.com/photos/7688336/pexels-photo-7688336.jpeg?auto=compress&cs=tinysrgb&w=1920",
    alt: "Ado fille en tenue de rentrée avec sneakers visibles",
  },
  "sneakers-rentree-2026-ado-garcon": {
    url: "https://images.pexels.com/photos/8617500/pexels-photo-8617500.jpeg?auto=compress&cs=tinysrgb&w=1920",
    alt: "Ado garçon en streetwear avec sneakers visibles",
  },
  "chaussures-rentree-2026-fille": {
    url: "https://images.pexels.com/photos/8613089/pexels-photo-8613089.jpeg?auto=compress&cs=tinysrgb&w=1920",
    alt: "Enfant fille en tenue scolaire avec sneakers",
  },
  "chaussures-rentree-2026-garcon": {
    url: "https://images.pexels.com/photos/8613310/pexels-photo-8613310.jpeg?auto=compress&cs=tinysrgb&w=1920",
    alt: "Enfant garçon en tenue de rentrée avec sneakers",
  },
};

const RELATED_BY_HANDLE = {
  "sneakers-rentree-2026-ado-fille": [
    { handle: "sneakers-rentree-2026-ado-garcon", label: "12–18 ans", title: "Guide ado garçon" },
    { handle: "chaussures-rentree-2026-fille", label: "6–12 ans", title: "Guide enfant fille" },
    { handle: "chaussures-rentree-2026-garcon", label: "6–12 ans", title: "Guide enfant garçon" },
  ],
  "sneakers-rentree-2026-ado-garcon": [
    { handle: "sneakers-rentree-2026-ado-fille", label: "12–18 ans", title: "Guide ado fille" },
    { handle: "chaussures-rentree-2026-fille", label: "6–12 ans", title: "Guide enfant fille" },
    { handle: "chaussures-rentree-2026-garcon", label: "6–12 ans", title: "Guide enfant garçon" },
  ],
  "chaussures-rentree-2026-fille": [
    { handle: "sneakers-rentree-2026-ado-fille", label: "12–18 ans", title: "Guide ado fille" },
    { handle: "sneakers-rentree-2026-ado-garcon", label: "12–18 ans", title: "Guide ado garçon" },
    { handle: "chaussures-rentree-2026-garcon", label: "6–12 ans", title: "Guide enfant garçon" },
  ],
  "chaussures-rentree-2026-garcon": [
    { handle: "sneakers-rentree-2026-ado-fille", label: "12–18 ans", title: "Guide ado fille" },
    { handle: "sneakers-rentree-2026-ado-garcon", label: "12–18 ans", title: "Guide ado garçon" },
    { handle: "chaussures-rentree-2026-fille", label: "6–12 ans", title: "Guide enfant fille" },
  ],
};

if (!SHOP || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN");
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
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function getBlog(handle) {
  const data = await gql(
    `query($q: String!) {
      blogs(first: 1, query: $q) {
        nodes {
          id handle title
          articles(first: 100) { nodes { id handle title templateSuffix } }
        }
      }
    }`,
    { q: `handle:${handle}` },
  );
  return data.blogs.nodes[0] || null;
}

async function ensureNewsBlog() {
  const existing = await getBlog(BLOG_HANDLE);
  if (existing) return existing;

  throw new Error(`Blog "${BLOG_HANDLE}" not found — create it in Shopify Admin first.`);
}

async function resolveCollection(handle) {
  const data = await gql(
    `query($h: String!) {
      collectionByHandle(handle: $h) {
        id handle title
        products(first: 1) { nodes { id handle title featuredImage { url altText } } }
      }
    }`,
    { h: handle },
  );
  return data.collectionByHandle;
}

async function resolveCollections(handles) {
  /** @type {Record<string, { id: string, productId?: string }>} */
  const map = {};
  for (const h of handles) {
    const col = await resolveCollection(h);
    if (col) {
      map[h] = {
        id: col.id,
        productId: col.products?.nodes?.[0]?.id,
      };
    } else {
      console.warn(`⚠ collection missing: ${h}`);
    }
    await sleep(150);
  }
  return map;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildGuideTemplate(guide, collectionsMap) {
  const blocks = {};
  const blockOrder = [];

  blocks["callout-main"] = {
    type: "callout",
    settings: {
      title: guide.callout_title || "Conseil",
      text: guide.callout_text || "",
    },
  };
  blockOrder.push("callout-main");

  if (guide.section_heading) {
    const bodyHtml = (guide.section_paragraphs || [])
      .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
      .join("");
    blocks["section-main"] = {
      type: "content_section",
      settings: {
        heading: guide.section_heading,
        body: bodyHtml || "<p></p>",
      },
    };
    blockOrder.push("section-main");
  }

  guide.products.forEach((pick, i) => {
    const key = `pick-${i + 1}`;
    const colHandle = guide.collection_handles?.[i];
    const col = colHandle ? collectionsMap[colHandle] : null;
    /** @type {Record<string, unknown>} */
    const settings = {
      rank_label: pick.rank,
      title: pick.title,
      description: pick.description,
      score_label: pick.score_label,
      score: pick.score,
    };
    if (col?.productId) settings.product = col.productId;
    if (col?.id) settings.collection = col.id;
    blocks[key] = { type: "product_pick", settings };
    blockOrder.push(key);
  });

  guide.table_rows.forEach((row, i) => {
    const key = `row-${i + 1}`;
    blocks[key] = { type: "table_row", settings: row };
    blockOrder.push(key);
  });

  (RELATED_BY_HANDLE[guide.handle] || []).forEach((rel, i) => {
    const key = `related-${i + 1}`;
    blocks[key] = {
      type: "related_guide",
      settings: {
        article_handle: rel.handle,
        segment_label: rel.label,
        title: rel.title,
      },
    };
    blockOrder.push(key);
  });

  const template = {
    sections: {
      main: {
        type: "main-article-editorial",
        blocks,
        block_order: blockOrder,
        settings: {
          color_scheme: "scheme-1",
          eyebrow: guide.eyebrow,
          deck: guide.deck,
          intro: guide.intro,
          chips: (guide.chips || []).join("\n"),
          hero_overlay: 66,
          table_col_1: guide.table_cols?.[0] || "",
          table_col_2: guide.table_cols?.[1] || "",
          table_col_3: guide.table_cols?.[2] || "",
          how_to_heading: guide.how_to_heading,
          how_to_body: guide.how_to_body,
          checklist_parent: !!guide.checklist_parent,
          checklist: (guide.checklist || []).join("\n"),
          verdict: `<p>${(guide.verdict || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`,
          hub_article_handle: "chaussures-sneakers-rentree-2026",
          show_promo: true,
          promo_primary_url: "/products/carte-cadeau-resell-lausanne",
          promo_primary_label: "Acheter la carte cadeau",
          padding_bottom: 60,
        },
      },
      related: {
        type: "resell-blog-related",
        settings: {
          color_scheme: "scheme-1",
          max_articles: 3,
          padding_top: 48,
          padding_bottom: 72,
        },
      },
    },
    order: ["main", "related"],
  };

  return template;
}

function writeGuideTemplates(guides, collectionsByGuide) {
  for (const [handle, guide] of Object.entries(guides)) {
    const suffix = guide.templateSuffix;
    const file = path.join(THEME_DIR, "templates", `article.${suffix}.json`);
    const template = buildGuideTemplate(guide, collectionsByGuide[handle] || {});
    fs.writeFileSync(file, JSON.stringify(template, null, 2) + "\n");
    console.log(`✓ template article.${suffix}.json`);
  }
}

async function upsertArticle(blogId, spec, existingMap) {
  const image = HERO_IMAGES[spec.handle];
  const tags = ["rentree-2026", "guides-achat", "suisse"];
  const body =
    spec.body ||
    `<p>${spec.intro || spec.metaDescription || ""}</p>`;

  const input = {
    blogId,
    title: spec.title,
    handle: spec.handle,
    author: { name: "Rédaction Resell Lausanne" },
    body,
    summary: spec.metaDescription,
    tags,
    isPublished: true,
    templateSuffix: spec.templateSuffix,
    ...(image ? { image: { url: image.url, altText: image.alt } } : {}),
  };

  const existing = existingMap.get(spec.handle);

  if (DRY_RUN) {
    console.log(`DRY ${existing ? "update" : "create"} ${spec.handle} → template ${spec.templateSuffix}`);
    return { handle: spec.handle };
  }

  let articleId;
  if (existing) {
    const data = await gql(
      `mutation($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article { id handle title templateSuffix image { url } }
          userErrors { field message }
        }
      }`,
      {
        id: existing.id,
        article: {
          title: input.title,
          body: input.body,
          summary: input.summary,
          tags: input.tags,
          isPublished: true,
          templateSuffix: input.templateSuffix,
          ...(image ? { image: input.image } : {}),
          metafields: seoMetafields(spec.metaTitle, spec.metaDescription),
        },
      },
    );
    if (data.articleUpdate.userErrors?.length) throw new Error(JSON.stringify(data.articleUpdate.userErrors));
    articleId = data.articleUpdate.article.id;
    console.log(`↻ updated ${spec.handle} (${spec.templateSuffix})`);
  } else {
    const data = await gql(
      `mutation($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article { id handle title templateSuffix image { url } }
          userErrors { field message }
        }
      }`,
      { article: input },
    );
    if (data.articleCreate.userErrors?.length) throw new Error(JSON.stringify(data.articleCreate.userErrors));
    articleId = data.articleCreate.article.id;
    console.log(`✓ created ${spec.handle} (${spec.templateSuffix})`);
  }

  await gql(
    `mutation($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        userErrors { field message }
      }
    }`,
    {
      id: articleId,
      article: { metafields: seoMetafields(spec.metaTitle, spec.metaDescription) },
    },
  );

  return { handle: spec.handle, id: articleId };
}

function seoMetafields(metaTitle, metaDescription) {
  return [
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
  ];
}

async function main() {
  const payload = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const { hub, guides } = payload;

  console.log(`Shop: ${SHOP}`);
  console.log(`Mode: ${DRY_RUN ? "dry-run" : "live"}\n`);

  /** @type {Record<string, Record<string, { id: string, productId?: string }>>} */
  const collectionsByGuide = {};
  for (const [handle, guide] of Object.entries(guides)) {
    console.log(`Resolving collections for ${handle}…`);
    collectionsByGuide[handle] = await resolveCollections(guide.collection_handles || []);
  }

  writeGuideTemplates(guides, collectionsByGuide);

  const blog = await ensureNewsBlog();
  const existingMap = new Map(blog.articles.nodes.map((a) => [a.handle, a]));

  await upsertArticle(blog.id, hub, existingMap);
  await sleep(400);

  for (const guide of Object.values(guides)) {
    await upsertArticle(blog.id, guide, existingMap);
    await sleep(400);
  }

  console.log("\nURLs (après push theme):");
  console.log(`  Hub:    ${STOREFRONT}/blogs/${BLOG_HANDLE}/${hub.handle}`);
  for (const g of Object.values(guides)) {
    console.log(`  Guide:  ${STOREFRONT}/blogs/${BLOG_HANDLE}/${g.handle}`);
  }
  console.log("\nHero images = Pexels placeholders. Remplace via Theme Editor → Image hero desktop/mobile.");
  console.log("Push theme pour charger templates article.editorial-*");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
