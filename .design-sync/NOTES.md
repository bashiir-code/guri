# design-sync notes — Guri

- This repo is an app monorepo, not a packaged design system. The DS surface is
  `apps/web/src/components/ui` (7 primitives). `cfg.entry` deliberately points at a
  nonexistent `apps/web/dist/index.js`: it anchors PKG_DIR to `apps/web` while the
  soft `[NO_DIST]` fall-through triggers synth-entry from `cfg.srcDir`. The
  `[NO_DIST]` warn on every build is expected — not a failure.
- `cfg.buildCmd` (`node .design-sync/build-css.mjs`) must run before the converter:
  it compiles the Tailwind stylesheet (full `apps/web/src` content scan PLUS
  `.design-sync/previews/**`) into `apps/web/.ds-css/guri.css` and self-hosts
  Inter + Bricolage Grotesque into `apps/web/.ds-fonts/` (downloaded from Google
  Fonts on first run — needs network on a fresh clone; both dirs are gitignored).
- Preview classes must stay within the build-css `--content` globs, or the
  compiled CSS won't include them and cards render unstyled.
- Playwright: cached chromium build 1208 ↔ `playwright@1.58.x` installed in
  `.ds-sync/` (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`).
- `overrides.Textarea.cardMode=column` resolves a `[GRID_OVERFLOW]` (w-96 stories
  wider than grid cells). Keep it.
- Card sub-parts (CardHeader/Title/Description/Content) are `componentSrcMap`-nulled
  from the card list but still exported on `window.Guri` via the synth entry —
  Card's preview and prompt.md show the composition.
- Deferred components for a later re-sync: `BottomSheet` (clean React, but lives
  outside `srcDir` so the synth entry misses it — needs an entry-inclusion
  strategy), `StatusChip` (needs a next-intl provider with messages via
  `cfg.provider` + `$ref`). App-level widgets (PublicHeader, BottomNav, forms) are
  deliberately excluded: they're Next.js/Clerk/i18n-coupled app compositions.
- Machine quirk: shell variables inside `wsl.exe -d ubuntu -- bash -lc '…'` loops
  get eaten by the quoting chain — use python3 heredocs for anything with `$vars`.

## Known render warns

- (none outstanding — Textarea GRID_OVERFLOW resolved via cardMode column)

## Re-sync risks

- Fonts are network-fetched on first run per clone (Google Fonts CSS2 + woff2);
  offline environments must pre-seed `apps/web/.ds-fonts/`.
- `conventions.md` class names were validated against the compiled stylesheet on
  2026-07-13; re-validate after any tailwind.config.ts token/name change.
- The compiled CSS's utility coverage tracks what the app + previews use — a
  design token added to the config but never used in app code won't ship until
  something references it.
