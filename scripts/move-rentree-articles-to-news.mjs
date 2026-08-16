#!/usr/bin/env node
/**
 * Move Rentrée 2026 articles from `guides` blog → main `news` blog.
 *   node --env-file=apps/.env scripts/move-rentree-articles-to-news.mjs
 */

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API = `https://${SHOP}/admin/api/${process.env.SHOPIFY_API_VERSION || "2026-04"}/graphql.json`;

const HANDLES = [
  "chaussures-sneakers-rentree-2026",
  "sneakers-rentree-2026-ado-fille",
  "sneakers-rentree-2026-ado-garcon",
  "chaussures-rentree-2026-fille",
  "chaussures-rentree-2026-garcon",
];

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

async function main() {
  const data = await gql(`{
    blogs(first: 10) {
      nodes {
        id handle
        articles(first: 20) { nodes { id handle } }
      }
    }
  }`);

  const news = data.blogs.nodes.find((b) => b.handle === "news");
  const guides = data.blogs.nodes.find((b) => b.handle === "guides");
  if (!news?.id || !guides) throw new Error("news or guides blog missing");
  const newsId = news.id;

  const byHandle = Object.fromEntries(guides.articles.nodes.map((a) => [a.handle, a]));

  for (const handle of HANDLES) {
    const article = byHandle[handle];
    if (!article) {
      console.warn(`⚠ not in guides: ${handle}`);
      continue;
    }

    const result = await gql(
      `mutation MoveArticle($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article { handle blog { handle } }
          userErrors { field message }
        }
      }`,
      { id: article.id, article: { blogId: newsId } },
    );

    const errors = result.articleUpdate.userErrors;
    if (errors?.length) throw new Error(JSON.stringify(errors));

    console.log(`✓ ${handle} → blogs/news`);
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log("\nArticles now on https://www.resell-lausanne.ch/blogs/news");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
