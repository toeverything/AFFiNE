# @affine/core

The heart of AFFiNE's frontend. Contains all shared app logic — 69 feature modules, routes, services, stores, BlockSuite editor integration, commands, and the bootstrap flow. Every app target (`web`, `electron-renderer`, `mobile`, `ios`, `android`) imports from here.

## Layout

```
src/
  bootstrap/              # App initialization (env, polyfills, telemetry)
  blocksuite/             # BlockSuite editor integration & view extensions
  commands/               # Command registry (command palette entries)
  components/             # Shared React components, hooks, providers
  desktop/                # Desktop-only routes + Electron-specific pages
  mobile/                 # Mobile-only routes + mobile-specific pages
  modules/                # 69 feature modules (DI-registered services/entities)
  types/                  # TypeScript type definitions
  utils/                  # Utility functions (clipboard, encoding, etc.)
```

---

## Module system

`src/modules/` is the core of the application. Each module registers services, stores, entities, and scopes into the `@toeverything/infra` DI framework via a `configure<Name>Module(framework)` function.

### DI component types

| Type | Lifecycle | Purpose |
|---|---|---|
| `Service` | Singleton per scope | Business logic, public API |
| `Entity` | Created on demand | Reactive wrapper around a domain object |
| `Store` | Singleton per scope | Data source backing entities |
| `Scope` | Context container | Groups related services; child of parent scope |
| `impl()` | — | Swap concrete implementation per platform |

### Registration pattern

```typescript
// modules/workspace/index.ts
export function configureWorkspaceModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(WorkspacesService, [WorkspaceFlavoursService])
    .service(WorkspaceListService)
    .service(WorkspaceService)
    .entity(Workspace, [WorkspaceScope, FeatureFlagService])
    .impl(WorkspaceLocalState, IDBWorkspaceLocalState, [GlobalCacheService])
}
```

All modules are wired together in `configureCommonModules(framework)` (called by every app target). Platform-specific overrides use `.impl()`.

### Entity → Service → React pattern

```
Store  (raw data, Memento / Yjs / GraphQL)
  ↓
Entity (reactive LiveData wrapper + business logic)
  ↓
Service (public façade — createEntity, get, list)
  ↓
useService(SomeService) in React components
```

---

## Key modules

### `workspace` — Workspace management

```typescript
// Services
WorkspacesService    // all workspaces list, create, delete
WorkspaceService     // current workspace (within WorkspaceScope)
WorkspaceEngineService // storage engine (nbstore)
WorkspaceListService // reactive workspace list

// Entity
class Workspace {
  readonly id: string
  readonly rootYDoc: YDoc               // root Yjs document
  get docCollection(): WorkspaceInterface // BlockSuite doc collection
  get docs()                            // all docs in workspace
  get engine()                          // storage + indexer + awareness
}

// Scope
WorkspaceScope  // child services scoped to one workspace
```

### `doc` — Document entity management

```typescript
// Services
DocsService    // create, delete, list docs
DocService     // current doc (within DocScope)

// Entity
class Doc {
  readonly yDoc: YDoc
  readonly blockSuiteDoc: Store  // BlockSuite Store
  readonly title$: LiveData<string>
  readonly meta$: LiveData<DocMeta>
  readonly properties$: LiveData<DocProperties>
  readonly primaryMode$: LiveData<'page' | 'edgeless'>
  readonly createdAt$, updatedAt$, createdBy$, updatedBy$: LiveData<...>
}

// Stores
DocsStore           // manages doc list
DocPropertiesStore  // per-doc metadata

// Scope
DocScope  // wraps docId, record, blockSuiteDoc
```

### `editor` — BlockSuite editor instance management

```typescript
// Entity
class Editor {
  // scoped to: WorkspaceScope → DocScope → EditorScope
}

// Services
EditorsService  // creates and manages Editor instances per Doc
EditorService   // current editor

// Scope
EditorScope
```

### `workbench` — Tab/view management

The workbench is AFFiNE's multi-tab system. Each workspace has one `Workbench` containing multiple `View`s (tabs).

