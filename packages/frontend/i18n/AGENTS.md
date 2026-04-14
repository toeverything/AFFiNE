# @affine/i18n

AFFiNE's internationalization package. Wraps `i18next` + `react-i18next` with full TypeScript type safety via code generation from `en.json`. Supports 24 locales with lazy-loading for all non-English languages.

## Layout

```
src/
  index.ts                    # Main barrel export
  react.ts                    # useI18n() React hook
  i18next.ts                  # I18n singleton + setup
  i18n.gen.ts                 # Auto-generated types (DO NOT EDIT)
  i18n-completenesses.json    # Translation coverage % per language (auto-generated)
  resources/
    index.ts                  # Language registry: name, flag, rtl, loader
    en.json                   # Source of truth — all translation keys
    zh-Hans.json              # Simplified Chinese
    zh-Hant.json              # Traditional Chinese
    fr.json, de.json, ja.json, ko.json, ru.json, es.json ...
  utils/
    index.ts
    time.ts                   # i18nTime() — smart date/time formatting
    __tests__/time.spec.ts
build.ts                      # Build pipeline (error sync → codegen → completeness)
cleanup.mjs                   # Removes unused translation keys from all locale files
.i18n-codegen.json            # Codegen config
```

---

## Supported languages (24)

| Language | Code | RTL |
|---|---|---|
| English | `en` | — |
| Simplified Chinese | `zh-Hans` | — |
| Traditional Chinese | `zh-Hant` | — |
| French | `fr` | — |
| German | `de` | — |
| Spanish | `es`, `es-AR`, `es-CL` | — |
| Japanese | `ja` | — |
| Korean | `ko` | — |
| Russian | `ru` | — |
| Italian | `it` | — |
| Polish | `pl` | — |
| Portuguese (Brazil) | `pt-BR` | — |
| Ukrainian | `uk` | — |
| Hindi | `hi` | — |
| Swedish | `sv-SE` | — |
| Danish | `da` | — |
| Norwegian | `nb-NO` | — |
| Greek | `el-GR` | — |
| Catalan | `ca` | — |
| Arabic | `ar` | ✓ |
| Persian/Farsi | `fa` | ✓ |
| Urdu | `ur` | ✓ |

English is bundled. All other languages are **lazy-loaded** (code-split).

---

## API

### `useI18n()` — React hook

```typescript
import { useI18n } from '@affine/i18n'

function MyComponent() {
  const i18n = useI18n()

  // Simple key
  return <span>{i18n['Workspace Settings']()}</span>

  // Key with interpolation
  return <span>{i18n['Heading']({ number: 2 })}</span>

  // Language management
  i18n.language               // 'en' | 'zh-Hans' | ...
  i18n.changeLanguage('fr')   // switch language (lazy-loads if needed)
}
```

Fully typed — IDE autocompletes all valid keys. Invalid keys are compile errors.

### `I18n` — Singleton (outside React)

```typescript
import { I18n } from '@affine/i18n'

// Use in Services, utils, non-React code
const label = I18n['com.affine.settings.workspace.properties.delete.title']()
I18n.changeLanguage('de')
I18n.language
```

### `useAFFiNEI18N()` — Generated hook (auto-generated)

The codegen-produced hook in `src/i18n.gen.ts`. `useI18n()` wraps this — prefer `useI18n()` in application code.

---

## `i18nTime()` — Smart date formatting

Formats timestamps as human-readable strings, switching between relative and absolute formats.

```typescript
import { i18nTime } from '@affine/i18n'

// Relative time (auto-selects granularity)
i18nTime(Date.now() - 30_000, { relative: true })    // → "30s ago"
i18nTime(Date.now() - 120_000, { relative: true })   // → "2m ago"
i18nTime(yesterday, { relative: true })               // → "yesterday"
i18nTime(lastWeek, { relative: true })                // → "Oct 9"

// Absolute time
i18nTime(date, { absolute: { accuracy: 'minute' } })  // → "2024-10-10 13:30 PM"
i18nTime(date, { absolute: { accuracy: 'day', noYear: true } }) // → "Oct 10"

// Relative with fallback to absolute after max duration
i18nTime(date, { relative: { max: [1, 'day'] } })
// Shows relative if < 1 day old, else shows absolute date

// Input types: number (unix ms), string (ISO), Date
```

