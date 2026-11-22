# Frozen server contract extraction

Use the repository's immutable Yarn graph; do not add a package manifest or npm lock here.
Run from the repository root after `yarn install --immutable`:

```sh
node scripts/oracle/extract-v0275-contracts.mjs
node scripts/oracle/extract-v0275-contracts.mjs --check
```

`AFFINE_NODE_MODULES_ROOT` may point to another checkout with the same `yarn.lock`
when extracting a source-only mirror. The extractor records the lock digest in its
source fingerprint. Source, version and artifact hashes are rechecked by `--check`;
never manually edit the goldens. Check mode rejects missing/extra files and bytes.

Parse NestJS decorators and imperative mounts with TypeScript ASTs. Preserve flavor,
registration order/source and runtime deployment-prefix expressions for static
handlers. Include controller REST, GraphQL and Engine.IO mounts, standard static
routes and self-host setup routes. Fail on unknown outward wire emit names.

Error HTTP statuses come from the source AST and the locked NestJS HttpStatus enum.
Render every registry mail with the actual production React renderer, UTC, a fixed
clock and explicit fixture props. Keep exact HTML bytes, subjects, source prop
contracts and optional-field interpolation probes. All dependency versions must
come from the root Yarn graph. No hand-maintained replacement templates.
