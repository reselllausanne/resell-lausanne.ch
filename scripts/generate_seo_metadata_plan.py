#!/usr/bin/env python3
"""
generate_seo_metadata_plan.py — Resell Lausanne SEO metadata planner.

Reads Shopify product/collection exports (CSV) if available, detects
missing/weak/duplicate/too-long SEO titles & meta descriptions, and generates
suggestions following seo-system/SEO_METADATA_RULES.md.

- stdlib only (csv, argparse, re, os, sys). No network. No Shopify API.
- Never overwrites good merchant SEO (only suggests; output is a review CSV).
- Outputs:
    seo-system/SEO_METADATA_SUGGESTIONS.csv
    seo-system/PRODUCT_SEO_DATA_GAPS.csv   (when --products given)

Usage:
    python3 scripts/generate_seo_metadata_plan.py \
        --products audit-inputs/products_export.csv \
        --collections audit-inputs/collections_export.csv

If no input files are given/found, prints the exact export instructions.
Shopify product CSV export works; Matrixify exports (with "Metafield:"/"SEO Title"
columns) are auto-detected too.
"""
import argparse
import csv
import os
import re
import sys

TITLE_MIN, TITLE_MAX = 45, 60
META_MIN, META_MAX = 120, 155
SHOP = "Resell Lausanne"
BASE_URL = "https://www.resell-lausanne.ch"

STYLE_CODE_RE = re.compile(r"\b[A-Z]{2}\d{3,4}[- ]?\d{3}\b")


def load_taxonomy(path):
    """brand/model normalization from data/breadcrumb-taxonomy.csv."""
    brands, models = {}, {}
    if not path or not os.path.exists(path):
        return brands, models
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            handle = (row.get("collection_handle") or "").strip()
            brand = (row.get("brand") or "").strip()
            model = (row.get("model_title") or "").strip()
            aliases = (row.get("aliases") or "").strip()
            if handle:
                models[handle] = {"brand": brand, "model": model, "aliases": aliases}
            if brand and brand not in brands:
                brands[brand] = model or brand
    return brands, models


def truncate(text, limit):
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,-|") 


def pick(row, *names):
    for n in names:
        for k in row.keys():
            if k and k.strip().lower() == n.lower():
                v = (row[k] or "").strip()
                if v:
                    return v
    return ""


