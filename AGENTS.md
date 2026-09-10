# AGENTS.md

## Cursor Cloud specific instructions

This repo is the **customer-facing Shopify storefront theme** (Liquid / Online Store 2.0) for the `resell-lausanne` store. There is no application server, database, or Node `package.json`. The root theme is the active one (`shopify.theme.toml` → `store = "resell-lausanne"`); `fullstack_2_3_1/` is an alternate theme snapshot.

### Tooling

- Shopify CLI is installed at `~/.npm-global/bin/shopify` (add `~/.npm-global/bin` to `PATH`). Standard commands are in `README.md`.
- **Lint (offline, no auth):** `shopify theme check` — works without store credentials. Config: `.theme-check.yml` (`theme-check:recommended`). Expect many pre-existing offenses (mostly `MissingTemplate` for demo snippets referenced in `sections/`); these are existing theme content, not env issues.
- **Preview/run (`shopify theme dev`) requires Shopify store auth**, which cannot be completed inside the VM without the store owner logging in. It's a blocking user action, not a setup step — the theme only renders when served by Shopify.
