# Releasing BlockSuite

This document describes how the `@blocksuite/*` packages get from this
monorepo to npm. Everything is driven by [Changesets](https://github.com/changesets/changesets)
plus three GitHub workflows; nothing is published from a developer machine.

## What is published

Every non-private workspace whose name matches `@blocksuite/*` (71 packages at
the time of writing: the `framework/*` packages, `affine/*` and
`@blocksuite/integration-test`). They form a single **fixed version group**:
all of them always carry the same version, and a changeset for any one of
them bumps all of them.

## Channels

| Channel | dist-tag | Version shape                   | Trigger                                                         |
| ------- | -------- | ------------------------------- | --------------------------------------------------------------- |
| stable  | `latest` | `X.Y.Z`                         | git tag `blocksuite@X.Y.Z`                                      |
| pre     | `next`   | `X.Y.Z-beta.N`, `X.Y.Z-rc.N`    | git tag `blocksuite@X.Y.Z-beta.N`                               |
| canary  | `canary` | `X.Y.Z-canary-<YYYYMMDDhhmmss>` | nightly at 01:00 UTC when `blocksuite/` changed in the last 24h |

Tags are `blocksuite@<version>` on purpose: the plain `v*` tags belong to the
AFFiNE app release and must not trigger an npm publish.

## Day to day: add a changeset

Any PR that changes a published package in a way users should hear about
should carry a changeset:

```sh
yarn changeset
```

Pick any `@blocksuite/*` package (the whole group is bumped regardless), pick
`patch` / `minor` / `major`, write one or two lines for the changelog, and
commit the generated `.changeset/*.md` with the PR. Pure refactors, tests and
CI changes do not need one.

## Cutting a stable release

1. **Version PR.** Whenever changesets land on `canary`, the `BlockSuite
Version` workflow opens (or updates) a PR titled
   `chore(editor): version blocksuite packages`. It bumps every package,
   deletes the consumed changesets and writes the `CHANGELOG.md` files.
   Review and merge it when you want to release.
2. **Tag.** Tag the merge commit and push the tag:

   ```sh
   git fetch origin canary
   git tag blocksuite@0.28.0 origin/canary
   git push origin blocksuite@0.28.0
   ```

3. **Publish.** The tag triggers `BlockSuite Publish`, which:
   - checks that `@blocksuite/affine` really is at the tagged version,
   - builds every package (`yarn blocksuite:build`),
   - packs them with `yarn pack` (`yarn blocksuite:pack`),
   - runs publint and arethetypeswrong on every tarball (`yarn blocksuite:validate`),
   - installs the tarballs into a fresh Vite + TypeScript app, typechecks it,
     builds it and mounts an editor in headless Chromium (`yarn blocksuite:smoke`),
   - publishes with provenance, dependencies first (`yarn blocksuite:publish`).

   Any failing gate stops the release before anything is published.

4. **Verify.** `npm view @blocksuite/affine dist-tags` and the provenance badge
   on npmjs.com.

Prereleases work the same way with a `blocksuite@X.Y.Z-beta.N` tag; they are
published under the `next` dist-tag and never touch `latest`.

### Re-running a failed publish

`yarn blocksuite:publish` skips every `name@version` that already exists on
the registry, so if the job dies halfway through the 71 packages, re-running
the workflow finishes the job without errors or duplicate publishes.

## Canary

`BlockSuite Publish` also runs nightly. It adds a throwaway changeset, runs
`changeset version --snapshot canary` (producing
`X.Y.Z-canary-<datetime>` for the whole group), then goes through the
same build → pack → validate → smoke → publish gates and publishes under the
`canary` dist-tag. Nothing is committed. The run is skipped when `blocksuite/`
has not changed in the last 24 hours; use **Run workflow** with `force` to
publish one anyway.

Manual runs (`workflow_dispatch`) are **dry runs by default**: they do
everything except the final `npm publish`. Untick `dry-run` to publish.

## Running the gates locally

```sh
yarn blocksuite:build        # tsc -b for every published package
yarn blocksuite:pack         # tarballs + manifest in tmp/blocksuite-release/packs
yarn blocksuite:validate     # publint + attw, report in tmp/blocksuite-release/validate-report.md
yarn blocksuite:smoke        # clean-app install/typecheck/build/mount, report in tmp/blocksuite-release/smoke-report.md
yarn blocksuite:publish --dry-run
```

`yarn blocksuite:smoke --skip-browser` skips the Chromium step if Playwright
browsers are not installed (`yarn playwright install chromium` fixes that).
`--skip-install` reuses the previous install when iterating on the app.

`yarn blocksuite:manifests` keeps the `repository` field of every package in
sync (npm refuses provenance attestations when it is missing or wrong); CI runs
it with `--check`.

Pull requests that touch `blocksuite/**` run the same pack / validate / smoke
gates through the `BlockSuite Package Check` workflow.

## One-time setup (needs an npm org owner and a GitHub admin)

1. **npm trusted publishing.** For each of the 71 packages, on npmjs.com open
   _Settings → Publishing access → Trusted publisher_ and add a GitHub Actions
   publisher with organization `toeverything`, repository `AFFiNE`, workflow
   filename `blocksuite-publish.yml` and no environment. This is a per-package
   setting with no bulk API. Until it is done, the publish step fails with
   `ENEEDAUTH`; every gate before it can still be exercised with a dry run.
2. **New packages** cannot use trusted publishing for their very first
   version. Publish the first version with a granular access token (run
   `yarn blocksuite:publish --no-provenance` locally with `NPM_TOKEN`/`.npmrc`
   configured, or add `NODE_AUTH_TOKEN` to the workflow temporarily), then
   configure the trusted publisher.
3. **`BLOCKSUITE_RELEASE_TOKEN`** (optional, recommended). A PAT or GitHub App
   token with `contents: write` and `pull-requests: write`. Without it the
   version PR is created with `GITHUB_TOKEN`, which means no CI runs on that
   PR until someone closes and reopens it.

## Decisions still open

- **Next version number.** npm `latest` is `0.22.4` while the repo is at
  `0.27.5` (the package versions have been following the AFFiNE app version).
  The first release from this pipeline should probably be `0.28.0`; whether
  BlockSuite keeps tracking the app version afterwards is a product decision.
  `scripts/set-version.sh` only rewrites versions inside the app release build
  and never commits them, so the two schemes do not collide in git.
- **Published surface.** `@blocksuite/integration-test` is published today
  because it is not private; the package cleanup item should decide whether it
  stays.
- **Advisory gates.** Until published `exports` point at compiled output
  instead of TypeScript source, publint, arethetypeswrong and the clean-app
  smoke test report problems. They are blocking in `BlockSuite Publish` and
  advisory (`continue-on-error`) in `BlockSuite Package Check`; flip the latter
  once the package cleanup lands.