```typescript
class Workbench {
  readonly views$: LiveData<View[]>
  readonly activeViewIndex$: LiveData<number>
  readonly activeView$: LiveData<View>
  readonly location$: LiveData<Location>

  // Sidebar state
  readonly sidebarOpen$: LiveData<boolean>
  readonly sidebarWidth$: LiveData<number>
  setSidebarOpen(open: boolean): void

  // Navigation
  openPage(
    location: To,
    options?: { at: 'beside' | 'active' | 'head' | 'tail' | number }
  ): void
}

class View {
  readonly id: string
  readonly location$: LiveData<Location>
  readonly title$: LiveData<string>
}
```

Platform-specific implementations:
- `configureBrowserWorkbenchModule(framework)` — browser tab/URL sync
- `configureDesktopWorkbenchModule(framework)` — Electron window + state sync

### `cloud` — Server communication & auth

```typescript
// Key services
AuthService         // login, logout, session management
ServerService       // server config, initialized state
GraphQLService      // typed GraphQL client
FetchService        // authenticated HTTP fetch
SubscriptionService // Pro/Team subscription state
UserQuotaService    // storage quota
UserFeatureService  // feature flags from server (Admin, EarlyAccess, etc.)
CloudDocMetaService // cloud-side doc metadata

// Entities
Server       // server config + connection state
AuthSession  // current session (user, token)
Subscription // subscription tier + plan

// Scope
ServerScope  // groups all cloud services for a specific server URL
```

### `storage` — Persistence layer

```typescript
// Abstractions (Memento interface — see @toeverything/infra/storage)
GlobalState         // persistent app state → IDB (browser) or config file (Electron)
GlobalCache         // transient cache → localStorage
GlobalSessionState  // session-only → sessionStorage
CacheStorage        // async large-data storage

// Services
GlobalStateService
GlobalCacheService
GlobalSessionStateService
NbstoreService      // nbstore StoreManager integration
```

Platform impls: `configureLocalStorageStateStorageImpls()` (browser) / `configureElectronStateStorageImpls()` (Electron).

---

## All 69 modules (by category)

### Infrastructure
| Module | Key exports |
|---|---|
| `lifecycle` | `AppLifecycleService` — app start/stop hooks |
| `feature-flag` | `FeatureFlagService` — runtime feature toggles |
| `global-context` | `GlobalContextService` — current workspace/doc/user observables |
| `storage` | `GlobalStateService`, `GlobalCacheService` |
| `telemetry` | `TelemetryService` — analytics events |
| `i18n` | `I18nService` — language switching |
| `navigation` | `NavigationService`, URL helpers |
| `url` | `UrlService` — URL construction |
| `permissions` | `WorkspacePermissionService` — role-based access |
| `quota` | `QuotaModule` — storage quotas |
| `paywall` | `PaywallService` — subscription gating |

### Workspace & Docs
| Module | Key exports |
|---|---|
| `workspace` | `Workspace`, `WorkspacesService`, `WorkspaceScope` |
| `workspace-engine` | Storage engine wiring |
| `workspace-property` | Workspace-level custom properties |
| `workspace-indexer-embedding` | Vector/semantic search |
| `doc` | `Doc`, `DocsService`, `DocScope` |
| `doc-display-meta` | Display name/icon resolution |
| `doc-info` | Doc info panel service |
| `doc-link` | `@doc/` link resolution |
| `doc-summary` | AI-generated summaries |
| `docs-search` | Full-text search |
| `db` | `WorkspaceDBService` — workspace metadata DB |

### Organisation
| Module | Key exports |
|---|---|
| `collection` | `CollectionService` — smart collections with rules |
| `collection-rules` | Filter rule evaluation |
| `tag` | `TagService` — document tagging |
| `favorite` | `FavoriteService` — starred docs |
| `trash` | `TrashService` — soft-delete management |
| `journal` | `JournalService` — daily notes |

### Editor & BlockSuite
| Module | Key exports |
|---|---|
| `editor` | `Editor`, `EditorService`, `EditorScope` |
| `editor-setting` | `EditorSettingService` — per-user editor prefs |
| `workbench` | `Workbench`, `WorkbenchService`, `View`, `ViewScope` |
| `peek-view` | `PeekViewService` — modal doc preview |
| `code-block-preview-renderer` | Shiki syntax highlighting |
| `pdf` | PDF viewer/embed |

