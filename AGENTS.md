# AGENTS.md

Repo-wide agent instructions.

## Documentation Style

- Extreme brevity.
- Minimal sentences.
- Prefer bullets over paragraphs.
- Sacrifice grammar for conciseness.

## Code Comments

- Avoid comments.
- Add comments only when absolutely necessary.
- Prefer clear naming over comments.

## Code Style

- Keep code extremely simple.
- Keep changes minimal.
- Smallest change that works.
- Avoid complexity.
- Prefer simple control flow.
- Prefer fewer moving parts.
- Prefer code that is easy to read at a glance.
- Prefer code that is easy to maintain later.
- Follow project structure.
- Follow existing patterns.
- Avoid code duplication.
- Optimize for maintainability.
- Do not introduce abstractions early.
- Do not generalize without clear need.
- If two options work, choose the simpler one.

## Complexity Guardrail

- Small additions can add hidden complexity.
- If a change meaningfully increases complexity:
- Call it out.
- Explain why.
- Ask before proceeding.
- Default: avoid complexity, even if a more clever design is possible.
- Prefer explicit code over clever code.
- Prefer local changes over broad refactors.
- Keep files and functions easy to scan.

## Git Safety

- Never commit changes by yourself.
- Never push changes by yourself.
- Commit or push only when the user explicitly asks.

## Repo Shape

- Monorepo.
- JS/TS: Yarn 4 workspaces.
- Rust: root Cargo workspace.
- Main app logic mostly in shared packages.
- App packages often thin bootstrap shells.

## Package Map

- `packages/frontend/apps/web`: web shell.
- `packages/frontend/apps/mobile`: mobile web shell.
- `packages/frontend/apps/electron`: Electron main/helper.
- `packages/frontend/apps/electron-renderer`: Electron renderer UI + background worker.
- `packages/frontend/core`: main frontend logic. Routers, pages, modules, Blocksuite glue.
- `packages/frontend/component`: shared UI primitives/components. Storybook here.
- `packages/frontend/admin`: admin app.
- `packages/frontend/routes`: route builders/constants.
- `packages/frontend/electron-api`: Electron bridge types/APIs.
- `packages/common/*`: shared env, error, graphql, infra, nbstore, reader, native, s3, y-octo.
- `packages/backend/server`: NestJS server. `src/base`, `src/core`, `src/plugins`, `src/models`, `schema.prisma`, `migrations/`.
- `packages/backend/native`: server native binding.
- `blocksuite/framework/*`: editor/store/sync foundations.
- `blocksuite/affine/*`: AFFiNE editor blocks, widgets, gfx, fragments, inlines.
- `tests/*`: Playwright suites.
- `tests/kit`: shared e2e helpers.
- `tools/*`: monorepo CLI/build/codegen tooling.

## Ownership Heuristics

- Web/mobile/electron page or route: start in `packages/frontend/core/src/desktop` or `packages/frontend/core/src/mobile`.
- Shared product behavior/state/feature wiring: `packages/frontend/core/src/modules/*`.
- Shared presentational UI: `packages/frontend/component/src/ui/*` or `packages/frontend/component/src/components/*`.
- Editor behavior/toolbars/view extensions: `packages/frontend/core/src/blocksuite/*`.
- Block schema/rendering/gfx/widget behavior: `blocksuite/affine/*`.
- Local-first storage/sync/doc IO: `packages/common/nbstore/*`, `packages/common/y-octo/*`, `packages/common/reader/*`.
- Electron-only behavior: `packages/frontend/apps/electron/src/main/*`, `packages/frontend/apps/electron-renderer/src/*`, `packages/frontend/electron-api/*`.
- Native bindings/sqlite/mobile native: `packages/frontend/native/*`, `packages/frontend/mobile-native/*`, `packages/common/native/*`, `packages/backend/native/*`.
- Server API/business logic: `packages/backend/server/src/core/*`, `packages/backend/server/src/plugins/*`, `packages/backend/server/src/models/*`.
- Server infra/bootstrap/config: `packages/backend/server/src/base/*`, `packages/backend/server/src/app.module.ts`, `packages/backend/server/src/server.ts`.
- Backend jobs/queues: usually feature-local `src/**/job.ts`. Not one central workers folder.
- Admin-only work: `packages/frontend/admin/*`.
- Build/CLI/bundling issues: `tools/cli/*`.

