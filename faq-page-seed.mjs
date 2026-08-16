// faq-page-seed.mjs
// Idempotent FAQ seed for the main FAQ page categories/items.
//
// Usage:
//   node --env-file=.env faq-page-seed.mjs
//   node --env-file=.env faq-page-seed.mjs --dry-run
//
// Required token scopes:
//   read_metaobjects, write_metaobjects, write_metaobject_definitions
//
// Creates missing metaobject definitions automatically, then seeds entries.
// Env: SHOP or SHOPIFY_STORE_DOMAIN; SHOPIFY_ADMIN_TOKEN or SHOPIFY_ADMIN_ACCESS_TOKEN
//
// Legacy manual defs (only if auto-create disabled):
//   Type: page_faq_item
//     - question (single_line_text_field)
//     - answer (rich_text_field)
//
//   Type: page_faq_category
//     - slug (single_line_text_field)
//     - title (single_line_text_field)
//     - sort_order (number_integer)
//     - items (list.metaobject_reference)

import { readFile } from "node:fs/promises";

const SHOP = process.env.SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

if (!SHOP || !TOKEN) {
  console.error("Missing env: SHOP/SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN/SHOPIFY_ADMIN_ACCESS_TOKEN required.");
  process.exit(1);
}

const API = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const FAQ_MAIN_PATH = "fullstack_2_3_1/snippets/resell-faq-content-main.liquid";
const FAQ_LIVRAISON_PATH = "fullstack_2_3_1/snippets/resell-faq-livraison-article.liquid";
const FAQ_ECHANGES_PATH = "fullstack_2_3_1/snippets/resell-faq-echanges-article.liquid";

const META_TYPES = {
  category: "page_faq_category",
  item: "page_faq_item",
};

const CATEGORY_ORDER = [
  "livraison",
  "authenticite",
  "echanges-et-retours",
  "options-de-paiement",
  "prix-et-reductions",
  "guide-des-tailles",
  "a-propos-de-nous",
];

const CATEGORY_TITLES_FALLBACK = {
  livraison: "Livraison & délais",
  authenticite: "Authenticité",
  "echanges-et-retours": "Échanges et remboursements",
  "options-de-paiement": "Options de paiement",
  "prix-et-reductions": "Prix et réductions",
  "guide-des-tailles": "Guide des tailles",
  "a-propos-de-nous": "À propos de nous",
};

const EXPECTED_FIELD_KEYS = {
  [META_TYPES.item]: ["question", "answer"],
  [META_TYPES.category]: ["slug", "title", "sort_order", "items"],
};

const PLACEHOLDER_REPLACEMENTS = [
  { pattern: /\{\{\s*contact_url\s*\}\}/g, value: "mailto:contact@resell-lausanne.ch" },
  { pattern: /\{\{\s*url_notre_concept\s*\}\}/g, value: "/pages/notre-concept" },
];

const EXPECTED_FAQ_ITEMS_COUNT = 40;

const Q_METAOBJECT_DEF = `
  query MetaobjectDef($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      type
      fieldDefinitions {
        key
        name
        required
        type { name }
      }
    }
  }
`;

const M_METAOBJECT_UPSERT = `
  mutation UpsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject { id handle type }
      userErrors { field message code }
    }
  }
`;

const M_METAOBJECT_DEF_CREATE = `
  mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id type name }
      userErrors { field message code }
    }
  }
`;

const DEFINITION_SPECS = {
  [META_TYPES.item]: {
    name: "Page FAQ item",
    displayNameKey: "question",
    fieldDefinitions: [
      { key: "question", name: "Question", type: "single_line_text_field", required: true },
      { key: "answer", name: "Answer", type: "rich_text_field", required: true },
    ],
  },
};

function categoryDefinitionSpec(itemDefinitionId) {
  return {
    name: "Page FAQ category",
    displayNameKey: "title",
    fieldDefinitions: [
      { key: "slug", name: "Slug", type: "single_line_text_field", required: true },
      { key: "title", name: "Title", type: "single_line_text_field", required: true },
      { key: "sort_order", name: "Sort order", type: "number_integer", required: true },
      {
        key: "items",
        name: "Items",
        type: "list.metaobject_reference",
        required: true,
        validations: [{ name: "metaobject_definition_id", value: itemDefinitionId }],
      },
    ],
  };
}