### Cloud & Auth
| Module | Key exports |
|---|---|
| `cloud` | `AuthService`, `ServerService`, `SubscriptionService` |
| `share-doc` | `ShareDocService` — public share links |
| `share-menu` | Share UI |
| `comment` | `CommentService` — annotations |
| `blob-management` | `BlobManagementService` — file lifecycle |
| `import-clipper` | Web clipper integration |
| `integration` | Third-party integrations |

### AI
| Module | Key exports |
|---|---|
| `ai-button` | AI entry point button |
| Various `ai-*` | Draft, model, playground, reasoning, tools |

### UI
| Module | Key exports |
|---|---|
| `app-sidebar` | Main sidebar service |
| `dialogs` | `GlobalDialogService` — imperative dialog opening |
| `notification` | `NotificationService` — toast API |
| `theme` | `AppThemeService` — light/dark/system |
| `theme-editor` | Theme customization UI |
| `search-menu` | Global search UI |
| `quicksearch` | Quick open palette |

### Platform
| Module | Key exports |
|---|---|
| `desktop-api` | `DesktopApiService` — `window.apis` bridge |
| `open-in-app` | Desktop app deep link |
| `userspace` | User profile workspace |
| `media` | Media query services |

---

## Routes

### Desktop (`src/desktop/`)

```
/                              → workspace selector / home
/workspace/:workspaceId/*      → workbench (nested)
  /chat                        → AI chat
  /all                         → all documents
  /collection/:collectionId    → collection view
  /tag/:tagId                  → tag view
  /trash                       → trash
  /:pageId                     → document editor
  /:pageId/attachments/:id     → attachment viewer
  /journals                    → daily journals
  /settings                    → workspace settings
/share/:workspaceId/:pageId    → public share redirect
/invite/:inviteId              → workspace invite
/onboarding                    → onboarding flow
/subscribe, /upgrade-to-team   → payment flows
/ai-upgrade-success, /upgrade-success → post-payment
/404, /expired                 → error pages
```

### Mobile (`src/mobile/`)

Same core structure with mobile-specific simplifications. Adds OAuth and magic-link auth routes. Omits payment flows.

### Lazy loading

All routes use `lazy(() => import('./path'))` for code splitting. Dynamic imports are named for webpack chunk grouping.

---

## BlockSuite integration (`src/blocksuite/`)

BlockSuite uses Lit Web Components, not React. The integration layer bridges the two.

```
blocksuite/
  initialization/        # ViewProvider fluent builder for assembling extensions
  manager/               # ViewExtensionManager — registers extensions with BlockSuite
  editors/               # AffineEditorContainer React wrapper
  view-extensions/       # Feature-specific BlockSuite extensions
    ai/                  # AI copilot panel
    cloud/               # Cloud sync awareness
    comment/             # Comment anchoring
    database/            # Database view
    editor-config/       # Editor configuration extensions
    editor-view/         # Custom editor view
    electron/            # Electron-specific APIs
    icon-picker/         # Icon selection
    link-preview-service/# Link unfurling
    mobile/              # Mobile UX adaptations
    pdf/                 # PDF embed
    theme/               # Theme bridge (React theme → BlockSuite)
    turbo-renderer/      # Performance canvas renderer
    code-block-preview/  # Syntax-highlighted preview
    edgeless-block-header/
  store-extensions/      # BlockSuite Store plugins (AI, feature flags)
  ai/                    # AI chat block, AI panel, actions, slides
  block-suite-editor/    # Editor React component
  block-suite-header/    # Editor header bar
  block-suite-mode-switch/# Page ↔ Edgeless mode toggle
  attachment-viewer/     # Attachment preview
  database-block/        # Database view wrapper
  outline-viewer/        # Document outline (headings tree)
  utils/                 # BlockSuite utilities
```

### View extension pattern

Extensions are assembled via the `ViewProvider` fluent API:

```typescript
// initialization/index.ts
const provider = new ViewProvider(framework)
  .init()
  .foundation()         // core BlockSuite extensions
  .editorView()         // AFFiNE editor view
  .theme()              // theme bridge
  .editorConfig()       // per-user editor settings
  .cloud()              // cloud sync + awareness
  .ai()                 // AI copilot
  .comment()            // comments
  .database()           // database view
  .pdf()                // PDF embeds
  // ...more extensions

// Returned extension array is passed to BlockSuite editor
```

