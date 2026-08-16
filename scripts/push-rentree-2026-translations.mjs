#!/usr/bin/env node
/**
 * Push Rentrée 2026 translations:
 * 1. editorial_i18n JSON metafield (works without translation scopes)
 * 2. translationsRegister for article title/summary/SEO when scopes available
 *
 *   node --env-file=apps/.env scripts/push-rentree-2026-translations.mjs
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FR_DATA = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data/rentree-2026-guides.json"), "utf8"),
);
const I18N_OVERRIDES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data/rentree-2026-i18n-de-en.json"), "utf8"),
);

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
let useShopifyCli = process.env.USE_SHOPIFY_CLI === "1";

function gqlViaCli(query, variables = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shopify-gql-"));
  const queryFile = path.join(dir, "query.graphql");
  const varFile = path.join(dir, "vars.json");
  const outFile = path.join(dir, "out.json");

  try {
    fs.writeFileSync(queryFile, query);
    fs.writeFileSync(varFile, JSON.stringify(variables));
    const args = [
      "store",
      "execute",
      "-s",
      SHOP,
      "--query-file",
      queryFile,
      "--variable-file",
      varFile,
      "-j",
      "--output-file",
      outFile,
    ];
    if (/^\s*mutation/i.test(query)) args.push("--allow-mutations");

    execFileSync("shopify", args, {
      env: {
        ...process.env,
        SHOPIFY_CLI_AGENT_INFO: process.env.SHOPIFY_CLI_AGENT_INFO || "n:cursor|v:1|p:cursor",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    return JSON.parse(fs.readFileSync(outFile, "utf8"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function gqlViaToken(query, variables = {}) {
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

async function gql(query, variables = {}) {
  if (useShopifyCli) return gqlViaCli(query, variables);

  try {
    return await gqlViaToken(query, variables);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("ACCESS_DENIED")) {
      useShopifyCli = true;
      console.log("Token sans read_content/write_content → fallback Shopify CLI\n");
      return gqlViaCli(query, variables);
    }
    throw err;
  }
}

async function getScopes() {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_scopes.json`, {
    headers: { "X-Shopify-Access-Token": TOKEN },
  });
  const json = await res.json();
  return new Set(json.access_scopes.map((s) => s.handle));
}

function buildFrBundle(spec) {
  const chips = spec.chips || [];
  return {
    display_title: spec.title,
    meta_title: spec.metaTitle,
    meta_description: spec.metaDescription,
    eyebrow: spec.eyebrow || "",
    deck: spec.deck || "",
    intro: spec.intro || "",
    chips,
    callout_title: spec.callout_title || "",
    callout_text: spec.callout_text || "",
    section_heading: spec.section_heading || "",
    section_body: (spec.section_paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join(""),
    how_to_heading: spec.how_to_heading || "",
    how_to_body: spec.how_to_body || "",
    table_cols: spec.table_cols || [],
    table_rows: spec.table_rows || [],
    products: (spec.products || []).map((p) => ({
      rank: p.rank,
      title: p.title,
      description: p.description,
      score_label: p.score_label,
      score: p.score,
    })),
    checklist: spec.checklist || [],
    verdict: spec.verdict ? `<p>${escapeHtml(spec.verdict)}</p>` : "",
    checklist_parent: !!spec.checklist_parent,
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildI18nBundle(handle, spec) {
  const fr = buildFrBundle(spec);
  const overrides = I18N_OVERRIDES[handle] || {};
  return {
    fr,
    de: { ...fr, ...(overrides.de || {}) },
    en: { ...fr, ...(overrides.en || {}) },
  };
}

async function getArticles() {
  const data = await gql(
    `{ blogs(first: 1, query: "handle:news") {
      nodes { articles(first: 50) { nodes { id handle title } } }
    }}`,
  );
  return data.blogs.nodes[0].articles.nodes;
}

async function pushI18nMetafield(articleId, bundle) {
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
            namespace: "custom",
            key: "editorial_i18n",
            type: "json",
            value: JSON.stringify(bundle),
          },
        ],
      },
    },
  );
  const errors = data.articleUpdate.userErrors;
  if (errors?.length) throw new Error(JSON.stringify(errors));
}

async function registerTranslations(articleId, locale, entries) {
  const resource = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key digest locale value }
      }
    }`,
    { id: articleId },
  );
  const content = resource.translatableResource?.translatableContent || [];
  const digestByKey = Object.fromEntries(content.map((c) => [c.key, c.digest]));

  const translations = [];
  for (const [key, value] of Object.entries(entries)) {
    if (value == null || value === "") continue;
    const digest = digestByKey[key];
    if (!digest) continue;
    translations.push({ locale, key, value, translatableContentDigest: digest });
  }

  if (!translations.length) return 0;

  const data = await gql(
    `mutation($id: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $translations) {
        userErrors { field message }
        translations { key locale }
      }
    }`,
    { id: articleId, translations },
  );
  const errors = data.translationsRegister.userErrors;
  if (errors?.length) throw new Error(JSON.stringify(errors));
  return data.translationsRegister.translations.length;
}

async function main() {
  const scopes = await getScopes();
  const hasTranslationApi =
    scopes.has("read_translations") && scopes.has("write_translations");

  console.log(`Shop: ${SHOP}`);
  console.log(`Translation API: ${hasTranslationApi ? "yes" : "NO — update apps/.env token after reinstall"}`);
  if (useShopifyCli) console.log("Auth: Shopify CLI");
  console.log("");

  const articles = await getArticles();
  const byHandle = Object.fromEntries(articles.map((a) => [a.handle, a]));

  const specs = [
    ["chaussures-sneakers-rentree-2026", FR_DATA.hub],
    ...Object.entries(FR_DATA.guides),
  ];

  for (const [handle, spec] of specs) {
    const article = byHandle[handle];
    if (!article) {
      console.warn(`⚠ article missing: ${handle}`);
      continue;
    }

    const bundle = buildI18nBundle(handle, spec);
    await pushI18nMetafield(article.id, bundle);
    console.log(`✓ editorial_i18n → ${handle}`);

    if (hasTranslationApi) {
      for (const locale of ["de", "en"]) {
        const loc = bundle[locale];
        const count = await registerTranslations(article.id, locale, {
          title: loc.display_title,
          summary_html: loc.meta_description,
          body_html: loc.intro ? `<p>${loc.intro}</p>` : "",
          meta_title: loc.meta_title,
          meta_description: loc.meta_description,
        });
        console.log(`  ↳ ${locale}: ${count} translations registered`);
      }
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  if (!hasTranslationApi) {
    console.log("\nPour activer translationsRegister:");
    console.log("  1. Admin → Develop apps → cocher read/write_translations + read_locales");
    console.log("  2. Reinstall → copier nouveau shpat dans apps/.env");
    console.log("  3. Relancer ce script");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
