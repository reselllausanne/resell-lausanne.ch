#!/usr/bin/env node
/**
 * Publish or update a rich Resell blog article (catalog images + component HTML).
 *
 * Usage:
 *   node --env-file=apps/.env scripts/publish-rich-blog-article.mjs --recipe=spezial
 *   node --env-file=apps/.env scripts/publish-rich-blog-article.mjs --recipe=spezial --dry-run
 *   node --env-file=apps/.env scripts/publish-rich-blog-article.mjs --recipe=spezial --draft
 *
 * Requires theme push for new resell-blog.css component styles (local edit only).
 */

import { buildAdidasSpezialArticle } from "./lib/rich-blog-html.mjs";

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const BLOG_HANDLE = process.env.BLOG_HANDLE || "news";
const STOREFRONT = process.env.STOREFRONT_URL || "https://www.resell-lausanne.ch";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const AS_DRAFT = args.includes("--draft");
const RECIPE = (args.find((a) => a.startsWith("--recipe=")) || "").split("=")[1] || "spezial";

if (!SHOP || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.");
  process.exit(1);
}

const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

/** @type {Record<string, { handle: string, title: string, metaTitle: string, metaDescription: string, tags: string[], collectionHandle: string, build: Function }>} */
const RECIPES = {
  spezial: {
    handle: "adidas-handball-spezial-suisse",
    title: "Adidas Handball Spezial : histoire, coloris et achat authentique en Suisse",
    metaTitle: "Adidas Spezial Suisse — guide achat authentique 2026 | Resell",
    metaDescription:
      "Guide Adidas Handball Spezial en Suisse : coloris, tailles, prix CHF, fausse vs vraie et où acheter authentique avec certificat — Resell Lausanne.",
    tags: ["guides-achat", "suisse", "comparatifs"],
    collectionHandle: "adidas-spezial",
    build: buildAdidasSpezialArticle,
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

async function fetchCollectionProducts(handle, limit = 8) {
  const data = await gql(
    `query($handle: String!, $limit: Int!) {
      collectionByHandle(handle: $handle) {
        handle
        title
        products(first: $limit) {
          nodes {
            title
            handle
            onlineStoreUrl
            featuredImage { url altText }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
          }
        }
      }
    }`,
    { handle, limit },
  );
  const col = data.collectionByHandle;
  if (!col) throw new Error(`Collection not found: ${handle}`);
  return col.products.nodes.map((p) => ({
    title: p.title,
    url: p.onlineStoreUrl || `${STOREFRONT}/products/${p.handle}`,
    image: p.featuredImage?.url,
    alt: p.featuredImage?.altText || p.title,
    price: p.priceRangeV2?.minVariantPrice
      ? `${Math.round(Number(p.priceRangeV2.minVariantPrice.amount))} ${p.priceRangeV2.minVariantPrice.currencyCode}`
      : "",
  })).filter((p) => p.image);
}

async function getBlogWithArticles() {
  const data = await gql(
    `query($query: String!) {
      blogs(first: 1, query: $query) {
        nodes {
          id
          handle
          title
          articles(first: 100) { nodes { id handle title } }
        }
      }
    }`,
    { query: `handle:${BLOG_HANDLE}` },
  );
  return data.blogs.nodes[0] || null;
}

async function createArticle(blogId, recipe, body, heroImage) {
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
        title: recipe.title,
        author: { name: "Rédaction Resell Lausanne" },
        handle: recipe.handle,
        body,
        summary: recipe.metaDescription,
        tags: recipe.tags,
        isPublished: !AS_DRAFT,
        image: { url: heroImage.url, altText: heroImage.alt },
      },
    },
  );
  const result = data.articleCreate;
  if (result.userErrors?.length) throw new Error(JSON.stringify(result.userErrors));
  return result.article;
}

async function updateArticle(articleId, recipe, body, heroImage) {
  const data = await gql(
    `mutation($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        article { id handle title image { url } isPublished }
        userErrors { field message }
      }
    }`,
    {
      id: articleId,
      article: {
        title: recipe.title,
        body,
        summary: recipe.metaDescription,
        tags: recipe.tags,
        isPublished: !AS_DRAFT,
        image: { url: heroImage.url, altText: heroImage.alt },
        metafields: [
          {
            namespace: "global",
            key: "title_tag",
            value: recipe.metaTitle,
            type: "single_line_text_field",
          },
          {
            namespace: "global",
            key: "description_tag",
            value: recipe.metaDescription,
            type: "single_line_text_field",
          },
        ],
      },
    },
  );
  const result = data.articleUpdate;
  if (result.userErrors?.length) throw new Error(JSON.stringify(result.userErrors));
  return result.article;
}

async function main() {
  const recipe = RECIPES[RECIPE];
  if (!recipe) {
    console.error(`Unknown recipe: ${RECIPE}. Available: ${Object.keys(RECIPES).join(", ")}`);
    process.exit(1);
  }

  const products = await fetchCollectionProducts(recipe.collectionHandle);
  if (!products.length) {
    console.error(`No products with images in ${recipe.collectionHandle}`);
    process.exit(1);
  }

  const body = recipe.build({ products });
  const heroImage = {
    url: products[0].image,
    alt: products[0].alt,
  };

  console.log(`Recipe: ${RECIPE}`);
  console.log(`Products: ${products.length} (hero: ${products[0].title})`);
  console.log(`Body length: ${body.length} chars`);
  console.log(`Mode: ${DRY_RUN ? "dry-run" : AS_DRAFT ? "draft" : "published"}`);

  if (DRY_RUN) {
    console.log("\n--- body preview (800 chars) ---\n");
    console.log(body.slice(0, 800));
    return;
  }

  const blog = await getBlogWithArticles();
  if (!blog) {
    console.error(`Blog "${BLOG_HANDLE}" not found.`);
    process.exit(1);
  }

  const existing = blog.articles.nodes.find((a) => a.handle === recipe.handle);

  let article;
  if (existing) {
    console.log(`Updating existing article: ${existing.handle}`);
    article = await updateArticle(existing.id, recipe, body, heroImage);
  } else {
    console.log(`Creating new article: ${recipe.handle}`);
    article = await createArticle(blog.id, recipe, body, heroImage);
    await updateArticle(article.id, recipe, body, heroImage);
  }

  const url = `${STOREFRONT}/blogs/${blog.handle}/${article.handle}`;
  console.log(`✓ ${article.isPublished === false ? "Draft" : "Published"}: ${url}`);
  console.log(`  Hero: ${article.image?.url || heroImage.url}`);
  console.log("\nPush theme (resell-blog.css) to see callouts + product strip styling live.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
