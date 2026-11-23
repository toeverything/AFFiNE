# Working on AFFiNE Native Playground (for agents)

These rules apply at the repository root on the `darksky/native-playground` branch and on topic branches under `darksky/np/**`. Subdirectory `AGENTS.md` files (for example `blocksuite/native-playground/AGENTS.md`) give narrower rules beside the code they govern.

## Branch and CI workflow

- **Never merge to `canary`.** Integration lands on `darksky/native-playground` only.

- **PR-less CI on push:** A push to a topic branch that matches `darksky/np/**` (or to `darksky/native-playground`) starts `.github/workflows/native-playground.yml` directly. `.github/workflows/build-test.yml` ignores `darksky/native-playground` pull requests. Unrelated legacy jobs stay silent.

- **Review council gate:** Each topic branch needs at least **3 of 4** review council approvals. Then it can squash-land onto `darksky/native-playground`.

- **Performance regression gate:** A CI benchmark metric can regress by **more than 10%** against the rolling `N-3` baseline. In that case, the performance guardian reviews the change before it lands.

- **Cargo rustflags isolation:** Root `.cargo/config.toml` adds NAPI linker flags (`-all_load`, `-undefined dynamic_lookup`, `-z nodelete`). Cargo joins these flags into nested workspaces. Always set `CARGO_ENCODED_RUSTFLAGS=""` when you build and test `blocksuite/native-playground` and the standalone `packages/backend/` workspace.

- **Static gates:** `node scripts/ci/check-l0-tier-a.mjs` has no dependencies and runs in under a second. It guards the `packages/backend/` layering and hygiene. It also guards workflow references and the `waitForTimeout` / `.skip` ratchet in `scripts/ci/l0-ratchet.json`. The ratchet counts can only go down. To lower the ceiling, run the script with `--update-baseline`.

- **Fast lanes:** `native-playground.yml` always runs the L0 Tier-A check and the zero-backend CSF geometry audit (`scripts/ci/check-csf-frame-audit.mjs`). It also always runs the frozen server contract checks (`scripts/oracle`), the `packages/backend/` checks and the `tools/parity-harness` checks.

- **Web lanes:** `native-playground.yml` calls `np-web-fast.yml` only when web sources change. That lane runs lint, typecheck and the Node-only Vitest projects. It calls `np-web-build.yml` only when frontend sources change. That lane builds the production bundles of `@affine/web`, `@affine/mobile` and `@affine/admin`. It downloads no Electron or Playwright binaries, and each bundle has eight minutes.

## Pull requests and evidence

- Open one PR per request from the target base branch. Split a PR only when a maintainer asks. External contributors open one PR per issue.

- On `darksky/native-playground`, `darksky/np/**` slices run CI on push and squash-land onto `darksky/native-playground` without a PR. They never merge to `canary`.

- Squash each task into one commit before its first PR. After that, append commits without a squash.

- Set both author and committer to `DarkSky <darksky2048@gmail.com>` for all commits we create, including sub-chats and squashes. Do not add AI `Co-Authored-By` trailers. Keep the original author on external contributor commits.

- End the PR description with the models you used and the test frameworks you ran.

- For UI changes, attach before and after images. For animation or timing changes, also attach a short video. Upload the evidence to GitHub and link it in the PR. Never commit assets that only the PR needs.

- Bug fixes merge after the latest checks pass. Product changes and changes that users can see need owner approval.

## Commit, comment, and pull request messages

- Follow `.agents/skills/ste-writing/SKILL.md` for commit messages, code comments, review comments, documentation, error messages, and PR titles and descriptions.

- Write PR titles and descriptions in English.

- Use `{type}({scope}): {description}` for commit subjects (for example `feat(server): add sync routes`).

- To check a text, run `python3 .agents/skills/ste-writing/scripts/ste-lint.py <file>`.

## Engineering and testing principles

- **Global optimum over band-aid patches:** Prefer clean structural refactors and bold deletion. Do not add minimal-diff workarounds, defensive clutter or extra abstraction. Delete obsolete helpers, structs and files outright. If a fragment has one caller and adds indirection without clarity, fold it back into its caller.

- **Test names match actual scope:** The name of each test file and test function must match everything that it asserts. Do not add unrelated assertions to a narrowly named test. If you must add them, rename the test to match.

- **Table-driven tests:** Put related scenarios into short table-driven loops. Examples are geometry and hit tests, parsers, key sequences and IME cases. Do not add many near-identical `#[test]` functions.

- **Deterministic tests:** Keep tests deterministic with test clocks and simulated networks. Never add sleeps, retries or longer deadlines. Never rerun a flaky check green. Find and remove the uncontrolled input.

## Keeping rules true

- If a change makes a statement, path, command or invariant in an `AGENTS.md` file false, update that `AGENTS.md` in the same commit.

- A new directory with rules of its own gets an `AGENTS.md` file and a one-line `CLAUDE.md` file that contains `@AGENTS.md`.

- Keep code, comments, workflows, `AGENTS.md` files and commit messages free of internal process-journal jargon.
