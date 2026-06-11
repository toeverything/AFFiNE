# Plan: AFFiNE Mobile con Flutter — Feature First + Riverpod + GoRouter

## 1. Resumen

Construir una app mobile nativa para AFFiNE utilizando Flutter, con **Feature First Architecture**, **Riverpod** para manejo de estado e inyección de dependencias, y **GoRouter** para navegación declarativa.

La app reemplazará el actual wrapper Capacitor (WebView) con una experiencia nativa, pero reutilizando:

- **API Graphql** de AFFiNE (backend server)
- **Biblioteca nativa Rust** (packages/frontend/mobile-native) via UniFFI
- **Modelos de datos** (Workspace, Doc, Collection, Tag, etc.)

## 2. Stack Tecnológico

| Componente        | Tecnología                        |
|-------------------|-----------------------------------|
| Lenguaje          | Dart 3.x                          |
| UI Framework      | Flutter 3.x (Material 3)          |
| State Management  | Riverpod (riverpod + flutter_riverpod + riverpod_annotation) |
| Navigation        | GoRouter (go_router)              |
| GraphQL Client    | graphql + ferry (codegen)         |
| Local DB          | drift (SQLite) + Isar (document cache) |
| DI                | Riverpod (auto-dispose providers) |
| Code Generation   | build_runner + riverpod_generator + ferry_generator + drift_generator |
| Rust FFI          | flutter_rust_bridge o uniffi dart bindings |
| Secure Storage    | flutter_secure_storage            |
| Linting           | flutter_lints + custom rules       |

## 3. Estructura de Directorios