---

## Bootstrap flow (`src/bootstrap/`)

```
Platform entry (web/index.tsx, electron-renderer/app.tsx, etc.)
  └── setup.ts
        ├── env.ts            (BUILD_CONFIG, environment detection)
        ├── public-path.ts    (webpack publicPath for assets)
        ├── polyfill/browser  (ResizeObserver, IntersectionObserver, etc.)
        └── telemetry.ts      (Sentry + analytics init)
  └── React render
        └── <App />
              └── FrameworkRoot (DI container)
                    └── configureCommonModules(framework)
                          └── all 69 modules registered
```

---

## Commands system (`src/commands/`)

Populates the command palette with registered commands.

```typescript
import { registerAffineCommand } from '@affine/core/commands'

registerAffineCommand({
  id: 'affine:goto-all-pages',
  category: 'affine:navigation',   // groups commands in palette
  icon: <AllDocsIcon />,
  label: t['com.affine.allPages'](),
  run() {
    workbench.openAll()
  },
})
```

Command categories: `affine:creation`, `affine:navigation`, `affine:settings`, `affine:help`, `affine:updates`, `affine:i18n`.

---

## Components (`src/components/`)

```
components/
  hooks/
    use-navigate-helper.ts   # jumpToPage(), jumpToWorkspace(), etc. (cross-workbench nav)
    use-block-suite-editor.ts
    use-workspace.ts
    use-journal.ts
  providers/
    current-workspace-scope.tsx  # Provides WorkspaceScope to React tree
    current-server-scope.tsx     # ServerScope provider
    workspace-side-effects.tsx   # Event listeners for workspace lifecycle
    swr-config-provider.tsx      # SWR global config
  page-detail-editor.tsx         # Main editor page container
  root-app-sidebar.tsx           # Main sidebar component
  explorer/                      # File tree explorer
  page-list/                     # Document list
  properties/                    # Property panel
  sign-in/                       # Auth flow components
  tags/                          # Tag management
  guard/                         # Route access guards
  filter/                        # Filter UI
  comment/                       # Comment UI
  cloud/                         # Cloud-related components
  mobile/                        # Mobile-specific components
  notification/                  # Toast wrapper
```

### Navigation helpers

```typescript
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper'

const { jumpToPage, jumpToCollections, jumpToTags, jumpToTrash } = useNavigateHelper()
// For cross-workbench navigation (changes URL)
// For within-workbench tab navigation, use WorkbenchService instead
```

---

## State management patterns

### `LiveData<T>` (primary)

```typescript
// Computed from other LiveData
readonly activeView$ = LiveData.computed(get => {
  const views = get(this.views$)
  return views[get(this.activeViewIndex$)]
})

// From Observable
readonly name$ = LiveData.from(observable$, defaultValue)

// In React
const activeView = useLiveData(workbench.activeView$)
```

### `GlobalState` (persistence)

```typescript
// Within a Service
constructor(private readonly globalState: GlobalState) {}

this.globalState.set('theme', 'dark')
this.globalState.get<string>('theme')
this.globalState.watch<string>('theme')  // Observable
```

### Jotai (local UI state)

Used for ephemeral UI state in components where LiveData is overkill.

---

## Multi-platform support

```
configureCommonModules(framework)              // all 69 modules
  +
configureBrowserWorkbenchModule(framework)     // web + mobile
  OR
configureDesktopWorkbenchModule(framework)     // Electron
  +
configureLocalStorageStateStorageImpls(...)    // web + mobile
  OR
configureElectronStateStorageImpls(...)        // Electron
```

Mobile additionally calls `configureMobileModules(framework)`.

---

## Key design constraints

1. **BlockSuite ≠ React** — BlockSuite is Lit Web Components. Never use React APIs inside `src/blocksuite/view-extensions/`. Use `createReactComponentFromLit()` from `@affine/component/lit-react` when you need to embed BlockSuite in React.
2. **Local-first** — Never assume network. Storage reads always go to local nbstore first.
3. **Dispose everything** — Services that hold subscriptions must push to `this.disposables` or call `this.disposables.push(subscription)` to prevent memory leaks.
4. **Platform implementations** — Use `.impl(AbstractClass, ConcreteClass, deps)` instead of `if (isElectron)` in business logic.
