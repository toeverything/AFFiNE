import type { PlaywrightTestConfig } from '@playwright/test';

import baseConfig from './playwright.config';

/**
 * Desktop Firefox variant of the affine-local suite, added specifically for
 * the Journal Todo arm of .planning/debug/row-index0-selection-delete.md.
 *
 * Why this exists: by the time this config was added, the suite had measured
 * chromium (bug present, plain List view only, fixed) and WebKit (bug never
 * reproduces, confirmed by direct measurement) -- but never Firefox, despite
 * this project's own history elsewhere recording Firefox as a third engine
 * routinely included in regression runs (see MEMORY.md: "fails 15/21 across
 * chromium/firefox/webkit" for two unrelated fixes). Firefox's `beforeinput`/
 * selection-boundary behavior is a third, independent data point on whether
 * the accepted fix's engine-specific mechanism (chromium suppresses
 * `beforeinput` for an out-of-root-anchored range; WebKit does not) also holds
 * -- or doesn't -- here, before concluding the gap must be re-scoped with
 * Jasper rather than measured further.
 *
 * Deltas from the base config, diagnosed empirically rather than assumed:
 *   - `browserName: 'firefox'`.
 *   - no `clipboard-read`/`clipboard-write` permissions -- Playwright's
 *     permission grant API has historically had partial/no support for these
 *     names outside chromium; dropped pre-emptively the same way the WebKit
 *     config already had to, rather than discovering it via a hard failure.
 *   - generous timeout, mirroring the WebKit config's reasoning: an
 *     unminified dev build plus a cold nbstore-worker bootstrap can outrun the
 *     base 30s budget on an engine this suite has never run against.
 */
const config: PlaywrightTestConfig = {
  ...baseConfig,
  timeout: 120_000,
  use: {
    ...baseConfig.use,
    browserName: 'firefox',
    permissions: [],
    actionTimeout: 30 * 1000,
  },
};

export default config;
