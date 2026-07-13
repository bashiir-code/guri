# Guri design conventions

Guri is a rental marketplace for Mogadishu. Bold fintech look: deep green, one
lime action, soft cards, no gradients. UI copy is bilingual (Somali first,
English second), always sentence case — never ALL CAPS.

## Setup

No provider or wrapper is needed — every component works standalone. Load
`styles.css` (it carries the tokens, fonts, and component CSS). Body text is
Inter via `font-sans`; headings and prices use Bricolage Grotesque via
`font-display` with `font-bold`/`font-extrabold`.

## Styling idiom: Tailwind utilities with Guri's own vocabulary

Style layout glue with Tailwind classes. The brand tokens are custom Tailwind
colors — use THESE names, not generic Tailwind palette colors:

| Family | Classes | Meaning |
|---|---|---|
| Forest `#173A31` | `bg-forest` `text-forest` `border-forest` | brand green: headings, hero blocks, dark bars |
| Lime `#B7F35D` | `bg-lime` `text-lime` | THE accent. One lime action per screen; always Forest text on Lime (`bg-lime text-forest`), never white |
| Mist `#F4F7F2` | `bg-mist` `text-mist` | page background; light text on Forest |
| Slate `#5C6B64` | `text-slate` `bg-slate` | secondary text |
| Amber `#F2A93B` | `bg-amber` `border-amber` | "reserved" status only |
| Semantic | `bg-card` `text-card-foreground` `text-muted-foreground` `bg-muted` `border-input` `bg-primary` `text-primary-foreground` | shadcn-style tokens; `primary` resolves to Lime with Forest foreground |

Shape language: `rounded-card` (20px) on cards and surfaces, `rounded-full`
pills on buttons and chips, `rounded-2xl` on inputs. Hairline borders
(`border` + `border-input`), soft shadows (`shadow-sm`), no gradients.
Entrance animations available: `animate-rise-in`, `animate-fade-in`,
`animate-sheet-up`, `animate-pop`.

Money is always USD, rendered in `font-display` (e.g. `$350/month`).

## Where the truth lives

Read `styles.css` and its imports (tokens + `_ds_bundle.css`) before styling.
Each component ships `<Name>.d.ts` (the props contract) and `<Name>.prompt.md`
(usage and composition examples).

## Idiomatic composition

```tsx
<Card className="max-w-sm">
  <CardHeader>
    <CardTitle>Apartment on Maka al-Mukarama</CardTitle>
    <CardDescription>Hodan · 2 bedrooms · 1 bathroom</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="font-display text-3xl font-extrabold text-forest">
      $350<span className="text-sm font-medium text-slate">/month</span>
    </p>
    <Button size="sm" className="mt-4">Request viewing</Button>
  </CardContent>
</Card>
```

`Button` variants: default (lime pill), `outline`, `ghost`; sizes `sm`/default/`lg`.
`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` compose inside `Card`.
Forms: `Label` + `Input`/`Select`/`Textarea` in a `grid gap-2`; `Slider` takes
`defaultValue={[min, max]}` for ranges.