async function gql(query, variables = {}) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt > 4) throw new Error(`HTTP ${res.status} after ${attempt} attempts`);
      const waitMs = 500 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const json = await res.json();
    if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    return json.data;
  }
}

function logUserErrors(prefix, errs) {
  if (!errs || errs.length === 0) return false;
  for (const err of errs) {
    console.error(`  x ${prefix}: ${err.message} (field=${(err.field || []).join(".")}, code=${err.code || "n/a"})`);
  }
  return true;
}

function definitionGuide(type) {
  if (type === META_TYPES.item) {
    return [
      "Type: page_faq_item",
      "- question: single_line_text_field",
      "- answer: rich_text_field",
    ];
  }
  return [
    "Type: page_faq_category",
    "- slug: single_line_text_field",
    "- title: single_line_text_field",
    "- sort_order: number_integer",
    "- items: list.metaobject_reference",
  ];
}

async function createDefinition(type, spec) {
  if (!spec) throw new Error(`No definition spec for '${type}'.`);

  if (DRY_RUN) {
    console.log(`  dry-run create definition '${type}'`);
    return true;
  }

  const data = await gql(M_METAOBJECT_DEF_CREATE, {
    definition: {
      type,
      name: spec.name,
      displayNameKey: spec.displayNameKey,
      access: { storefront: "PUBLIC_READ" },
      capabilities: { translatable: { enabled: true } },
      fieldDefinitions: spec.fieldDefinitions,
    },
  });

  const result = data.metaobjectDefinitionCreate;
  if (logUserErrors(`metaobjectDefinitionCreate ${type}`, result.userErrors)) {
    throw new Error(`Failed to create definition '${type}'.`);
  }

  console.log(`  ok Created definition '${type}' (${result.metaobjectDefinition?.id || "n/a"})`);
  return result.metaobjectDefinition?.id || null;
}

async function getDefinition(type) {
  const data = await gql(Q_METAOBJECT_DEF, { type });
  return data.metaobjectDefinitionByType;
}

async function ensureDefinition(type, spec) {
  const def = await getDefinition(type);
  if (!def) {
    console.log(`  missing '${type}' — creating…`);
    await createDefinition(type, spec);
    return;
  }

  const fieldKeys = new Set(def.fieldDefinitions.map((field) => field.key));
  const missing = EXPECTED_FIELD_KEYS[type].filter((key) => !fieldKeys.has(key));
  if (missing.length > 0) {
    console.error(`x Definition '${type}' missing fields: ${missing.join(", ")}`);
    for (const line of definitionGuide(type)) console.error(`  ${line}`);
    throw new Error(`Definition '${type}' invalid — fix manually in Admin.`);
  }

  console.log(`  ok Definition '${type}' with ${def.fieldDefinitions.length} fields`);
  return def;
}

async function preflightDefinitions() {
  console.log(`Preflight on ${SHOP} (api ${API_VERSION})${DRY_RUN ? " [DRY-RUN]" : ""}`);
  const itemDef = await ensureDefinition(META_TYPES.item, DEFINITION_SPECS[META_TYPES.item]);
  const itemDefinitionId = itemDef?.id || (await getDefinition(META_TYPES.item))?.id;
  if (!itemDefinitionId && !DRY_RUN) {
    throw new Error("Could not resolve page_faq_item definition id.");
  }
  await ensureDefinition(
    META_TYPES.category,
    categoryDefinitionSpec(itemDefinitionId || "gid://shopify/MetaobjectDefinition/DRY"),
  );
}

function decodeEntities(text) {
  const named = {
    amp: "&",
    nbsp: " ",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    eacute: "é",
    egrave: "è",
    ecirc: "ê",
    agrave: "à",
    ugrave: "ù",
    rsquo: "’",
    lsquo: "‘",
    ndash: "–",
    mdash: "—",
  };

  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, code) => {
    const lower = code.toLowerCase();
    if (named[lower]) return named[lower];
    if (lower.startsWith("#x")) {
      const value = Number.parseInt(lower.slice(2), 16);
      if (!Number.isNaN(value)) return String.fromCodePoint(value);
    } else if (lower.startsWith("#")) {
      const value = Number.parseInt(lower.slice(1), 10);
      if (!Number.isNaN(value)) return String.fromCodePoint(value);
    }
    return _;
  });
}

