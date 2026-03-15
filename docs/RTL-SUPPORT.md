# Arabic / RTL Support Guide for AFFiNE

## Overview

AFFiNE is adding full right-to-left (RTL) support, starting with Arabic. This document tracks the remaining work and provides guidance for contributors.

## Architecture

AFFiNE uses `dir="auto"` or `dir="rtl"` on the root `<html>` element when an RTL locale is active. CSS logical properties automatically adapt layout direction.

### Key packages

| Package | Path | RTL Status |
|---------|------|------------|
| `@affine/component` | `packages/frontend/component/` | Partial — date-picker, menus need fixes |
| `@affine/core` | `packages/frontend/core/` | Partial — sidebar, editor chrome |
| `@blocksuite/blocks` | `blocksuite/blocks/` | Partial — slash menu, toolbar |
| `@blocksuite/affine-components` | `blocksuite/affine/components/` | Partial |

## CSS Logical Properties

The primary RTL work is converting physical CSS properties to logical equivalents:

| Physical (LTR-only) | Logical (bidi-safe) |
|---------------------|---------------------|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `border-left` | `border-inline-start` |
| `border-right` | `border-inline-end` |
| `left` (positioning) | `inset-inline-start` |
| `right` (positioning) | `inset-inline-end` |
| `text-align: left` | `text-align: start` |
| `text-align: right` | `text-align: end` |
| `border-radius: X Y Z W` | `border-start-start-radius`, etc. |

### Manual follow-up (not covered by codemod)

The following require manual review and cannot be safely automated:
- `left` / `right` in positioned elements — context-dependent, may affect layout logic
- `text-align: left` / `text-align: right` — some are intentional LTR, need case-by-case review
- `border-radius` directional cases — rare, search manually with: `grep -r "border-top-left-radius\|border-top-right-radius\|border-bottom-left-radius\|border-bottom-right-radius" packages/ blocksuite/`

### When NOT to convert

Some physical properties are intentional and should stay:
- **Animations/transforms**: `translateX()`, `rotate()` — these are visual, not directional
- **Icon positioning**: Some icons have fixed visual placement
- **Scroll indicators**: Physical scroll positions
- **Canvas/SVG coordinates**: These use absolute coordinate systems

## Using the Codemod Script

A codemod script is provided at `scripts/rtl-codemod.js` to automate bulk conversions.

### Dry run (preview changes)

```bash
node scripts/rtl-codemod.js --dry-run packages/frontend/component/
```

### Apply changes

```bash
node scripts/rtl-codemod.js packages/frontend/component/
```

### Workflow

1. Run with `--dry-run` first to review scope
2. Apply to one package at a time
3. Run `yarn lint --fix` to clean up formatting
4. Manually review edge cases (animations, transforms, absolute positioning)
5. Test with Arabic locale in the browser

## Remaining Work

### High Priority

- [ ] **CSS logical properties conversion** (~400+ instances across the codebase)
  - Use `scripts/rtl-codemod.js` for bulk conversion
  - Manual review needed for edge cases
- [ ] **Date picker**: Arabic comma separator fix (separate PR)
- [ ] **Sidebar**: Panel open/close animations use physical `left`/`right`

### Medium Priority

- [ ] **Drag handle**: `translateX` values need RTL flip
- [ ] **Toolbar positioning**: Absolute positioning uses physical properties
- [ ] **Notification toasts**: Slide-in animations are LTR-only

### Low Priority

- [ ] **Print styles**: Physical margins in print CSS
- [ ] **Onboarding flow**: Some hardcoded directional layouts

## Testing RTL

1. Set browser/OS language to Arabic
2. Or add `?locale=ar` to the URL in development
3. Check that:
   - Text flows right-to-left
   - Sidebar appears on the right
   - Margins/padding mirror correctly
   - No text overflow or clipping
   - Menus and dropdowns open in correct direction

## Contributing

When submitting RTL fixes:

1. **One concern per PR** — don't mix CSS conversions with feature changes
2. **Branch from `upstream/canary`** — ensure no bleed from other branches
3. **Bulk CSS changes** — use the codemod script, not manual edits
4. **Test visually** — screenshots with Arabic locale are helpful in PR descriptions