```
packages/frontend/apps/flutter-app/
├── lib/
│   ├── main.dart                          # Entry point + bootstrap
│   ├── app.dart                           # MaterialApp.router + theme
│   │
│   ├── core/
│   │   ├── constants/
│   │   │   ├── app_constants.dart
│   │   │   ├── api_constants.dart
│   │   │   └── asset_paths.dart
│   │   ├── theme/
│   │   │   ├── app_theme.dart             # Material 3 theme
│   │   │   ├── colors.dart                # AFFiNE palette (light/dark)
│   │   │   ├── typography.dart
│   │   │   └── dimensions.dart
│   │   ├── network/
│   │   │   ├── graphql_client.dart        # Ferry/GraphQL client config
│   │   │   ├── graphql_client_provider.dart
│   │   │   ├── auth_interceptor.dart
│   │   │   └── api_exceptions.dart
│   │   ├── database/
│   │   │   ├── app_database.dart          # Drift DB definition
│   │   │   ├── database_provider.dart
│   │   │   └── migrations/
│   │   ├── router/
│   │   │   ├── app_router.dart            # GoRouter config + routes
│   │   │   ├── route_names.dart           # Route path constants
│   │   │   ├── auth_guard.dart            # Redirect logic
│   │   │   └── route_transitions.dart
│   │   ├── utils/
│   │   │   ├── debouncer.dart
│   │   │   ├── logger.dart
│   │   │   └── date_formatter.dart
│   │   └── extensions/
│   │       ├── context_extensions.dart
│   │       └── string_extensions.dart
│   │
│   ├── shared/
│   │   ├── widgets/
│   │   │   ├── app_scaffold.dart          # Shell with nav bar + drawer
│   │   │   ├── loading_widget.dart
│   │   │   ├── error_display.dart
│   │   │   ├── empty_state.dart
│   │   │   ├── avatar_widget.dart
│   │   │   └── doc_card.dart
│   │   ├── providers/
│   │   │   ├── current_user_provider.dart
│   │   │   ├── current_workspace_provider.dart
│   │   │   └── theme_mode_provider.dart
│   │   └── models/
│   │       ├── api_response.dart
│   │       └── pagination.dart
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── data/
│   │   │   │   ├── datasources/
│   │   │   │   │   └── auth_remote_datasource.dart
│   │   │   │   ├── repositories/
│   │   │   │   │   └── auth_repository_impl.dart
│   │   │   │   ├── models/
│   │   │   │   │   ├── user_dto.dart
│   │   │   │   │   └── login_request_dto.dart
│   │   │   │   └── graphql/
│   │   │   │       ├── mutations/
│   │   │   │       │   ├── sign_in.graphql
│   │   │   │       │   ├── sign_up.graphql
│   │   │   │       │   └── send_verify_email.graphql
│   │   │   │       └── fragments/
│   │   │   │           └── user_fragment.graphql
│   │   │   ├── domain/
│   │   │   │   ├── entities/
│   │   │   │   │   ├── user.dart
│   │   │   │   │   └── auth_state.dart
│   │   │   │   └── repositories/
│   │   │   │       └── auth_repository.dart   # Interface
│   │   │   └── presentation/
│   │   │       ├── providers/
│   │   │       │   ├── auth_provider.dart         # StateNotifierProvider
│   │   │       │   ├── auth_state.dart
│   │   │       │   └── auth_repository_provider.dart
│   │   │       ├── pages/
│   │   │       │   ├── sign_in_page.dart
│   │   │       │   ├── sign_up_page.dart
│   │   │       │   ├── magic_link_page.dart
│   │   │       │   └── oauth_callback_page.dart
│   │   │       └── widgets/
│   │   │           ├── auth_text_field.dart
│   │   │           └── social_login_buttons.dart
│   │   │
│   │   ├── workspace/
│   │   │   ├── data/
│   │   │   │   ├── datasources/
│   │   │   │   │   └── workspace_remote_datasource.dart
│   │   │   │   ├── repositories/
│   │   │   │   │   └── workspace_repository_impl.dart
│   │   │   │   └── models/
│   │   │   │       └── workspace_dto.dart
│   │   │   ├── domain/
│   │   │   │   ├── entities/
│   │   │   │   │   └── workspace.dart
│   │   │   │   └── repositories/
│   │   │   │       └── workspace_repository.dart
│   │   │   └── presentation/
│   │   │       ├── providers/
│   │   │       │   ├── workspace_list_provider.dart
│   │   │       │   ├── current_workspace_provider.dart
│   │   │       │   └── workspace_repository_provider.dart
│   │   │       ├── pages/
│   │   │       │   ├── workspace_list_page.dart
│   │   │       │   └── workspace_home_page.dart
│   │   │       └── widgets/
│   │   │           ├── workspace_card.dart
│   │   │           └── workspace_drawer.dart
│   │   │
│   │   ├── document/
│   │   │   ├── data/
│   │   │   │   ├── datasources/
│   │   │   │   │   ├── document_remote_datasource.dart
│   │   │   │   │   └── document_local_datasource.dart
│   │   │   │   ├── repositories/
│   │   │   │   │   └── document_repository_impl.dart
│   │   │   │   └── models/
│   │   │   │       └── document_dto.dart
│   │   │   ├── domain/
│   │   │   │   ├── entities/
│   │   │   │   │   └── document.dart
│   │   │   │   └── repositories/
│   │   │   │       └── document_repository.dart
│   │   │   └── presentation/
│   │   │       ├── providers/
│   │   │       │   ├── document_list_provider.dart
│   │   │       │   ├── document_detail_provider.dart
│   │   │       │   └── document_repository_provider.dart
│   │   │       ├── pages/
│   │   │       │   ├── all_docs_page.dart
│   │   │       │   └── document_detail_page.dart
│   │   │       └── widgets/
│   │   │           ├── document_editor.dart        # Rich text editor placeholder
│   │   │           ├── doc_card_widget.dart
│   │   │           └── doc_info_sheet.dart
│   │   │
│   │   ├── collection/
│   │   │   ├── data/
│   │   │   ├── domain/
│   │   │   └── presentation/
│   │   │       ├── providers/
│   │   │       ├── pages/
│   │   │       │   ├── collections_list_page.dart
│   │   │       │   └── collection_detail_page.dart
│   │   │       └── widgets/
│   │   │
│   │   ├── tag/
│   │   │   └── presentation/
│   │   │       ├── pages/
│   │   │       │   ├── tags_list_page.dart
│   │   │       │   └── tag_detail_page.dart
│   │   │       └── widgets/
│   │   │
│   │   ├── search/
│   │   │   └── presentation/
│   │   │       ├── providers/
│   │   │       │   └── search_provider.dart
│   │   │       ├── pages/
│   │   │       │   └── search_page.dart
│   │   │       └── widgets/
│   │   │           ├── search_bar.dart
│   │   │           └── search_result_item.dart
│   │   │
│   │   ├── journal/
│   │   │   └── presentation/
│   │   │       ├── providers/
│   │   │       │   └── journal_provider.dart
│   │   │       ├── pages/
│   │   │       │   └── journals_page.dart
│   │   │       └── widgets/
│   │   │           └── journal_date_picker.dart
│   │   │
│   │   ├── settings/
│   │   │   └── presentation/
│   │   │       ├── providers/
│   │   │       │   ├── settings_provider.dart
│   │   │       │   └── appearance_provider.dart
│   │   │       ├── pages/
│   │   │       │   ├── settings_page.dart
│   │   │       │   ├── appearance_page.dart
│   │   │       │   ├── user_profile_page.dart
│   │   │       │   └── subscription_page.dart
│   │   │       └── widgets/
│   │   │
│   │   └── ai/                    # Opcional — AI Copilot
│   │       └── presentation/
│   │           ├── providers/
│   │           ├── pages/
│   │           │   └── ai_chat_page.dart
│   │           └── widgets/
│   │
│   └── native/
│       ├── mobile_native_bridge.dart    # Rust FFI binding
│       ├── native_db.dart               # SQLite via Rust
│       ├── native_crypto.dart
│       └── native_provider.dart
│
├── assets/
│   ├── images/
│   ├── icons/
│   └── fonts/                     # Fira Sans, Inter (AFFiNE brand)
│
├── test/
│   ├── features/
│   │   ├── auth/
│   │   ├── workspace/
│   │   └── document/
│   ├── core/
│   └── helpers/
│
├── graphql/                       # .graphql files for ferry codegen
│   ├── fragments/
│   ├── mutations/
│   └── queries/
│
├── pubspec.yaml
├── analysis_options.yaml
├── build.yaml                     # build_runner config
└── l10n/                          # Localization (ES/EN)
```