function stripTags(text) {
  return decodeEntities(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeAnswerHtml(html) {
  let value = html;
  for (const replacement of PLACEHOLDER_REPLACEMENTS) {
    value = value.replace(replacement.pattern, replacement.value);
  }
  return value.trim();
}

function parseInlineNodes(innerHtml) {
  const tokens = innerHtml.split(/(<[^>]+>)/g).filter(Boolean);
  const nodes = [];
  let bold = false;
  let currentLink = null;

  const appendText = (raw) => {
    const decoded = decodeEntities(raw).replace(/\s+/g, " ");
    if (!decoded.trim()) return;
    const node = { type: "text", value: decoded };
    if (bold) node.bold = true;

    if (currentLink) currentLink.children.push(node);
    else nodes.push(node);
  };

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      appendText(token);
      continue;
    }

    const tagMatch = token.match(/^<\/?\s*([a-z0-9]+)/i);
    if (!tagMatch) continue;
    const tag = tagMatch[1].toLowerCase();
    const isClosing = /^<\//.test(token);

    if (tag === "strong" || tag === "b") {
      bold = !isClosing;
      continue;
    }

    if (tag === "br") {
      appendText("\n");
      continue;
    }

    if (tag === "a") {
      if (isClosing) {
        currentLink = null;
      } else {
        const hrefMatch = token.match(/href\s*=\s*"([^"]+)"/i) || token.match(/href\s*=\s*'([^']+)'/i);
        const href = hrefMatch?.[1] || "";
        const linkNode = {
          type: "link",
          url: decodeEntities(href),
          title: null,
          target: null,
          children: [],
        };
        nodes.push(linkNode);
        currentLink = linkNode;
      }
      continue;
    }
  }

  return nodes.filter((node) => !(node.type === "link" && node.children.length === 0));
}

function htmlToRichTextAst(html) {
  const children = [];
  const blockRegex = /<(p|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = match[2];

    if (tag === "p") {
      const paragraphChildren = parseInlineNodes(inner);
      if (paragraphChildren.length > 0) {
        children.push({ type: "paragraph", children: paragraphChildren });
      }
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const listType = tag === "ul" ? "unordered" : "ordered";
      const listChildren = [];
      const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;
      while ((liMatch = liRegex.exec(inner)) !== null) {
        const liInline = parseInlineNodes(liMatch[1]);
        if (liInline.length > 0) {
          listChildren.push({ type: "list-item", children: liInline });
        }
      }
      if (listChildren.length > 0) {
        children.push({ type: "list", listType, children: listChildren });
      }
    }
  }

  if (children.length === 0) {
    const plain = stripTags(html);
    if (plain) {
      children.push({ type: "paragraph", children: [{ type: "text", value: plain }] });
    }
  }

  return JSON.stringify({ type: "root", children });
}

function parseFaqItemsFromHtml(html) {
  const items = [];
  const detailsRegex = /<details class="rl-faq-page__item">([\s\S]*?)<\/details>/gi;
  let match;

  while ((match = detailsRegex.exec(html)) !== null) {
    const block = match[1];
    const summaryMatch = block.match(/<summary>([\s\S]*?)<\/summary>/i);
    const answerMatch = block.match(/<div class="rl-faq-page__answer">([\s\S]*?)<\/div>/i);
    if (!summaryMatch || !answerMatch) continue;

    const question = stripTags(summaryMatch[1]);
    const answerHtml = normalizeAnswerHtml(answerMatch[1]);
    if (!question || !answerHtml) continue;

    items.push({ question, answerHtml });
  }

  return items;
}

function extractSections(mainSnippet) {
  const sections = new Map();
  const sectionRegex = /<section id="faq-([^"]+)" class="rl-faq-page__category">([\s\S]*?)<\/section>/gi;
  let match;

  while ((match = sectionRegex.exec(mainSnippet)) !== null) {
    const slug = match[1];
    const html = match[2];
    const titleMatch = html.match(/<h2>([\s\S]*?)<\/h2>/i);
    sections.set(slug, {
      title: titleMatch ? stripTags(titleMatch[1]) : CATEGORY_TITLES_FALLBACK[slug] || slug,
      html,
    });
  }

  return sections;
}

