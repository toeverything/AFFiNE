# @affine/templates

Pre-built template assets for the AFFiNE editor. Provides edgeless workspace templates, sticker packs, and onboarding templates. Source assets (ZIPs, SVGs) are compiled into TypeScript modules with search and categorization APIs.

## Layout

```
edgeless-snapshot/     # Source ZIPs — BlockSuite workspace snapshots (by category)
  Brainstorming/
  Marketing/
  Presentation/
  Project Management/
stickers/              # Source SVGs — pairs of Cover + Content per sticker
  Arrows/
    Cover/
    Content/
  Cheeky Piggies/
  Contorted Stickers/
  Paper/
onboarding/            # Onboarding template ZIP(s)
edgeless/              # Generated JSON template files (from edgeless-snapshot/)
edgeless-templates.gen.ts   # AUTO-GENERATED — edgeless template registry
stickers-templates.gen.ts   # AUTO-GENERATED — sticker registry
build-edgeless.mjs     # Compiles edgeless-snapshot/ ZIPs → edgeless/ + .gen.ts
build-stickers.mjs     # Compiles stickers/ SVGs → .gen.ts
package.json
```

---

## Export paths

```typescript
import { builtInTemplates } from '@affine/templates/edgeless'  // edgeless workspace templates
import { builtInTemplates } from '@affine/templates/stickers'  // sticker packs
// onboarding.zip available as a static asset
```

---

## `builtInTemplates` API

Both `edgeless-templates.gen.ts` and `stickers-templates.gen.ts` export the same interface:

```typescript
const builtInTemplates = {
  // List all templates in a category
  list(category: string): Promise<Template[]>

  // List all available category names
  categories(): Promise<string[]>

  // Fuzzy search across all templates (LCS algorithm)
  search(query: string): Promise<Template[]>
}
```

### Edgeless template shape

```typescript
type EdgelessTemplate = {
  name: string
  type: 'template'
  preview: string         // SVG string (thumbnail shown in picker)
  content: object         // BlockSuite snapshot JSON (applied on insert)
}
```

### Sticker shape

```typescript
type Sticker = {
  name: string
  type: 'sticker'
  cover: string           // SVG import (shown in picker)
  content: string         // SVG import (inserted into canvas)
  hash: string            // base64 SHA256 of content (for deduplication)
  assets: {}
}
```

---

## Build pipelines

### Edgeless templates (`build-edgeless.mjs`)

```bash
yarn build:edgeless
```

1. Reads ZIP files from `edgeless-snapshot/<category>/`
2. Extracts the BlockSuite snapshot JSON + embedded assets from each ZIP
3. Rewrites `sourceId` references to point to bundled static asset URLs
4. Writes processed JSON files to `edgeless/<category>/`
5. Generates `edgeless-templates.gen.ts` importing all JSONs, grouped by category

### Stickers (`build-stickers.mjs`)

```bash
yarn build:stickers
```

1. Reads `Cover/*.svg` and `Content/*.svg` pairs from each `stickers/<category>/` subdirectory
2. Hashes each content SVG (SHA256, base64) for deduplication
3. Generates `stickers-templates.gen.ts` importing all SVG pairs with metadata

### Full rebuild

```bash
yarn build   # runs both build:edgeless and build:stickers
```

The `.gen.ts` files are auto-generated — never edit them manually.

---

## Adding templates

### New edgeless template

1. Export a workspace page from AFFiNE as a ZIP file
2. Place the ZIP in `edgeless-snapshot/<category>/` (create the category folder if new)
3. Run `yarn build:edgeless`

### New sticker

1. Create a `Cover.svg` (picker thumbnail) and `Content.svg` (canvas insert) pair
2. Place them in `stickers/<category>/Cover/` and `stickers/<category>/Content/`
3. Run `yarn build:stickers`

### Onboarding template

Per README: export workspace pages as ZIP → unzip → place JSON files in `onboarding/` → run `yarn postinstall`.

---

## Search implementation

`search(query)` uses **Longest Common Subsequence (LCS)** matching across all template names in all categories. This gives fuzzy, order-insensitive matching (e.g. `"brnstm"` matches `"Brainstorming"`).

---

## Usage in `@affine/core`

The `_common/setup.ts` in the blocksuite playground (and the core template extension) calls:

```typescript
import { builtInTemplates } from '@affine/templates/edgeless'

// Register with BlockSuite's template manager
setupEdgelessTemplate(builtInTemplates)

// Query in the template picker UI
const categories = await builtInTemplates.categories()
const results = await builtInTemplates.search('marketing')
const templates = await builtInTemplates.list('Presentation')
```
