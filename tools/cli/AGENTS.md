# @affine-tools/cli

Build, dev, and bundle orchestration for the AFFiNE monorepo. Exposes the `affine` (and `af`) binary used by every `yarn` script in the workspace.

## Layout

```
tools/cli/
  bin/
    cli.js        # Entry point for `affine` binary
    runner.js     # Entry point for `r` shorthand runner
  src/
    affine.ts     # CLI root — registers all commands via Clipanion
    command.ts    # Base command classes (Command, PackageCommand, PackageSelectorCommand)
    context.ts    # CliContext type (workspace, stdio streams)
    run.ts        # RunCommand — executes package scripts with auto tsx injection
    init.ts       # InitCommand — workspace codegen (tsconfig, workspace info, oxlint)
    build.ts      # BuildCommand — proxy to package's `build` script
    dev.ts        # DevCommand — proxy to package's `dev` script with interactive selector
    bundle.ts     # BundleCommand — Rspack-based production bundler and dev server
    clean.ts      # CleanCommand — removes dist, node_modules, cargo target
    cert.ts       # CertCommand — manages local HTTPS certs via openssl (macOS only)
    rspack/
      index.ts    # createHTMLTargetConfig, createWorkerTargetConfig, createNodeTargetConfig
    rspack-shared/
      cache-group.ts    # Production Rspack splitChunks cache groups
      html-plugin.ts    # HTML entry plugin helpers
      s3-plugin.ts      # R2/S3 asset upload for releases
      node-loader.js    # .node native addon loader for Rspack
      error-handler.js  # Rspack error handler
    postcss/
      queuedash-scope.ts  # PostCSS plugin: scopes admin panel CSS
  register.js     # Node.js loader for @affine/server (NestJS, legacy decorators)
  tsx-register.js # Node.js loader for all other packages (tsx)
  hooks.js        # Yarn install hooks
```

## CLI Framework

Uses **Clipanion** (`clipanion`) for command parsing and **Typanion** (`typanion`) for runtime validators. Commands extend one of the base classes in `src/command.ts`:

| Base class | When to use |
|---|---|
| `Command` | No package targeting (e.g. `clean`, `init`, `cert`) |
| `PackageCommand` | Single required `--package/-p` option |
| `PackageSelectorCommand` | Single optional `--package/-p` with interactive fallback (inquirer prompt) |
| `PackagesCommand` | Multiple `--package/-p` options |

## Commands Reference

### `affine <pkg> <script> [args]` / `run` / `r`
Runs a script defined in a workspace package's `package.json`. Auto-injects a tsx or server Node.js loader so `.ts` scripts execute without manual wiring.

- Scripts using `affine` as their binary are recursively dispatched through the CLI.
- `cross-env` and `KEY=VALUE` env prefixes are extracted before exec.
- Loader is skipped for known binaries: `vitest`, `vite`, `tsx`, `prisma`, `cap`, `tsc`, `typedoc`, `r`, `electron`.

### `affine init` / `i` / `codegen`
Generates workspace-wide files. Run after adding/removing packages:
- Root `tsconfig.json` references (all TS projects)
- `@affine-tools/utils/src/workspace.gen.ts` (package list + union type)
- Per-package `tsconfig.json` references (workspace dep graph)
- Root `.oxlintrc.json` ignore patterns (synced from `.prettierignore`)

### `affine build -p <pkg> [--deps]`
Proxy that calls the package's `build` script via `RunCommand`. `--deps` also builds workspace dependencies first.

### `affine dev [-p <pkg>] [--deps]`
Proxy to the package's `dev` script. Without `-p`, shows an interactive list. Supported packages: `@affine/web`, `@affine/server`, `@affine/electron`, `@affine/electron-renderer`, `@affine/mobile`, `@affine/ios`, `@affine/android`, `@affine/admin`.

### `affine bundle -p <pkg> [--dev/-d]`
Rspack-based bundler — does NOT delegate to the package's script.
- Production: runs `rspack` compiler, optionally uploads to R2 (needs `R2_SECRET_ACCESS_KEY`).
- Dev: starts `RspackDevServer`.
- Supported packages: `@affine/web`, `@affine/mobile`, `@affine/ios`, `@affine/android`, `@affine/electron-renderer`, `@affine/admin`, `@affine/server`, `@affine/reader`.

### `affine clean [--dist] [--rust] [--node-modules] [--all/-a]`
Deletes build artifacts. Flags are additive; `--all` covers everything.

### `affine cert [--install] [--domain <domain>] [--uninstall]`
Manages a local self-signed CA and per-domain TLS certificates for the Docker dev environment. Uses `openssl` + macOS `security` keychain commands — macOS only.

## Rspack Configurations

Three factory functions in `src/rspack/index.ts`:

| Factory | Target | Used for |
|---|---|---|
| `createHTMLTargetConfig` | `web, es2022` | Browser SPA apps (`@affine/web`, `@affine/mobile`, `@affine/admin`, etc.) |
| `createWorkerTargetConfig` | `webworker, es2022` | Web Workers (pdf, turbo-painter, workspace-profile, mermaid, typst, nbstore) |
| `createNodeTargetConfig` | `node, es2022` | Node.js bundles (`@affine/server`, `@affine/reader`) |

Key build decisions:
- **`BUILD_TYPE` env** controls the channel: `canary` (default) | `beta` | `stable` | `internal`.
- **`NODE_ENV`** controls dev vs. production mode (debug sourcemaps, minification, CSS extraction).
- **Vanilla Extract** is handled via `VanillaExtractPlugin` in the HTML target only.
- **CSS**: dev uses `style-loader`; production uses `CssExtractRspackPlugin`.
- **Admin panel** uses Tailwind CSS (via `@tailwindcss/postcss`) + the `queuedashScopePlugin`; all other apps skip Tailwind.
- **Electron renderer** sourcemap URLs are rewritten from `file://` to `assets://` protocol.
- **Sentry** plugin is enabled when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` are all set.
- **Worker configs** use `LimitChunkCountPlugin({ maxChunks: 1 })` — single output file, no code splitting.
- **Node configs** externalize all non-workspace dependencies by default; `bundleAllDependencies: true` overrides this.

## Adding a New Command

1. Create `src/<name>.ts` exporting a class that extends the appropriate base.
2. Set `static override paths` with the command path(s) and aliases.
3. Import and register it in `src/affine.ts` with `cli.register(...)`.

## Adding a New Bundleable Package

Add a new `case` branch in `getRspackBundleConfigs()` in `src/bundle.ts`, then add the package name to `assertRspackSupportedPackageName` in `src/bundle-shared.ts`.

## Environment Variables

| Variable | Effect |
|---|---|
| `BUILD_TYPE` | Release channel: `canary` \| `beta` \| `stable` \| `internal` (default: `canary`) |
| `NODE_ENV` | `development` or `production` — controls debug mode, minification |
| `R2_SECRET_ACCESS_KEY` | Enables S3/R2 asset upload after production bundle |
| `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | Enables Sentry source map upload |
| `CI` | Disables `ProgressPlugin` in Rspack builds |
