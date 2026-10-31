/**
 * Proves the MobileDebugLog ingestion endpoint end-to-end against the real,
 * live affine-cloud backend: auth enforcement (401), env-gate enforcement
 * (403 while disabled), and successful delivery + server-side logging (201 +
 * a [MobileDebugLog] server log line containing the client UUID) once an
 * admin enables the feature via the live updateAppConfig mutation.
 *
 * Ordering matters: `Config` is a server-wide singleton for the whole test
 * run, so the disabled-by-default assertion (Test 2) MUST run before
 * anything flips config.mobileDebugLog.enabled on (Test 3) — hence the
 * serial describe block.
 *
 * Forced to webkit: the mobile PWA this endpoint exists to debug runs on
 * Safari/WebKit, and this repo's affine-cloud playwright config has no
 * `projects` array, so this file-level override is what actually gets this
 * spec running under webkit rather than the config's chromium default.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { testResultDir } from '@affine-test/kit/playwright';
import { createRandomUser, runPrisma } from '@affine-test/kit/utils/cloud';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

// WebKit doesn't support the same `permissions` set as Chromium (it throws
// "Unknown permission: clipboard-write" for the config's default clipboard
// permissions), so clear them for this file.
test.use({ browserName: 'webkit', permissions: [] });

test.describe.configure({ mode: 'serial' });

const SERVER_URL = 'http://localhost:3010';
const COLLECT_URL = `${SERVER_URL}/api/mobile-debug-log/collect`;
const GRAPHQL_URL = `${SERVER_URL}/graphql`;
const SERVER_LOG_PATH = join(testResultDir, 'mobile-debug-log-server.log');

// Logs in via the backend's REST sign-in endpoint directly (the same one
// TestingApp.login() uses in the AVA suite) rather than driving the actual
// editor UI: this test only needs a valid session cookie on `page.request`,
// and never needs to render a doc — going through the UI would additionally
// require dismissing WebKit/Safari's "Open this doc in AFFiNE app"
// interstitial that the desktop-app-detection guard shows for a fresh
// browser profile with no local workspaces, which is unrelated to what this
// test is verifying.
async function apiLogin(page: Page, user: { email: string; password: string }) {
  const res = await page.request.post(`${SERVER_URL}/api/auth/sign-in`, {
    data: { email: user.email, password: user.password },
  });
  if (!res.ok()) {
    throw new Error(`api login failed: ${res.status()} ${await res.text()}`);
  }
}

async function grantAdmin(userId: string) {
  await runPrisma(async client => {
    await client.userFeature.create({
      data: {
        userId,
        name: 'administrator',
        type: 0,
        activated: true,
        reason: 'mobile-debug-log e2e test',
      },
    });
  });
}

async function waitForLogLine(
  needle1: string,
  needle2: string,
  timeoutMs = 15000
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const content = readFileSync(SERVER_LOG_PATH, 'utf-8');
      const line = content
        .split('\n')
        .find(l => l.includes(needle1) && l.includes(needle2));
      if (line) return line;
    } catch {
      // log file may not exist yet — keep polling
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(
    `Timed out waiting for a server log line containing both "${needle1}" and "${needle2}" ` +
      `in ${SERVER_LOG_PATH}. Did the reuseExistingServer caveat apply? ` +
      'See the comment above the backend webServer command in playwright.config.ts.'
  );
}

test.describe('mobile-debug-log', () => {
  test('rejects unauthenticated collect requests with 401', async ({
    request,
  }) => {
    // Use the top-level `request` fixture (a fresh APIRequestContext with no
    // cookies) — NOT `page.request`, which would share the browser context's
    // cookies.
    const res = await request.post(COLLECT_URL, {
      data: {
        clientId: 'unauth-probe',
        entries: [{ message: 'should never log' }],
      },
    });
    expect(res.status()).toBe(401);
  });

  test('rejects when disabled by default (no admin has enabled it yet)', async ({
    page,
  }) => {
    const user = await createRandomUser();
    await apiLogin(page, user);

    const res = await page.request.post(COLLECT_URL, {
      data: {
        clientId: 'disabled-probe',
        entries: [{ message: 'should be rejected, endpoint disabled' }],
      },
    });
    expect(res.status()).toBe(403);
  });

  test('accepts an authenticated request once enabled, and the server logs a [MobileDebugLog] line containing the client UUID', async ({
    page,
  }) => {
    const admin = await createRandomUser();
    await apiLogin(page, admin);
    await grantAdmin(admin.id);

    const configRes = await page.request.post(GRAPHQL_URL, {
      data: {
        query: `mutation updateAppConfig($updates: [UpdateAppConfigInput!]!) {
          updateAppConfig(updates: $updates)
        }`,
        variables: {
          updates: [{ module: 'mobileDebugLog', key: 'enabled', value: true }],
        },
      },
    });
    expect(configRes.status()).toBe(200);
    const configBody = await configRes.json();
    expect(configBody.errors).toBeUndefined();

    const clientId = randomUUID();
    const res = await page.request.post(COLLECT_URL, {
      data: {
        clientId,
        entries: [{ message: 'e2e probe: keyboard-toolbar-style-bottom' }],
      },
    });
    expect(res.status()).toBe(201);
    expect(await res.json()).toEqual({ ok: true, accepted: 1, dropped: 0 });

    await waitForLogLine('MobileDebugLog', clientId);
  });
});
