import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UpdateCheckResult } from 'electron-updater';
import fs from 'fs-extra';
import { flatten } from 'lodash-es';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AFFiNEUpdateProvider } from '../../src/main/updater/affine-update-provider';
import { MockedAppAdapter, MockedUpdater } from './mocks';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

vi.mock('electron', () => ({
  app: {
    getPath: () => __dirname,
  },
}));

const platformTail = (() => {
  // https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/providers/Provider.ts#L30
  const platform = process.platform;
  if (platform === 'linux') {
    const arch = process.env['TEST_UPDATER_ARCH'] || process.arch;
    const archSuffix = arch === 'x64' ? '' : `-${arch}`;
    return '-linux' + archSuffix;
  } else {
    return platform === 'darwin' ? '-mac' : '';
  }
})();

describe('testing for client update', () => {
  const expectReleaseList = [
    { buildType: 'stable', version: '0.16.3' },
    { buildType: 'beta', version: '0.16.3-beta.2' },
    { buildType: 'canary', version: '0.17.0-canary.7' },
  ];

  const basicRequestHandlers = [
    http.get('https://affine.pro/api/worker/releases', async ({ request }) => {
      const url = new URL(request.url);
      const buffer = await fs.readFile(
        path.join(
          __dirname,
          'fixtures',
          'candidates',
          `${url.searchParams.get('channel')}.json`
        )
      );
      const content = buffer.toString();
      return HttpResponse.text(content);
    }),
    ...flatten(
      expectReleaseList.map(({ version }) => {
        return [
          http.get(
            `https://github.com/toeverything/AFFiNE/releases/download/v${version}/latest${platformTail}.yml`,
            async req => {
              const buffer = await fs.readFile(
                path.join(
                  __dirname,
                  'fixtures',
                  'releases',
                  version,
                  path.parse(req.request.url).base
                )
              );
              const content = buffer.toString();
              return HttpResponse.text(content);
            }
          ),
        ];
      })
    ),
  ];
  describe('release api request successfully', () => {
    const server = setupServer(...basicRequestHandlers);
    beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
    afterAll(() => server.close());
    afterEach(() => server.resetHandlers());

    for (const { buildType, version } of expectReleaseList) {
      it(`check update for ${buildType} channel successfully`, async () => {
        const app = new MockedAppAdapter('0.10.0');
        const updater = new MockedUpdater(null, app);

        updater.setFeedURL(
          AFFiNEUpdateProvider.configFeed({
            channel: buildType as any,
          })
        );

        const info = (await updater.checkForUpdates()) as UpdateCheckResult;
        expect(info).not.toBe(null);
        expect(info.updateInfo.releaseName).toBe(version);
        expect(info.updateInfo.version).toBe(version);
        // expect(info.updateInfo.releaseNotes?.length).toBeGreaterThan(0);
      });
    }
  });
});
