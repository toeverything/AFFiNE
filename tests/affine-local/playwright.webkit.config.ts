import type { PlaywrightTestConfig } from '@playwright/test';

import baseConfig from './playwright.config';

/**
 * Desktop WebKit variant of the affine-local suite.
 *
 * Why this exists: the affine-local E2E suite has only ever run against
 * chromium, yet this project's bugs are reported from a real desktop browser
 * and its history already contains at least one Safari-only failure mode that
 * a green chromium run could never have caught (see commit 3ccc46bb78, which
 * added the equivalent WebKit config for the mobile suite for exactly this
 * reason). Running the same specs against WebKit -- the engine Safari uses --
 * turns "browser engine" from an untested assumption into a measured variable.
 *
 * The only deltas from the base config are the two things WebKit cannot do:
 *   - `browserName: 'webkit'`;
 *   - no `clipboard-read`/`clipboard-write` permissions. WebKit rejects those
 *     permission names outright (`browserContext.newPage: Unknown permission:
 *     clipboard-write`), so every test errors before it opens a page. Specs
 *     that genuinely need the clipboard must be skipped under this config
 *     rather than silently granted a permission that does not exist here.
 *
 * Everything else -- baseURL, viewport, timeouts, the shared dev-server --
 * is inherited so that a chromium/webkit difference in a result can only come
 * from the engine.
 */
const config: PlaywrightTestConfig = {
  ...baseConfig,
  // WebKit is materially slower than chromium against this unminified dev
  // build (the workspace has to initialise through the nbstore worker before
  // the sidebar's new-page button exists at all), and the base 30s budget
  // expires during `beforeEach` rather than during anything under test.
  // A generous timeout here keeps a slow engine from masquerading as a
  // failing assertion.
  timeout: 120_000,
  use: {
    ...baseConfig.use,
    browserName: 'webkit',
    permissions: [],
    actionTimeout: 30 * 1000,
  },
};

export default config;