**Accuracy options:** `'seconds'` | `'minutes'` | `'hours'` | `'days'` | `'months'` | `'years'`

---

## Adding a new translation key

1. **Add to `src/resources/en.json`** (source of truth):

```json
{
  "com.affine.my-feature.title": "My Feature",
  "com.affine.my-feature.description": "Does {{action}} for {{count}} items"
}
```

2. **Rebuild to regenerate types:**

```bash
yarn build   # from packages/frontend/i18n/
```

This updates `src/i18n.gen.ts` — the new keys are now typed.

3. **Use in code:**

```typescript
const i18n = useI18n()
i18n['com.affine.my-feature.title']()
i18n['com.affine.my-feature.description']({ action: 'sync', count: 3 })
```

4. **Translations** are synced to the Tolgee platform automatically on merge to `develop`. Community translators add translations there, then they are pulled back via CI.

---

## Translation key conventions

- **Simple UI labels**: `"Bold"`, `"Cancel"`, `"Delete"` (no namespace)
- **Feature-specific**: `"com.affine.settings.workspace.name"` (dotted namespace)
- **Error messages**: `"error.SOME_ERROR_CODE"` (synced from `@affine/server` error definitions)
- **Interpolation**: `"Hello {{name}}"`, `"{{count}} items"`
- **Plural/context**: `_` separator for plurals, `$` for context variants (i18next convention)
- **Payment keys** (`com.affine.payment.modal.*`): Never removed by cleanup tool

---

## Build pipeline (`build.ts`)

Running `yarn build` executes 4 steps in sequence:

1. **Error sync** — imports error name constants from `@affine/server` and adds `error.<ErrorName>` keys to `en.json`
2. **Resource cleanup** *(optional)* — scans all frontend source files for referenced keys; removes unreferenced keys from all locale JSON files (skips payment modal keys)
3. **Codegen** — runs `@magic-works/i18n-codegen` on `en.json` → writes `src/i18n.gen.ts`
4. **Completeness** — counts translated vs total keys per language → writes `src/i18n-completenesses.json`

```bash
yarn build       # full pipeline
yarn dev         # same, with file watching
```

---

## Cleanup tool (`cleanup.mjs`)

Standalone script that removes unused keys to keep locale files lean.

```bash
node packages/frontend/i18n/cleanup.mjs
```

- Scans all `packages/frontend/**/*.{ts,tsx}` files for key references
- Handles dynamic prefixes (e.g. template string keys with partial matches)
- Removes keys from all 24 locale JSON files
- Skips `com.affine.payment.modal.*`

---

## Codegen configuration (`.i18n-codegen.json`)

```json
{
  "input": "./src/resources/en.json",
  "output": "./src/i18n.gen",
  "parser": {
    "type": "i18next",
    "contextSeparator": "$",
    "pluralSeparator": "_"
  },
  "generator": {
    "type": "i18next/react-hooks",
    "hooks": "useAFFiNEI18N",
    "emitTS": true,
    "shouldUnescape": true
  }
}
```

`src/i18n.gen.ts` is **auto-generated** — never edit it manually.

---

## Language registry (`src/resources/index.ts`)

```typescript
export type Language = {
  name: string           // English name: "Simplified Chinese"
  originalName: string   // Native: "简体中文"
  flagEmoji: string      // "🇨🇳"
  rtl?: boolean          // true for Arabic, Persian, Urdu
  resource: LanguageResource | (() => Promise<{ default: LanguageResource }>)
  // English: inline object; all others: dynamic import
}

export const SUPPORTED_LANGUAGES: Language[]
```

---

## Tolgee integration (translation workflow)

```
Developer adds key to en.json → merge to develop
  → CI action `languages-sync` → pushes keys to https://i18n.affine.pro
    → Community translators update translations on Tolgee
      → CI pulls translations → committed to repo

# Manual operations:
export TOLGEE_API_KEY=tgpak_XXXXXXX
npm run sync-languages      # push en.json keys to Tolgee
npm run download-resources  # pull all translations from Tolgee
```

---

## Exports

```typescript
// from '@affine/i18n'
export { I18n, createI18nWrapper, getOrCreateI18n }   // core singleton
export { useI18n, I18nextProvider, Trans, useTranslation } // React
export { SUPPORTED_LANGUAGES, type Language }          // language registry
export { i18nTime, type TimeUnit }                     // time utility
export { i18nCompletenesses }                          // coverage data
```
