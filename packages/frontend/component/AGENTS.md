# @affine/component

AFFiNE's shared React design system. Provides UI primitives, complex feature components, hooks, Lit↔React bridge utilities, and the global theme/font setup. Used by every frontend app target (`web`, `electron-renderer`, `mobile`, `ios`, `android`).

## Layout

```
src/
  index.ts                  # Main barrel export (re-exports everything)
  ui/                       # Core UI primitives
    audio-player/           # Audio playback with waveform
    avatar/                 # User avatar (Radix Avatar)
    button/                 # Button (variants, sizes, prefix/suffix, loading, tooltip)
    checkbox/               # Checkbox (Radix)
    date-picker/            # Calendar + week date picker
    divider/                # Horizontal/vertical separator
    dnd/                    # Drag & drop (Pragmatic DnD + drop indicators)
    drag-handle/            # DnD handle
    editable/               # Inline editable text
    empty/                  # Empty-state display
    error-message/          # Error message
    icon-name-editor/       # Icon + name editing
    icon-picker/            # Emoji & AFFiNE icon picker (multi-panel)
    input/                  # Text input (status variants: error/success/warning)
    layout/                 # Layout primitives
    loading/                # Loading spinner
    lottie/                 # Lottie animation wrapper
    masonry/                # Masonry grid layout
    menu/                   # Adaptive menu (desktop context menu / mobile bottom sheet)
    modal/                  # Dialog system (animations, fullscreen, persistent)
    notification/           # Toast notifications (desktop / mobile variants)
    popover/                # Floating popover (Radix)
    progress/               # Progress bar (Radix)
    property/               # Property editing panel
    radio/                  # Radio group
    safe-area/              # Mobile safe area padding
    scrollbar/              # Custom scrollbar
    skeleton/               # Skeleton loading state
    slider/                 # Range slider (Radix)
    switch/                 # Toggle switch
    table/                  # Table components
    tabs/                   # Tab navigation
    themed-img/             # Image with light/dark theme variants
    toast/                  # Toast service (imperative API)
    tooltip/                # Tooltip (Radix)
  components/               # Complex, feature-specific components
    affine-banner/          # AFFiNE branded banner
    affine-other-page-layout/
    auth-components/        # Auth UI (password input, etc.)
    card/                   # Card + block-card
    global-loading/         # Global loading overlay
    import-page/            # Page import UI
    member-components/      # Team member management (invite modal)
    not-found-page/         # 404 page
    notification-center/    # Notification center panel
    page-detail-skeleton/   # Page detail skeleton
    provider-composer/      # Provider composition utility
    rename-modal/           # Rename dialog
    setting-components/     # Settings UI building blocks
  hooks/                    # Shared React hooks
    focus-and-select.ts     # useAutoFocus, useAutoSelect
    use-debounce-callback.ts
    use-disposable.ts
    use-ref-effect.ts
    use-theme-color-meta.ts
    use-theme-value.ts
  lit-react/                # Lit Web Component ↔ React integration
    create-component.ts     # createReactComponentFromLit()
    lit-portal/             # Portal for Lit components in React tree
    to-react-node.ts
    utils.ts
  theme/                    # Design tokens + global styles
    fonts.css               # Font-face declarations (Inter, IBM Plex Mono, etc.)
    global.css              # Global CSS resets
    theme.css.ts            # Vanilla Extract theme variable wiring
    index.ts                # Imports @toeverything/theme
  styles/                   # CSS helper utilities
  fonts/                    # Font files (Inter, IBM Plex Mono, Kalam, Source Code Pro, etc.)
  utils/                    # Utility functions
    observe-intersection.ts
    observe-resize.ts
    view-transition.ts      # startScopedViewTransition()
    with-unit.ts
```

---

## Export paths

```typescript
// Main barrel — imports everything
import { Button, Modal, useAutoFocus } from '@affine/component'

// Scoped UI paths
import { Button } from '@affine/component/ui/button'
import { Modal }  from '@affine/component/ui/modal'

// Complex components
import { RenameModal } from '@affine/component/rename-modal'

// Theme tokens
import { ... } from '@affine/component/theme'
```

---

## Styling architecture

All components use **Vanilla Extract** (`.css.ts` files, zero-runtime). Styles are compiled to static CSS at build time.

### Design tokens

```typescript
import { cssVar }   from '@toeverything/theme'     // v1 tokens (legacy)
import { cssVarV2 } from '@toeverything/theme/v2'  // v2 tokens (current)

// Semantic token names (v2)
cssVarV2('button/primary')
cssVarV2('text/primary')
cssVarV2('icon/primary')
cssVarV2('layer/background/primary')
```

### Internal CSS variables pattern

Components use `createVar()` to expose overridable CSS variables:

```typescript
// button.css.ts
import { style, createVar } from '@vanilla-extract/css'

const bgVar   = createVar('bg')
const textVar = createVar('fg')

export const button = style({
  vars: {
    [bgVar]:   cssVarV2('button/primary'),
    [textVar]: cssVarV2('button/pureWhiteText'),
  },
  backgroundColor: bgVar,
  color: textVar,
})
```

Variant selection uses **data attributes** (not class proliferation):

```tsx
<button data-size="large" data-variant="primary" className={styles.button} />
```

---

## Core components

### `Button`

```tsx
import { Button } from '@affine/component'

<Button
  variant="primary"   // 'primary' | 'secondary' | 'plain' | 'error' | 'success'
  size="default"      // 'default' | 'large' | 'extraLarge' | 'small' | 'iconSmall'
  prefix={<PlusIcon />}
  suffix={<ChevronIcon />}
  loading={isPending}
  tooltip="Create page"
  onClick={handleClick}
>
  New Page
</Button>
```

