# RTL support and CSS logical properties

AFFiNE supports right-to-left languages (Arabic `ar`, Persian `fa`, Urdu `ur`).
This document explains how RTL works in the codebase and the conventions new
code must follow so layouts mirror correctly.

## Architecture

RTL is driven by three layers:

1. **Document direction.** When the UI language changes, the i18n entity sets
   `document.documentElement.dir` to `rtl`/`ltr` based on the `rtl` flag in
   `SUPPORTED_LANGUAGES`
   (`packages/frontend/core/src/modules/i18n/entities/i18n.ts`,
   `packages/frontend/i18n/src/resources/index.ts`). CSS logical properties and
   `:dir()` selectors pick this up automatically.

2. **Radix UI direction context.** Radix primitives (dropdowns, popovers,
   menus…) read direction from React context, _not_ from the document `dir`
   attribute. `DirectionProvider`
   (`packages/frontend/core/src/components/direction-provider/index.tsx`) is
   mounted in `AffineContext` and feeds the current language's direction to
   every Radix component, including portaled ones.

3. **Per-block direction in the editor.** The BlockSuite paragraph and list
   block containers carry `dir="auto"`, so each block's direction follows its
   own content (first strong character). A document can freely mix Arabic and
   English paragraphs, each aligned to its natural side, with the quote bar,
   placeholder, list markers and child indentation mirroring per block.

   Note: `dir="auto"` belongs on the block _container_, not on the rich-text
   contenteditable inside it. The HTML auto-directionality algorithm skips
   descendants that have their own `dir` attribute, so a `dir="auto"`
   contenteditable would hide the text from the container's computation (the
   container would only "see" the placeholder and always resolve LTR). It
   would also flip rich-text hosts that must stay LTR, like code blocks.

To add a new RTL language, set `rtl: true` on its entry in
`packages/frontend/i18n/src/resources/index.ts` — everything else follows.

## Convention: use CSS logical properties

Physical properties (`margin-left`, `padding-right`, `left: 0`,
`text-align: left`) do not mirror when `dir="rtl"`. New styles must use the
logical equivalents:

| Physical                                                 | Logical                                            |
| -------------------------------------------------------- | -------------------------------------------------- |
| `marginLeft` / `marginRight`                             | `marginInlineStart` / `marginInlineEnd`            |
| `paddingLeft` / `paddingRight`                           | `paddingInlineStart` / `paddingInlineEnd`          |
| `borderLeft` / `borderRight` (+ `Width`/`Style`/`Color`) | `borderInlineStart` / `borderInlineEnd` (+ suffix) |
| `borderTopLeftRadius`                                    | `borderStartStartRadius`                           |
| `borderTopRightRadius`                                   | `borderStartEndRadius`                             |
| `borderBottomLeftRadius`                                 | `borderEndStartRadius`                             |
| `borderBottomRightRadius`                                | `borderEndEndRadius`                               |
| `left: …` / `right: …`                                   | `insetInlineStart` / `insetInlineEnd`              |
| `textAlign: 'left'/'right'`                              | `textAlign: 'start'/'end'`                         |

Cases that need judgement rather than mechanical replacement:

- **`left`/`right` insets** — a decoration anchored to the text side (quote
  bar, placeholder) should become `insetInlineStart/End`; a coordinate computed
  in JS (floating-ui positioning, drag handles, canvas overlays) must stay
  physical, because `getBoundingClientRect()` and pointer events are physical.
- **`translateX(…)`** — mirrors incorrectly under RTL; add a `:dir(rtl)`
  override with the flipped sign, or derive the sign from direction.
- **4-value shorthands** (`padding: 1px 2px 3px 4px`) — split into
  `paddingBlock` + `paddingInline` start/end values.
- **Flex rows with meaningful order** — usually correct automatically, since
  flex follows the container's direction; don't "fix" them with physical
  margins.

## Codemod

`scripts/css-logical-properties-codemod.mjs` converts existing
vanilla-extract `*.css.ts` files. It renames the mechanical cases from the
table above and only _flags_ the judgement cases (insets, `translateX`,
4-value shorthands) with file/line for manual review. It is idempotent —
already-logical keys are untouched.

```sh
# dry run: report what would change
node scripts/css-logical-properties-codemod.mjs packages/frontend/core/src/components

# apply
node scripts/css-logical-properties-codemod.mjs packages/frontend/core --write
```

Run it scoped (per package or directory) so the resulting diff stays
reviewable.

## Keeping new code clean (suggested lint guard)

Once a package is fully converted, a file-scoped block in `eslint.config.mjs`
can prevent regressions:

```js
{
  files: ['**/*.css.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "PropertyDefinition, Property[key.name=/^(marginLeft|marginRight|paddingLeft|paddingRight|borderLeft|borderRight)$/]",
        message:
          'Use CSS logical properties (marginInlineStart, …) so styles mirror under RTL. See docs/contributing/rtl-and-css-logical-properties.md',
      },
    ],
  },
}
```

This is intentionally not enabled yet — enable it per package as the codemod
lands there.

## Known limitations (follow-up work)

- Horizontal auto-scroll in `rich-text.ts` (`enableAutoScrollHorizontally`)
  assumes LTR overflow; only affects `wrapText: false` consumers.
- The heading collapse icon uses `translateX(-48px)` and needs a `:dir(rtl)`
  override.
- Edgeless canvas text has its own direction detection
  (`isRTL()` in `blocksuite/affine/gfx/text/src/element-renderer/utils.ts`).
