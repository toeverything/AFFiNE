import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UpdateCheckResult } from 'electron-updater';
import { parseUpdateInfo } from 'electron-updater/out/providers/Provider';
import fs from 'fs-extra';
import { flatten } from 'lodash-es';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  AFFiNEUpdateProvider,
  availableForMyPlatformAndInstaller,
} from '../../src/main/updater/affine-update-provider';
import { MockedAppAdapter, MockedUpdater } from './mocks';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

vi.mock('electron', () => ({
  app: {
    getPath: () => __dirname,
  },
}));

describe('testing for client update', () => {
  const expectReleaseList = [
    { buildType: 'beta', version: '0.16.3-beta.2' },
    { buildType: 'canary', version: '0.17.0-canary.7' },
    { buildType: 'stable', version: '0.18.0' },
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
            `https://github.com/toeverything/AFFiNE/releases/download/v${version}/latest.yml`,
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
    beforeEach(() => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
      vi.spyOn(process, 'arch', 'get').mockReturnValue('x64');
    });
    afterEach(() => {
      server.resetHandlers();
      vi.restoreAllMocks();
    });

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
        expect(info.updateInfo.files.map(file => file.url)).toEqual([
          `https://github.com/toeverything/AFFiNE/releases/download/v${version}/affine-${version}-${buildType}-windows-x64.nsis.exe`,
        ]);
      });
    }

    const newerVersion = '0.17.0-canary.8';
    const newerInstaller = `affine-${newerVersion}-canary-windows-x64.nsis.exe`;
    const manifest = (filename: string) =>
      `version: ${newerVersion}\nfiles:\n  - url: ${filename}\n    sha512: test`;

    it.each([
      {
        reason: 'Linux-only attachments',
        installer: `affine-${newerVersion}-canary-linux-x64.appimage`,
      },
      {
        reason: 'incompatible Windows installer',
        installer: `affine-${newerVersion}-canary-windows-x64.exe`,
      },
      { reason: 'missing manifest attachment', hasManifest: false },
      { reason: 'manifest returns 404', response: { status: 404, body: '' } },
      {
        reason: 'manifest lists an unattached installer',
        response: {
          status: 200,
          body: manifest(
            newerInstaller.replace(newerVersion, '0.17.0-canary.9')
          ),
        },
      },
      {
        reason: 'manifest returns 503',
        response: { status: 503, body: '' },
        error: { statusCode: 503 },
      },
      {
        reason: 'manifest has invalid YAML',
        response: { status: 200, body: 'files: [' },
        error: { code: 'ERR_UPDATER_INVALID_UPDATE_INFO' },
      },
      {
        reason: 'compatible installer',
        response: { status: 200, body: manifest(newerInstaller) },
        expectedVersion: newerVersion,
      },
    ])(
      'handles a newer release with $reason',
      async ({
        installer = newerInstaller,
        hasManifest = true,
        response,
        error,
        expectedVersion = '0.17.0-canary.7',
      }) => {
        const [older] = await fs.readJson(
          path.join(__dirname, 'fixtures', 'candidates', 'canary.json')
        );
        const tag = `v${newerVersion}`;
        const baseUrl = `https://github.com/toeverything/AFFiNE/releases/download/${tag}`;
        const assets = [{ name: installer, url: `${baseUrl}/${installer}` }];
        const manifestUrl = `${baseUrl}/latest.yml`;
        if (hasManifest) {
          assets.push({ name: 'latest.yml', url: manifestUrl });
        }

        server.use(
          http.get('https://affine.pro/api/worker/releases', () =>
            HttpResponse.json([
              { ...older, tag_name: tag, name: newerVersion, assets },
              older,
            ])
          )
        );
        if (response) {
          const { body, status } = response;
          server.use(
            http.get(manifestUrl, () => HttpResponse.text(body, { status }))
          );
        }

        const updater = new MockedUpdater(null, new MockedAppAdapter('0.10.0'));
        updater.setFeedURL(
          AFFiNEUpdateProvider.configFeed({ channel: 'canary' })
        );

        if (error) {
          await expect(updater.checkForUpdates()).rejects.toMatchObject(error);
        } else {
          const info = await updater.checkForUpdates();
          expect(info?.updateInfo.version).toBe(expectedVersion);
        }
      }
    );
  });

  describe('filter valid installer files', async () => {
    const platforms: NodeJS.Platform[] = ['darwin', 'win32', 'linux'];
    const arches: NodeJS.Architecture[] = ['x64', 'arm64'];

    for (const platform of platforms) {
      for (const arch of arches) {
        const data = await fs.readFile(
          path.join(__dirname, 'fixtures', 'releases', '0.18.0', `latest.yml`),
          'utf-8'
        );

        const files = parseUpdateInfo(
          data,
          '',
          new URL('https://affine.pro')
        ).files.map(file => file.url);

        files.push(
          ...files
            .filter(file => file.includes('-linux-x64.'))
            .map(file => file.replace('-linux-x64.', '-linux-arm64.'))
        );

        it(`filter for platform [${platform}] arch [${arch}]`, () => {
          expect(
            files.filter(file =>
              availableForMyPlatformAndInstaller(file, platform, arch, false)
            )
          ).toMatchSnapshot();
        });

        if (platform === 'win32') {
          it(`filter for platform [${platform}] arch [${arch}] and is squirrel installer`, () => {
            expect(
              files.filter(file =>
                availableForMyPlatformAndInstaller(file, platform, arch, true)
              )
            ).toMatchSnapshot();
          });
        }
      }
    }
  });
});
