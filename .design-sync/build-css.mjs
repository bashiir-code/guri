// Builds the design-sync stylesheet inputs for the Guri DS (cfg.buildCmd).
// 1. apps/web/.ds-fonts/fonts.css + woff2s — Inter 400-700 and Bricolage
//    Grotesque 700/800, downloaded once from Google Fonts (latin subsets)
//    and self-hosted so designs never depend on a runtime font fetch.
// 2. apps/web/.ds-css/guri.css — the compiled Tailwind stylesheet (full
//    app content scan, so the utility vocabulary the app really uses is
//    available to the design agent) prefixed with the font-variable root
//    block that next/font provides at runtime in the real app.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(repoRoot, 'apps/web');
const fontsDir = join(webDir, '.ds-fonts');
const cssDir = join(webDir, '.ds-css');
mkdirSync(fontsDir, { recursive: true });
mkdirSync(cssDir, { recursive: true });

const GF_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Bricolage+Grotesque:wght@700;800&display=swap';
// A browser UA makes Google return woff2 @font-face blocks.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function buildFonts() {
  const cssPath = join(fontsDir, 'fonts.css');
  if (existsSync(cssPath)) {
    console.error('fonts: cached, skipping download');
    return;
  }
  const res = await fetch(GF_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Google Fonts CSS fetch failed: ${res.status}`);
  const css = await res.text();
  // Keep only latin/latin-ext subset blocks (each is preceded by a comment).
  const blocks = css.split(/\/\*\s*([a-z-]+)\s*\*\//).slice(1);
  let out = '';
  for (let i = 0; i < blocks.length; i += 2) {
    const subset = blocks[i];
    if (subset !== 'latin' && subset !== 'latin-ext') continue;
    let block = blocks[i + 1];
    for (const m of block.matchAll(/url\((https:[^)]+\.woff2)\)/g)) {
      const url = m[1];
      const name = url.split('/').slice(-2).join('-');
      const file = join(fontsDir, name);
      if (!existsSync(file)) {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`font download failed: ${url}`);
        writeFileSync(file, Buffer.from(await r.arrayBuffer()));
        console.error(`fonts: downloaded ${name}`);
      }
      block = block.replace(url, `./${name}`);
    }
    out += `/* ${subset} */${block}`;
  }
  if (!out.includes('@font-face')) throw new Error('no @font-face blocks parsed');
  writeFileSync(cssPath, out);
  console.error(`fonts: wrote ${cssPath}`);
}

function buildTailwind() {
  const tw = join(webDir, 'node_modules/.bin/tailwindcss');
  const outFile = join(cssDir, 'tw.css');
  execFileSync(
    tw,
    [
      '-c', 'tailwind.config.ts',
      '-i', 'src/app/globals.css',
      '-o', outFile,
      '--content',
      // App usage + authored DS previews, so preview layout glue resolves too.
      './src/**/*.{ts,tsx},../../.design-sync/previews/**/*.tsx',
    ],
    { cwd: webDir, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  // next/font injects these vars at runtime in the real app; the DS bundle
  // ships the same families via fonts.css, so define the vars statically.
  const head = [
    ':root {',
    "  --font-sans: 'Inter';",
    "  --font-display: 'Bricolage Grotesque';",
    '}',
    'body { font-family: var(--font-sans), system-ui, sans-serif; }',
    '',
  ].join('\n');
  writeFileSync(join(cssDir, 'guri.css'), head + readFileSync(outFile, 'utf8'));
  console.error(`css: wrote ${join(cssDir, 'guri.css')}`);
}

await buildFonts();
buildTailwind();
console.error('build-css: done');