## 4. GoRouter — Mapa de Rutas

```
/                               → WorkspaceListPage (seleccionar workspace)
/sign-in                        → SignInPage
/sign-up                        → SignUpPage
/magic-link                     → MagicLinkPage
/oauth/callback                 → OAuthCallbackPage
/workspace/:wsId                → WorkspaceShell (BottomNavigationBar)
  /workspace/:wsId/home         → HomePage (recientes)
  /workspace/:wsId/all          → AllDocsPage
  /workspace/:wsId/collections  → CollectionsListPage
  /workspace/:wsId/tags         → TagsListPage
  /workspace/:wsId/journals     → JournalsPage
  /workspace/:wsId/search       → SearchPage
  /workspace/:wsId/doc/:pageId  → DocumentDetailPage
  /workspace/:wsId/collection/:collId → CollectionDetailPage
  /workspace/:wsId/tag/:tagId   → TagDetailPage
/settings                       → SettingsPage
/settings/appearance            → AppearancePage
/settings/profile               → UserProfilePage
/settings/subscription          → SubscriptionPage
/ai/:wsId                       → AIChatPage
```

Se usa `ShellRoute` de GoRouter para el scaffold principal con BottomNavigationBar + Drawer lateral (navegación tipo árbol).

## 5. Riverpod — Arquitectura de Providers

Capa de providers se divide en:

### 5.1 Core Providers (inyectados en app start)
```dart
// graphql_client_provider.dart
final graphqlClientProvider = Provider<GraphQLClient>((ref) { ... });

// app_database_provider.dart
final appDatabaseProvider = Provider<AppDatabase>((ref) { ... });

// secure_storage_provider.dart
final secureStorageProvider = Provider<FlutterSecureStorage>((ref) { ... });
```

### 5.2 Feature Providers (por feature)
```dart
// auth_provider.dart
// Autodispose cuando no se usa
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final client = ref.watch(graphqlClientProvider);
  return AuthRepositoryImpl(GqlAuthDataSource(client));
});

@riverpod
class AuthNotifier extends _$AuthNotifier {
  @override
  AuthState build() => AuthState.unauthenticated();
  
  Future<void> signIn(String email, String password) async { ... }
  Future<void> signOut() async { ... }
}
```

