import nodePath from 'node:path';

import fs from 'fs-extra';
import { flatten } from 'lodash-es';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { compare } from 'semver';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CustomGitHubProvider } from '../../src/main/updater/custom-github-provider';
import { MockedAppAdapter, MockedUpdater } from './mocks';

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
    { buildType: 'stable', version: '0.11.1' },
    { buildType: 'beta', version: '0.11.1-beta.1' },
    { buildType: 'canary', version: '0.11.1-canary.1' },
  ];

  const restHandlers = [
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
        function response404() {
          return HttpResponse.text('Not Found', { status: 404 });
        }

        return [
          http.get(
            `https://github.com/toeverything/AFFiNE/releases/download/v${version}/latest${platformTail}.yml`,
            async function responseContent() {
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

  const server = setupServer(...restHandlers);

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  for (const { buildType } of expectReleaseList) {
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

      const info = await updater.checkForUpdates();
      expect(info).not.toBe(null);
      expect(compare(info!.updateInfo.version, '0.10.0')).toBe(1);
    });
  }
});
