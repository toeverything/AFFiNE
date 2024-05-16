import nodePath from 'node:path';
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

import { CustomGitHubProvider } from '../../src/main/updater/custom-github-provider';
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

function response404() {
  return HttpResponse.text('Not Found', { status: 404 });
}
function response403() {
  return HttpResponse.text('403', { status: 403 });
}

describe('testing for client update', () => {
  const expectReleaseList = [
    { buildType: 'stable', version: '0.11.1' },
    { buildType: 'beta', version: '0.11.1-beta.1' },
    { buildType: 'canary', version: '0.11.1-canary.1' },
  ];

  const basicRequestHandlers = [
    http.get(
      'https://github.com/toeverything/AFFiNE/releases.atom',
      async () => {
        const buffer = await fs.readFile(
          nodePath.join(__dirname, 'fixtures', 'feeds.txt')
        );
        const content = buffer.toString();
        return HttpResponse.xml(content);
      }
    ),
    ...flatten(
      expectReleaseList.map(({ version, buildType }) => {
        return [
          http.get(
            `https://github.com/toeverything/AFFiNE/releases/download/v${version}/latest${platformTail}.yml`,
            async () => {
              const buffer = await fs.readFile(
                nodePath.join(
                  __dirname,
                  'fixtures',
                  'releases',
                  `${version}.txt`
                )
              );
              const content = buffer.toString();
              return HttpResponse.text(content);
            }
          ),
          http.get(
            `https://github.com/toeverything/AFFiNE/releases/download/v${version}/${buildType}${platformTail}.yml`,
            response404
          ),
        ];
      })
    ),
  ];

  describe('release api request successfully', () => {
    const server = setupServer(
      ...basicRequestHandlers,
      http.get(
        'https://api.github.com/repos/toeverything/affine/releases',
        async () => {
          const buffer = await fs.readFile(
            nodePath.join(__dirname, 'fixtures', 'release-list.txt')
          );
          const content = buffer.toString();
          return HttpResponse.xml(content);
        }
      )
    );
    beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
    afterAll(() => server.close());
    afterEach(() => server.resetHandlers());

    for (const { buildType, version } of expectReleaseList) {
      it(`check update for ${buildType} channel successfully`, async () => {
        const app = new MockedAppAdapter('0.10.0');
        const updater = new MockedUpdater(null, app);
        updater.allowPrerelease = buildType !== 'stable';

        const feedUrl: Parameters<typeof updater.setFeedURL>[0] = {
          channel: buildType,
          // hack for custom provider
          provider: 'custom' as 'github',
          repo: 'AFFiNE',
          owner: 'toeverything',
          releaseType: buildType === 'stable' ? 'release' : 'prerelease',
          // @ts-expect-error hack for custom provider
          updateProvider: CustomGitHubProvider,
        };

        updater.setFeedURL(feedUrl);

        const info = (await updater.checkForUpdates()) as UpdateCheckResult;
        expect(info).not.toBe(null);
        expect(info.updateInfo.releaseName).toBe(version);
        expect(info.updateInfo.version).toBe(version);
        expect(info.updateInfo.releaseNotes?.length).toBeGreaterThan(0);
      });
    }
  });

  describe('release api request limited', () => {
    const server = setupServer(
      ...basicRequestHandlers,
      http.get(
        'https://api.github.com/repos/toeverything/affine/releases',
        response403
      ),
      http.get(
        `https://github.com/toeverything/AFFiNE/releases/download/v0.11.1-canary.2/canary${platformTail}.yml`,
        async () => {
          const buffer = await fs.readFile(
            nodePath.join(
              __dirname,
              'fixtures',
              'releases',
              `0.11.1-canary.2.txt`
            )
          );
          const content = buffer.toString();
          return HttpResponse.text(content);
        }
      )
    );
    beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
    afterAll(() => server.close());
    afterEach(() => server.resetHandlers());

    it('check update for canary channel get v0.11.1-canary.2', async () => {
      const app = new MockedAppAdapter('0.10.0');
      const updater = new MockedUpdater(null, app);
      updater.allowPrerelease = true;

      const feedUrl: Parameters<typeof updater.setFeedURL>[0] = {
        channel: 'canary',
        // hack for custom provider
        provider: 'custom' as 'github',
        repo: 'AFFiNE',
        owner: 'toeverything',
        releaseType: 'prerelease',
        // @ts-expect-error hack for custom provider
        updateProvider: CustomGitHubProvider,
      };

      updater.setFeedURL(feedUrl);

      const info = (await updater.checkForUpdates()) as UpdateCheckResult;
      expect(info).not.toBe(null);
      expect(info.updateInfo.releaseName).toBe('0.11.1-canary.2');
      expect(info.updateInfo.version).toBe('0.11.1-canary.2');
      expect(info.updateInfo.releaseNotes?.length).toBe(0);
    });
  });
});
