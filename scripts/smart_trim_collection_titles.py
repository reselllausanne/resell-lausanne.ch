#!/usr/bin/env python3
"""
smart_trim_collection_titles.py — conservative SEO title length fix.

Unlike generate_seo_metadata_plan.py (which proposes a brand-new generic
title when the current one is missing/too long), this script preserves the
merchant's existing, keyword-rich SEO Title and only removes the LEAST
valuable trailing part (the repeated brand suffix) to bring it under the
Google-safe 60-char limit. Falls back to a word-boundary truncation only if
stripping the suffix alone isn't enough.

Never invents new copy. Never touches titles that are already <= LIMIT.

Usage:
    python3 scripts/smart_trim_collection_titles.py \
        --collections audit-inputs/collections_export.csv \
        --out seo-system/COLLECTION_TITLE_SMART_TRIM_PLAN.csv
"""
import argparse
import csv
import re

LIMIT = 60

# Ordered longest-first so we strip the most specific suffix pattern first.
SUFFIX_PATTERNS = [
    re.compile(r"\s*[|\-–—]\s*Resell\s+Lausanne\s*$", re.IGNORECASE),
    re.compile(r"\s*[|\-–—]\s*Resell\s*$", re.IGNORECASE),
]

# Dangling connector words that look broken if left as the last word after
# a word-boundary cut (e.g. "... Course &" or "... Style et").
DANGLING_TRAILERS = re.compile(
    r"\s*(&|et|and|de|du|des|à|a|with|avec|,|-|–|—|\|)\s*$", re.IGNORECASE
)


def strip_dangling_trailer(text):
    prev = None
    while prev != text:
        prev = text
        text = DANGLING_TRAILERS.sub("", text).rstrip()
    return text


def smart_trim(title):
    title = (title or "").strip()
    if len(title) <= LIMIT:
        return title, "no_change", ""

    for pattern in SUFFIX_PATTERNS:
        stripped = pattern.sub("", title).strip()
        if stripped and stripped != title and len(stripped) <= LIMIT:
            return stripped, "suffix_stripped", f"removed trailing brand suffix ({len(title)} -> {len(stripped)} chars)"

    # Suffix removal alone wasn't enough (or no suffix matched) -> strip suffix
    # if present, then word-boundary truncate what's left.
    base = title
    for pattern in SUFFIX_PATTERNS:
        base = pattern.sub("", base).strip()

    if len(base) <= LIMIT:
        return base, "suffix_stripped", f"removed trailing brand suffix ({len(title)} -> {len(base)} chars)"

    cut = base[:LIMIT]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    cut = cut.rstrip(" ,.-|–—")
    cut = strip_dangling_trailer(cut)
    return cut, "word_boundary_truncated", f"description itself exceeds {LIMIT} chars even without suffix; truncated at word boundary ({len(title)} -> {len(cut)} chars)"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--collections", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    rows_out = []
    with open(args.collections, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            current = (row.get("SEO Title") or "").strip()
            if not current:
                continue  # missing titles handled separately, not a trim case
            new_title, method, note = smart_trim(current)
            if method == "no_change":
                continue
            rows_out.append({
                "handle": row.get("Handle", ""),
                "products_count": row.get("Products Count", ""),
                "current_title": current,
                "current_length": len(current),
                "new_title": new_title,
                "new_length": len(new_title),
                "method": method,
                "note": note,
            })

    fields = ["handle", "products_count", "current_title", "current_length",
              "new_title", "new_length", "method", "note"]
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows_out:
            w.writerow(r)

    by_method = {}
    for r in rows_out:
        by_method[r["method"]] = by_method.get(r["method"], 0) + 1
    print(f"Wrote {len(rows_out)} title trim proposals -> {args.out}")
    for method, count in by_method.items():
        print(f"  {method}: {count}")


if __name__ == "__main__":
    main()