async function loadFaqData() {
  const [mainSnippet, livraisonSnippet, echangesSnippet] = await Promise.all([
    readFile(FAQ_MAIN_PATH, "utf8"),
    readFile(FAQ_LIVRAISON_PATH, "utf8"),
    readFile(FAQ_ECHANGES_PATH, "utf8"),
  ]);

  const sections = extractSections(mainSnippet);
  const categories = [];

  for (const [index, slug] of CATEGORY_ORDER.entries()) {
    let title = CATEGORY_TITLES_FALLBACK[slug] || slug;
    let items = [];

    if (slug === "livraison") {
      items = parseFaqItemsFromHtml(livraisonSnippet);
    } else if (slug === "echanges-et-retours") {
      items = parseFaqItemsFromHtml(echangesSnippet);
    } else if (sections.has(slug)) {
      const section = sections.get(slug);
      title = section.title || title;
      items = parseFaqItemsFromHtml(section.html);
    }

    if (items.length === 0) {
      throw new Error(`No FAQ items found for category '${slug}'.`);
    }

    categories.push({
      slug,
      title,
      sortOrder: index + 1,
      items,
    });
  }

  const totalItems = categories.reduce((sum, category) => sum + category.items.length, 0);
  if (totalItems !== EXPECTED_FAQ_ITEMS_COUNT) {
    throw new Error(`Expected ${EXPECTED_FAQ_ITEMS_COUNT} FAQ items, found ${totalItems}.`);
  }

  return categories;
}

const categoryHandle = (slug) => `page-faq-${slug}`;
const itemHandle = (slug, index) => `page-faq-${slug}-${index + 1}`;

async function upsertFaqItem(slug, index, item) {
  const handle = itemHandle(slug, index);
  const answerRichText = htmlToRichTextAst(item.answerHtml);

  if (DRY_RUN) {
    console.log(`    dry-run upsert ${META_TYPES.item}/${handle}`);
    return `gid://shopify/Metaobject/DRY-${handle}`;
  }

  const data = await gql(M_METAOBJECT_UPSERT, {
    handle: { type: META_TYPES.item, handle },
    metaobject: {
      fields: [
        { key: "question", value: item.question },
        { key: "answer", value: answerRichText },
      ],
    },
  });

  const result = data.metaobjectUpsert;
  if (logUserErrors(`metaobjectUpsert ${handle}`, result.userErrors)) return null;
  return result.metaobject?.id || null;
}

async function upsertCategory(category, itemIds) {
  const handle = categoryHandle(category.slug);

  if (DRY_RUN) {
    console.log(`  dry-run upsert ${META_TYPES.category}/${handle} (${itemIds.length} items)`);
    return true;
  }

  const data = await gql(M_METAOBJECT_UPSERT, {
    handle: { type: META_TYPES.category, handle },
    metaobject: {
      fields: [
        { key: "slug", value: category.slug },
        { key: "title", value: category.title },
        { key: "sort_order", value: String(category.sortOrder) },
        { key: "items", value: JSON.stringify(itemIds) },
      ],
    },
  });

  const result = data.metaobjectUpsert;
  if (logUserErrors(`metaobjectUpsert ${handle}`, result.userErrors)) return false;
  return true;
}

async function main() {
  await preflightDefinitions();
  const categories = await loadFaqData();

  console.log(`Seeding ${categories.length} categories`);
  const summary = { ok: 0, fail: 0 };

  for (const category of categories) {
    console.log(`\n> ${category.slug} (${category.items.length} items)`);
    const itemIds = [];

    for (let i = 0; i < category.items.length; i += 1) {
      const id = await upsertFaqItem(category.slug, i, category.items[i]);
      if (!id) {
        summary.fail += 1;
        continue;
      }
      itemIds.push(id);
    }

    if (itemIds.length !== category.items.length) {
      console.error(`  x Skipping category ${category.slug}: incomplete item upserts (${itemIds.length}/${category.items.length}).`);
      summary.fail += 1;
      continue;
    }

    const categoryOk = await upsertCategory(category, itemIds);
    if (categoryOk) {
      summary.ok += 1;
      console.log(`  ok category ${category.slug}`);
    } else {
      summary.fail += 1;
    }
  }

  console.log(`\nDone. ok=${summary.ok} fail=${summary.fail}${DRY_RUN ? " [DRY-RUN]" : ""}`);
  if (summary.fail > 0) process.exit(2);
}

main().catch((error) => {
  console.error(`Fatal: ${error.message}`);
  process.exit(1);
});
