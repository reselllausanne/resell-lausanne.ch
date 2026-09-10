/**
 * Extract ISO release date (YYYY-MM-DD) from StockX-style product description HTML.
 */

const LABEL_RE = /(?:Release Date|Date de sortie|Release-Datum)/i;

export function parseReleaseDateFromHtml(html) {
  if (!html || typeof html !== "string") return null;

  const idx = html.search(LABEL_RE);
  if (idx < 0) return null;

  const slice = html.slice(idx, idx + 120);
  const match = slice.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function parseReleaseDateFromMetafield(metafield) {
  if (!metafield?.value) return null;
  const raw = String(metafield.value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function isOlderThanYears(isoDate, years, referenceDate = new Date()) {
  if (!isoDate) return false;
  const release = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(release.getTime())) return false;

  const cutoff = new Date(referenceDate);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  cutoff.setUTCHours(0, 0, 0, 0);

  return release < cutoff;
}

export function isOlderThanDate(isoDate, beforeIsoDate) {
  if (!isoDate || !beforeIsoDate) return false;
  return isoDate < beforeIsoDate;
}

const COLLECTIBLE_ROOTS = new Set([
  "pokemon",
  "one-piece",
  "pop-mart",
  "labubu",
  "moonswatch",
  "sonny-angel",
  "lego",
]);

export function isSealedCollectible(product) {
  const collections = product.collections?.nodes || product.collections || [];
  for (const collection of collections) {
    const handle = (collection.handle || "").toLowerCase();
    if (COLLECTIBLE_ROOTS.has(handle)) return true;
    if (handle.includes("lego-")) return true;
    if (handle.includes("montre") || handle.includes("watch") || handle.includes("moonswatch")) {
      return true;
    }
  }

  const vendor = (product.vendor || "").toLowerCase();
  const productType = (product.productType || product.type || "").toLowerCase();
  const title = (product.title || "").toLowerCase();

  const vendorHits = ["lego", "pokemon", "pop mart", "pop-mart", "labubu", "moonswatch", "swatch"];
  if (vendorHits.some((token) => vendor.includes(token))) return true;

  const typeHits = ["lego", "pokemon", "montre", "watch", "collectible", "moonswatch"];
  if (typeHits.some((token) => productType.includes(token))) return true;

  const titleHits = ["lego ", " moonswatch", "labubu", "pop mart", "pokémon", "pokemon"];
  if (titleHits.some((token) => title.includes(token))) return true;

  return false;
}
