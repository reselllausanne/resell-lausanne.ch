#!/usr/bin/env node
/**
 * Fix wrong shipping + returns FAQ answers across all brand collection FAQ metaobjects.
 * Aligns with the canonical policy from snippets/resell-faq-livraison-article.liquid
 * and snippets/resell-faq-page.liquid.
 *
 * Usage:
 *   node --env-file=apps/.env scripts/fix-collection-faq-policy.mjs --dry-run
 *   node --env-file=apps/.env scripts/fix-collection-faq-policy.mjs
 */
const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION || "2026-04";
const DRY = process.argv.includes("--dry-run");
if (!SHOP || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN");
  process.exit(1);
}
const API = `https://${SHOP}/admin/api/${V}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const text = (s) => ({ type: "text", value: s });
const link = (url, children) => ({ type: "link", url, title: null, target: null, children });
const p = (...children) => ({ type: "paragraph", children });
const root = (...children) => ({ type: "root", children });

function livraisonAnswer(brand) {
  return JSON.stringify(
    root(
      p(
        text(
          `Comptez 5 à 10 jours ouvrables en standard pour les commandes ${brand} en Suisse et en Europe. Une livraison express en 2 à 5 jours ouvrables est disponible sur certains produits éligibles.`,
        ),
      ),
      p(
        text(
          "La livraison est gratuite en Suisse dès 50 CHF d'achat (frais fixes appliqués au checkout en dessous). Forfait de 10 CHF pour les livraisons en Europe. Des frais de TVA, douane ou importation peuvent s'appliquer selon le pays.",
        ),
      ),
      p(
        text("Plus de détails sur notre "),
        link("/pages/faq?category=livraison", [text("FAQ Livraison")]),
        text("."),
      ),
    ),
  );
}

function retoursAnswer(brand) {
  return JSON.stringify(
    root(
      p(
        text(
          `Oui. Vous disposez de 14 jours à compter de la réception pour nous retourner une paire ${brand} dans son état d'origine (non portée, avec boîte et étiquettes intactes).`,
        ),
      ),
      p(
        text(
          "Le remboursement s'effectue en crédit boutique, avec des frais de retour de 10 % retenus sur le montant remboursé. L'échange de taille est possible sous réserve de stock.",
        ),
      ),
      p(
        text("Toutes les modalités sont détaillées dans notre "),
        link("/pages/faq?category=echanges-et-retours", [
          text("FAQ Échanges et remboursements"),
        ]),
        text(". Pour initier un retour : "),
        link("mailto:contact@resell-lausanne.ch", [text("contact@resell-lausanne.ch")]),
        text("."),
      ),
    ),
  );
}

const BRAND_BY_HANDLE = {
  "nike-faq-livraison": "Nike",
  "nike-faq-retours": "Nike",
  "adidas-faq-2": "Adidas",
  "adidas-faq-3": "Adidas",
  "air-jordan-faq-2": "Air Jordan",
  "air-jordan-faq-3": "Air Jordan",
  "new-balance-faq-2": "New Balance",
  "new-balance-faq-3": "New Balance",
  "asics-faq-2": "ASICS",
  "asics-faq-3": "ASICS",
  "yeezy-faq-2": "Yeezy",
  "yeezy-faq-3": "Yeezy",
  "ugg-faq-2": "UGG",
  "ugg-faq-3": "UGG",
  "onitsuka-tiger-faq-2": "Onitsuka Tiger",
  "onitsuka-tiger-faq-3": "Onitsuka Tiger",
  "golden-goose-faq-2": "Golden Goose",
  "golden-goose-faq-3": "Golden Goose",
  "puma-faq-2": "Puma",
  "puma-faq-3": "Puma",
  "saucony-faq-2": "Saucony",
  "saucony-faq-3": "Saucony",
  "birkenstock-faq-2": "Birkenstock",
  "birkenstock-faq-3": "Birkenstock",
  "on-faq-2": "ON Running",
  "on-faq-3": "ON Running",
};

async function listAll() {
  const data = await gql(
    `{ metaobjects(type:"faq_item", first:100){ nodes{ id handle fields{ key value type } } } }`,
  );
  return data.metaobjects.nodes;
}

async function updateAnswer(id, newValue) {
  const data = await gql(
    `mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id handle }
        userErrors { field message code }
      }
    }`,
    {
      id,
      metaobject: { fields: [{ key: "answer", value: newValue }] },
    },
  );
  const r = data.metaobjectUpdate;
  if (r.userErrors?.length) throw new Error(JSON.stringify(r.userErrors));
  return r.metaobject;
}

async function main() {
  const nodes = await listAll();
  let updated = 0;
  for (const n of nodes) {
    const brand = BRAND_BY_HANDLE[n.handle];
    if (!brand) continue;
    let newAnswer = null;
    if (n.handle.includes("livraison") || /-faq-2$/.test(n.handle)) {
      newAnswer = livraisonAnswer(brand);
    } else if (n.handle.includes("retours") || /-faq-3$/.test(n.handle)) {
      newAnswer = retoursAnswer(brand);
    }
    if (!newAnswer) continue;
    if (DRY) {
      console.log(`DRY ${n.handle} ← ${brand}`);
      continue;
    }
    await updateAnswer(n.id, newAnswer);
    console.log(`✓ ${n.handle}`);
    updated += 1;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`Done. updated=${updated}${DRY ? " (dry-run)" : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