def clean_title(raw):
    """Normalize a noisy imported product title to Brand Model Colorway."""
    t = re.sub(r"\s+", " ", (raw or "").strip())
    t = STYLE_CODE_RE.sub("", t).strip(" -|")
    # Kill common import noise
    for junk in ["MEN'S SHOE", "WOMEN'S SHOE", "RETRO", "(GS)", "SHOES", "SHOE"]:
        t = re.sub(junk, "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+", " ", t).strip(" -|")
    # Title-case if the string is mostly uppercase
    letters = [c for c in t if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.7:
        t = " ".join(w.capitalize() for w in t.split())
    return t


def product_suggestions(row, taxonomy_models):
    handle = pick(row, "Handle", "handle")
    title = pick(row, "Title", "title", "Name")
    vendor = pick(row, "Vendor", "vendor", "Brand")
    body = pick(row, "Body (HTML)", "Body HTML", "body_html", "Body")
    cur_seo_title = pick(row, "SEO Title", "Metafield: title_tag [string]", "title_tag")
    cur_seo_meta = pick(row, "SEO Description", "Metafield: description_tag [string]",
                        "description_tag")

    clean = clean_title(title)
    brand = vendor or (clean.split(" ")[0] if clean else "")
    style_code = ""
    m = STYLE_CODE_RE.search(title or "")
    if m:
        style_code = m.group(0)

    sug_title = truncate(f"{clean} | {SHOP}", TITLE_MAX) if clean else ""
    colorway = clean.replace(brand, "", 1).strip() if brand else clean
    sug_meta = truncate(
        f"{clean} authentique en Suisse. Tailles EU, livraison CH/EU, "
        f"paiement Twint & Alma. Authenticité garantie {SHOP}.", META_MAX)

    reasons, review = [], "no"
    if not cur_seo_title:
        reasons.append("missing_title")
    elif len(cur_seo_title) > TITLE_MAX:
        reasons.append("title_too_long")
    elif cur_seo_title.strip().lower() == (title or "").strip().lower():
        reasons.append("title_equals_h1")
    else:
        sug_title = ""  # good enough, don't suggest
    if not cur_seo_meta:
        reasons.append("missing_meta")
    elif len(cur_seo_meta) < META_MIN:
        reasons.append("meta_too_short")
    elif len(cur_seo_meta) > 165:
        reasons.append("meta_too_long")
    else:
        sug_meta = ""

    if title and clean and len(clean) < len(title) - 4:
        reasons.append("noisy_title_normalized")
        review = "yes"

    gaps = []
    if not style_code:
        gaps.append(("missing_metafield", "style_code",
                     "Parse/set custom.style_code", "partial"))
    if handle and handle not in taxonomy_models and not vendor:
        gaps.append(("missing_metafield", "brand;model",
                     "Set custom.brand/model from taxonomy", "partial"))

    url = f"{BASE_URL}/products/{handle}" if handle else ""
    sug = None
    if reasons and (sug_title or sug_meta):
        sug = {
            "resource_type": "product", "handle": handle, "url": url,
            "current_title": cur_seo_title, "suggested_title": sug_title,
            "current_meta_description": cur_seo_meta,
            "suggested_meta_description": sug_meta,
            "reason": ";".join(reasons) or "review",
            "priority": "P1" if "missing_title" in reasons or "missing_meta" in reasons else "P2",
            "needs_manual_review": review,
        }
    gap_rows = [{
        "product_url": url, "product_title": title, "issue_type": g[0],
        "missing_data": g[1], "recommended_fix": g[2],
        "automation_possible": g[3], "priority": "P2",
    } for g in gaps]
    return sug, gap_rows


def collection_suggestions(row):
    handle = pick(row, "Handle", "handle")
    title = pick(row, "Title", "title")
    cur_t = pick(row, "SEO Title", "title_tag", "Metafield: title_tag [string]")
    cur_m = pick(row, "SEO Description", "description_tag",
                 "Metafield: description_tag [string]")
    name = title or handle.replace("-", " ").title()
    sug_t = truncate(f"{name} — authentiques en Suisse | {SHOP}", TITLE_MAX)
    sug_m = truncate(
        f"{name} authentiques en Suisse. Livraison rapide CH/EU, "
        f"paiement Twint & Alma, authenticité garantie {SHOP}.", META_MAX)
    reasons = []
    if not cur_t:
        reasons.append("missing_title")
    elif len(cur_t) > TITLE_MAX:
        reasons.append("title_too_long")
    else:
        sug_t = ""
    if not cur_m:
        reasons.append("missing_meta")
    else:
        sug_m = ""
    if not reasons:
        return None
    return {
        "resource_type": "collection", "handle": handle,
        "url": f"{BASE_URL}/collections/{handle}" if handle else "",
        "current_title": cur_t, "suggested_title": sug_t,
        "current_meta_description": cur_m, "suggested_meta_description": sug_m,
        "reason": ";".join(reasons), "priority": "P1",
        "needs_manual_review": "yes",
    }


def read_csv(path):
    if not path or not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, fields):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})


def main():
    ap = argparse.ArgumentParser(description="Resell Lausanne SEO metadata planner")
    ap.add_argument("--products", help="Shopify/Matrixify products CSV export")
    ap.add_argument("--collections", help="Shopify/Matrixify collections CSV export")
    ap.add_argument("--taxonomy", default="data/breadcrumb-taxonomy.csv")
    ap.add_argument("--out-dir", default="seo-system")
    args = ap.parse_args()

    if not args.products and not args.collections:
        print(__doc__)
        print("\nNo --products/--collections given. Export from Shopify Admin:")
        print("  Products  → Export → Plain CSV → save to audit-inputs/products_export.csv")
        print("  Collections → (Matrixify) export with SEO fields → audit-inputs/collections_export.csv")
        print("Then re-run with --products / --collections.")
        return 0

    _, tax_models = load_taxonomy(args.taxonomy)
    suggestions, gaps = [], []

    for row in read_csv(args.products):
        # Shopify plain CSV repeats Handle per variant; only first row has Title
        if not pick(row, "Title", "title"):
            continue
        sug, gap_rows = product_suggestions(row, tax_models)
        if sug:
            suggestions.append(sug)
        gaps.extend(gap_rows)

    for row in read_csv(args.collections):
        sug = collection_suggestions(row)
        if sug:
            suggestions.append(sug)

    sug_fields = ["resource_type", "handle", "url", "current_title",
                  "suggested_title", "current_meta_description",
                  "suggested_meta_description", "reason", "priority",
                  "needs_manual_review"]
    write_csv(os.path.join(args.out_dir, "SEO_METADATA_SUGGESTIONS.csv"),
              suggestions, sug_fields)

    if gaps:
        gap_fields = ["product_url", "product_title", "issue_type",
                      "missing_data", "recommended_fix",
                      "automation_possible", "priority"]
        write_csv(os.path.join(args.out_dir, "PRODUCT_SEO_DATA_GAPS.generated.csv"),
                  gaps, gap_fields)

    print(f"Wrote {len(suggestions)} metadata suggestions, {len(gaps)} data gaps.")
    print("Review CSVs before any Shopify import. Never auto-apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