### 5.3 Patrones Principales

| Provider Pattern         | Uso                                   |
|--------------------------|---------------------------------------|
| `Provider`               | Repositorios, servicios estáticos     |
| `FutureProvider`         | Fetch datos una vez (workspace list)  |
| `StreamProvider`         | Tiempo real (realtime updates)        |
| `NotifierProvider`       | Estado complejo (auth, editor)        |
| `AsyncNotifierProvider`  | Estado async + mutable (documentos)   |

Cada feature expone UN provider principal (el Notifier/StateNotifier) y providers internos para inyección.

## 6. Flujo de Datos

```
[GraphQL API / Local DB]
        │
        ▼
[DataSources] ───→ [DTOs, GraphQL queries]
        │
        ▼
[Repository (impl)] ───→ [Domain Entity]
        │
        ▼
[Riverpod Provider] ───→ [State / AsyncValue]
        │
        ▼
[Widget / Page] ───→ [UI reactiva]
```

- **DataSources**: GraphQL remoto (Ferry) + SQLite local (Drift)
- **Repositories**: Clean Architecture — interfaz en domain/, impl en data/
- **Providers**: Exclusivamente en presentation/ — conectan UI con capa de datos
- **Modelos DTO**: Solo en data/ — nunca filtran a UI
- **Entidades**: Modelos de dominio puros en domain/entities/

## 7. Implementación por Fases

### Fase 1: Proyecto Base + Auth
- [ ] Crear proyecto Flutter con `flutter create --org app.affine flutter-app`
- [ ] Configurar pubspec.yaml con dependencias (riverpod, go_router, ferry, drift, etc.)
- [ ] Configurar build.yaml para code generation
- [ ] Implementar core/theme (Material 3 con colores AFFiNE)
- [ ] Implementar core/router/ (GoRouter con auth_guard redirect)
- [ ] Implementar core/network/ (GraphQL client config)
- [ ] Implementar feature auth completo (sign in, sign up, magic link, OAuth)
- [ ] Secure storage para tokens JWT
- [ ] Pantalla de selección de workspace

### Fase 2: Workspace + Documents
- [ ] Implementar workspace feature (list, select, members)
- [ ] Implementar document feature (list all docs, detail view)
- [ ] Integrar con GraphQL (queries reales del backend AFFiNE)
- [ ] Implementar offline cache con drift
- [ ] Implementar editor de documentos (rich text) — placeholder inicial

### Fase 3: Colecciones, Tags, Journal
- [ ] Collection feature (CRUD, detalle)
- [ ] Tag feature (list, filter)
- [ ] Journal feature (daily notes, date picker)
- [ ] Search feature (global search + filtros)
- [ ] Navigation drawer con árbol (favorites, organize, collections, tags)

### Fase 4: Navegación completa
- [ ] WorkspaceShell con BottomNavigationBar
- [ ] ShelRoute con Drawer lateral
- [ ] Transiciones entre rutas
- [ ] Deep linking
- [ ] WebNavigationControl (back gesture)

### Fase 5: Settings + Native FFI
- [ ] Settings feature (appearance, profile, subscription, about)
- [ ] Tema claro/oscuro con persistencia
- [ ] Integrar Rust native bindings via flutter_rust_bridge o uniffi
- [ ] NbStore local (SQLite nativo)
- [ ] Haptic feedback + Virtual keyboard handling

### Fase 6: AI Copilot + Polish
- [ ] AI Chat feature (copilot sessions)
- [ ] Pull-to-refresh en listas
- [ ] Infinite scroll (pagination)
- [ ] Error handling + retry
- [ ] Localization (ES/EN)
- [ ] Testing (unit + widget + integration)

## 8. Dependencias pubspec.yaml

