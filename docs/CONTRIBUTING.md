# Contributing to AFFiNE

Thank you for your interest in contributing! ❤️ AFFiNE welcomes contributions of all kinds — code, docs, bug reports, feature ideas and translations. See [types-of-contributions.md](./types-of-contributions.md) for the full picture.

This page is the five-minute overview. The full contributor handbook lives at <https://docs.affine.pro/contributing>.

## Before your first pull request: sign the CLA

We can only merge pull requests whose authors have signed the [Contributor License Agreement](../.github/CLA.md). Every PR is checked automatically (the `license/cla` status check), and an unsigned CLA is the single most common reason PRs get stuck before merge.

**How to sign (takes under a minute):**

1. Open <https://cla-assistant.io/toeverything/AFFiNE>.
2. Sign in with your GitHub account and agree.

Already opened a PR? Sign, then click the **recheck** link in the CLA bot's comment on your PR (or push a new commit). Note that **every** committer on the PR must sign, and each commit's author email must be [linked to a GitHub account](https://github.com/settings/emails). See [BUILDING.md — Sign the CLA first](./BUILDING.md#sign-the-cla-first) for troubleshooting.

## Contribution flow

1. **Find something to work on.** Browse [good first issues](https://github.com/toeverything/AFFiNE/contribute) or the [issue tracker](https://github.com/toeverything/AFFiNE/issues). Issues that are still in triage haven't been reviewed yet — better not to start work on those. For bigger changes, open a [discussion](https://github.com/toeverything/AFFiNE/discussions) or talk to us on [Discord](https://affine.pro/redirect/discord) first.
2. **Set up your environment.** Follow [BUILDING.md](./BUILDING.md) for the web app. For the server (cloud features) see [developing-server.md](./developing-server.md); for the desktop client see [building-desktop-client-app.md](./building-desktop-client-app.md).
3. **Make your change** on a branch created from `canary`. Add tests where it makes sense, and run `yarn lint`, `yarn typecheck` and the relevant tests locally.
4. **Open a PR to `canary`** with a [Conventional Commits](https://www.conventionalcommits.org/) title, e.g. `fix(editor): keep selection after paste` — the title format is enforced by CI.
5. **Get it merged.** A PR merges once the `license/cla` check is green, CI passes, and a maintainer approves the review.

## Code of conduct

Please read our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Useful links

- Codebase tour: [contributing/tutorial.md](./contributing/tutorial.md)
- How issues are triaged: [issue-triaging.md](./issue-triaging.md)
- Release process: [contributing/releases.md](./contributing/releases.md)
- Reporting security issues: [SECURITY.md](../SECURITY.md)
- Community: [Discord](https://affine.pro/redirect/discord) · [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions)
