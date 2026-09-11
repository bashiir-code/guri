# Guri videos (Remotion)

The two videos in [`docs/media`](../docs/media), written as React components and rendered with [Remotion](https://www.remotion.dev/).

| Composition | File | What it shows |
|---|---|---|
| `GuriTechReel` | [`src/TechReel.tsx`](src/TechReel.tsx) | 56s technical case study: architecture, deal state machine, real service code, security, lease lifecycle, CI/CD |
| `GuriPromo` | [`src/GuriPromo.tsx`](src/GuriPromo.tsx) | 31s product promo: browse, request tracker, trust features, agency console |

Brand tokens (Forest / Lime / Mist, Bricolage Grotesque + Inter) live in [`src/brand.ts`](src/brand.ts) and match `apps/web/tailwind.config.ts`.

This is a standalone npm project and isn't part of the pnpm workspace.

```bash
npm install
npm run studio        # live preview in the browser
npm run render        # → out/guri-promo.mp4
npm run render:tech   # → out/guri-tech-reel.mp4
```