### `Input`

```tsx
<Input
  status="error"   // 'default' | 'error' | 'success' | 'warning'
  preFix={<SearchIcon />}
  endFix={<ClearButton />}
  placeholder="Search…"
/>
```

### `Modal`

Built on Radix Dialog. Supports multiple open animations:

```tsx
<Modal
  open={open}
  onOpenChange={setOpen}
  animation="fadeScaleTop"  // 'fadeScaleTop' | 'slideBottom' | 'slideRight' | 'none'
  fullScreen={false}
  persistent={false}        // blocks backdrop click / Escape
  width={480}
>
  <ModalWrapper>…content…</ModalWrapper>
</Modal>
```

Pre-built variants: `ConfirmModal` (yes/no), `PromptModal` (text input).

### `Menu`

Adaptive — renders desktop context menu or mobile bottom sheet based on `BUILD_CONFIG.isMobileEdition`:

```tsx
// Works the same on desktop and mobile
<Menu items={<>
  <MenuItem onClick={…}>Rename</MenuItem>
  <MenuSeparator />
  <MenuItem type="danger" onClick={…}>Delete</MenuItem>
</>}>
  <IconButton><MoreHorizontalIcon /></IconButton>
</Menu>
```

### Notification / Toast

Service-based API — call from anywhere (no JSX needed):

```typescript
import { notify } from '@affine/component'

notify.success({ title: 'Saved', message: 'Changes saved.' })
notify.error({ title: 'Failed', message: err.message })
notify({ title: 'Info', duration: 3000 })
```

Desktop: floating top-right. Mobile: full-width bottom. Both built on Radix Toast.

### `IconPicker`

Multi-panel picker (emoji + AFFiNE icons):

```tsx
<IconPicker
  onSelect={({ type, unicode, name, color }) => {
    // type: 'emoji' | 'affineIcon'
    // unicode: emoji codepoint (emoji type)
    // name: icon identifier (affineIcon type)
  }}
/>
```

### `DnD` (Drag & Drop)

Pragmatic DnD (`@atlaskit/pragmatic-drag-and-drop`):

```tsx
import { DropIndicator, useDragHandle, DnDMonitor } from '@affine/component/ui/dnd'

// Visual drop target indicator
<DropIndicator edge="bottom" gap="8px" />

// Monitor drag events globally
<DnDMonitor onDrop={handleDrop} />
```

### `DatePicker`

```tsx
<DatePicker value={date} onChange={setDate} />
<WeekDatePicker value={weekDate} onChange={setWeekDate} />
```

---

## Hooks

```typescript
import {
  useAutoFocus,          // focuses element on mount
  useAutoSelect,         // selects input text on mount
  useThemeValue,         // reads a CSS variable value at runtime
  useThemeColorMeta,     // theme color metadata
  useDebounceCallback,   // debounced callback
  useRefEffect,          // useEffect that receives the DOM node
  useDisposable,         // cleanup pattern (IDisposable)
} from '@affine/component'
```

---

## Lit↔React bridge (`lit-react/`)

BlockSuite uses Lit Web Components. This bridge embeds them inside React trees:

```typescript
import { createReactComponentFromLit } from '@affine/component'
import { SomeLitElement } from '@blocksuite/affine'

// Wraps a Lit custom element as a React component with typed props
const SomeReactComponent = createReactComponentFromLit({
  react: React,
  elementClass: SomeLitElement,
})
```

`useLitPortal()` renders Lit elements into a portal so they don't break React's reconciler.

---

## Theme & fonts

```typescript
// In app entry (setup.ts)
import '@affine/component/theme'
// → loads font-face declarations, global CSS resets, and CSS variable definitions
```

**Bundled fonts:**

| Family | Used for |
|---|---|
| Inter | Primary UI text |
| IBM Plex Mono | Code blocks |
| Kalam | Handwriting style |
| Source Code Pro | Code / monospace alt |
| Source Serif 4 | Serif body text |
| Space Mono | Monospace alt |

---

## Mobile adaptation

Components check `BUILD_CONFIG.isMobileEdition` at compile time:

```typescript
// Resolved at bundle time — no runtime overhead
const Menu = BUILD_CONFIG.isMobileEdition ? MobileMenu : DesktopMenu
```

Affected components: `Menu`, `Notification`, `Button` (no hover states), `Modal` (slide-up animation on mobile), `Input`.

---

## View transitions

```typescript
import { startScopedViewTransition } from '@affine/component'

// Wraps a state update in the View Transitions API for animated page changes
startScopedViewTransition(containerEl, () => {
  navigate('/new-page')
})
```

---

## Storybook

```bash
yarn dev            # Storybook dev server (port 6006)
yarn build:storybook
```

Stories live alongside components: `src/ui/**/*.stories.tsx`. The preview includes a light/dark theme toggle and i18n provider.

---

## Key dependencies

- `@toeverything/theme` — design tokens (v1 + v2 CSS variables)
- `@radix-ui/*` — Avatar, Checkbox, Dialog, Dropdown, Popover, Progress, Slider, Switch, Tabs, Toast, Tooltip
- `@atlaskit/pragmatic-drag-and-drop` — drag and drop
- `@blocksuite/icons/rc` — icon set
- `lottie-react` — Lottie animations
- `react-transition-state` — animation state machine
- `next-themes` — theme switching
- `dayjs` — date utilities
- `clsx` — class composition
- `jotai` — local atom state in complex components