```yaml
dependencies:
  flutter:
    sdk: flutter
  
  # State Management
  flutter_riverpod: ^2.6.1
  riverpod_annotation: ^2.6.1
  
  # Navigation
  go_router: ^14.8.1
  
  # GraphQL
  ferry: ^0.16.0
  ferry_flutter: ^0.9.0
  gql_http_link: ^1.1.0
  gql_exec: ^1.0.0
  
  # Local Database
  drift: ^2.23.1
  sqlite3_flutter_libs: ^0.5.0
  path_provider: ^2.1.0
  path: ^1.8.0
  
  # Secure Storage
  flutter_secure_storage: ^9.2.4
  
  # UI
  cached_network_image: ^3.4.1
  shimmer: ^3.0.0
  flutter_svg: ^2.0.10+1
  
  # Utils
  intl: ^0.19.0
  url_launcher: ^6.3.1
  connectivity_plus: ^6.1.2
  logger: ^2.5.0
  freezed_annotation: ^2.4.4
  json_annotation: ^4.9.0
  
  # Rust FFI (future)
  # flutter_rust_bridge: ^2.7.0 (or uniffi generated bindings)

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0
  
  # Code Generation
  build_runner: ^2.4.13
  riverpod_generator: ^2.6.3
  drift_generator: ^2.6.3
  freezed: ^2.5.7
  json_serializable: ^6.9.4
  ferry_generator: ^0.11.0
  
  # Testing
  mockito: ^5.4.5
  mocktail: ^1.0.4
```

## 9. Integración con el Monorepo Existente

### 9.1 GraphQL Schema
Los archivos `.graphql` existentes en `packages/frontend/core/src/modules/cloud/services/` deben ser traducidos a queries Ferry compatibles. Alternativa: usar el schema de Apollo generado por el server.

### 9.2 Rust Native Bindings
El crate `packages/frontend/mobile-native/` ya tiene bindings UniFFI para iOS/Android. Para Flutter:
- Opción A: Usar `flutter_rust_bridge` para generar bindings Dart (recomendada)
- Opción B: Usar UniFFI bindings Dart (más complejo, menos maduro)
- Opción C: Llamar a los bindings nativos via MethodChannel desde el código Kotlin/Swift existente

### 9.3 Estructura en el Monorepo
```
packages/frontend/apps/
├── flutter-app/              # ← NUEVA: app Flutter
├── mobile/                   # ← Existente: React Capacitor (mantener como fallback)
├── android/                  # ← Existente: Capacitor Android
├── ios/                      # ← Existente: Capacitor iOS
├── mobile-shared/            # ← Existente: shared TS components
├── web/                      # ← Existente: web app
└── electron/                 # ← Existente: desktop app
```

## 10. Convenciones de Código

- **Packages**: snake_case (e.g. `core/`, `shared/`, `auth/`)
- **Files**: snake_case.dart (e.g. `sign_in_page.dart`)
- **Classes**: PascalCase (e.g. `SignInPage`)
- **Providers**: camelCase con sufijo `Provider` (e.g. `authProvider`)
- **Riverpod**: usar el `@riverpod` annotation + code gen
- **GoRouter**: rutas tipadas con `RouteNames` constantes
- **Material 3**: usar `MaterialTheme` con color scheme de AFFiNE
- **Testing**: 1 test file por feature, mínimo smoke test por página

## 11. Patrón Feature First — Estructura Interna

Cada feature sigue estrictamente:

```
features/<feature>/
├── data/
│   ├── datasources/     # Origen de datos (remoto, local)
│   ├── repositories/    # Implementación del repositorio
│   ├── models/          # DTOs (objetos serializables)
│   └── graphql/         # Archivos .graphql (si aplica)
├── domain/
│   ├── entities/        # Modelos de dominio puros
│   └── repositories/    # Interfaces abstractas
└── presentation/
    ├── providers/       # Riverpod providers
    ├── pages/           # Pantallas (cada una con su ruta)
    └── widgets/         # Sub-componentes de UI
```

### Reglas:
- `domain/` NO depende de Flutter ni de externals — es Dart puro
- `data/` importa `domain/` pero no viceversa
- `presentation/` importa `domain/` y depende de Flutter
- Ningún provider accede a DataSource directamente — siempre via Repository
- Los providers solo exponen tipos del dominio, nunca DTOs