## Workers

- Nbstore/browser workers: `packages/frontend/apps/web|mobile|ios|android/src/nbstore.worker.ts`.
- Electron background worker: `packages/frontend/apps/electron-renderer/src/background-worker/index.ts`.
- PDF worker: `packages/frontend/core/src/modules/pdf/renderer/pdf.worker.ts`.
- Turbo/block painter workers: `packages/frontend/core/src/blocksuite/view-extensions/turbo-renderer/*` and `blocksuite/affine/**/src/turbo/*.worker.ts`.
- Backend `plugins/worker` is config/origin support.
- Real backend async work usually lives in feature `job.ts` files.

## Change Checklist

- Find owning workspace first.
- Avoid editing app shell if logic lives in `core`, `common`, `blocksuite`, or `server`.
- Read target package `package.json`.
- Read nearest entry file: `src/index*`, `app.tsx`, router, module, service, or resolver/controller.
- Read nearest tests before changing behavior.
- For backend data changes: check `schema.prisma`, `migrations/`, models, services, resolvers/controllers.
- For editor changes: check both `packages/frontend/core/src/blocksuite/*` and matching `blocksuite/affine/*`.
- For route changes: check router files and `packages/frontend/routes`.
- For cross-platform changes: verify web/mobile/electron splits before assuming shared code.

## Run

- Node: `.nvmrc` => `22.22.0`.
- Yarn: `4.12.0`.
- Rust: `1.93.0`.
- Install deps: `yarn install`.
- Build frontend native binding: `yarn affine @affine/native build`.
- Build server native binding: `yarn affine @affine/server-native build`.
- Web dev: `yarn dev`.
- Storybook: `yarn workspace @affine/component dev`.

## Server Dev

- Required services: Postgres, Redis, Mailhog.
- Docker dev services:

```sh
cp ./.docker/dev/compose.yml.example ./.docker/dev/compose.yml
cp ./.docker/dev/.env.example ./.docker/dev/.env
docker compose -f ./.docker/dev/compose.yml up
```

- Server env + init:

```sh
cp packages/backend/server/.env.example packages/backend/server/.env
yarn affine @affine/server-native build
yarn affine server init
yarn affine server dev
```

- Frontend against local server: `yarn dev`.
- Server docs may drift. If commands fail, verify current `package.json` scripts.

## Electron Dev

- Start web assets first: `yarn dev`.
- Build native binding first: `yarn affine @affine/native build`.
- Then:

```sh
cd packages/frontend/apps/electron
yarn generate-assets
yarn dev
```

## Tests

- Unit: `yarn test`.
- Typecheck: `yarn typecheck`.
- Lint: `yarn lint`.
- Server tests: `yarn workspace @affine/server test`.
- Server e2e: `yarn workspace @affine/server e2e`.
- Local app e2e: `yarn workspace @affine-test/affine-local e2e`.
- Cloud app e2e: `yarn workspace @affine-test/affine-cloud e2e`.
- Desktop e2e: `yarn workspace @affine-test/affine-desktop e2e`.
- Mobile e2e: `yarn workspace @affine-test/affine-mobile e2e`.
- Blocksuite Playwright: `yarn workspace @affine-test/blocksuite test`.
- Vitest workspace covers root, Electron app, Blocksuite configs.

## High-Value Anchors

- `package.json`
- `Cargo.toml`
- `docs/BUILDING.md`
- `docs/developing-server.md`
- `docs/building-desktop-client-app.md`
- `packages/backend/server/src/app.module.ts`
- `packages/backend/server/src/server.ts`
- `packages/frontend/core/src/modules/index.ts`
- `packages/frontend/core/src/desktop/router.tsx`
- `packages/frontend/core/src/mobile/router.tsx`
