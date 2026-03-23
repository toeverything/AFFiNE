import { getOrCreateI18n } from '@affine/i18n';
import { Framework, Service } from '@toeverything/infra';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Array as YArray, Doc as YDoc, Map as YMap } from 'yjs';

import { EditorSettingDocCreateMiddleware } from '../impls/doc-create-middleware';

const createWorkspaceService = (titles: string[]) => {
  const rootYDoc = new YDoc();
  const meta = rootYDoc.getMap('meta');
  const pages = new YArray<YMap<unknown>>();

  pages.push(
    titles.map((title, index) => {
      return new YMap([
        ['id', `doc-${index}`],
        ['title', title],
      ]);
    })
  );
  meta.set('pages', pages);

  return {
    workspace: {
      rootYDoc,
    },
  };
};

const createEditorSettingService = (overrides?: Record<string, unknown>) => {
  return {
    editorSetting: {
      ['settings$']: {
        value: {
          newDocDefaultMode: 'page',
          autoTitleNewDocWithCurrentDate: false,
          newDocDateTitleFormat: 'DD/MM/YYYY',
          ...overrides,
        },
      },
      get: vi.fn((key: string) => {
        if (key === 'affine:note') {
          return undefined;
        }
        if (key === 'edgelessDefaultTheme') {
          return 'specified';
        }
        return undefined;
      }),
    },
  };
};

const appThemeService = {
  appTheme: {
    ['theme$']: {
      value: 'light',
    },
  },
};

const createMiddleware = ({
  settings,
  titles,
}: {
  settings?: Record<string, unknown>;
  titles?: string[];
}) => {
  class MockEditorSettingService extends Service {
    editorSetting = createEditorSettingService(settings).editorSetting;
  }

  class MockAppThemeService extends Service {
    appTheme = appThemeService.appTheme;
  }

  class MockWorkspaceService extends Service {
    workspace = createWorkspaceService(titles ?? []).workspace;
  }

  const framework = new Framework();
  framework
    .service(MockEditorSettingService)
    .service(MockAppThemeService)
    .service(MockWorkspaceService)
    .service(EditorSettingDocCreateMiddleware, [
      MockEditorSettingService,
      MockAppThemeService,
      MockWorkspaceService,
    ]);

  return framework.provider().get(EditorSettingDocCreateMiddleware);
};

describe('EditorSettingDocCreateMiddleware', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('adds an auto date title for blank docs when enabled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T09:00:00.000Z'));

    const middleware = createMiddleware({
      settings: {
        autoTitleNewDocWithCurrentDate: true,
        newDocDateTitleFormat: 'DD/MM/YYYY',
      },
    });

    expect(middleware.beforeCreate({})).toMatchObject({
      title: '23/03/2026',
      primaryMode: 'page',
    });
  });

  test('keeps blank docs untitled when the feature is disabled', () => {
    const middleware = createMiddleware({});

    expect(middleware.beforeCreate({})).toMatchObject({
      primaryMode: 'page',
    });
    expect(middleware.beforeCreate({}).title).toBeUndefined();
  });

  test('does not override explicitly provided titles', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T09:00:00.000Z'));

    const middleware = createMiddleware({
      settings: {
        autoTitleNewDocWithCurrentDate: true,
      },
      titles: ['23/03/2026'],
    });

    expect(
      middleware.beforeCreate({
        title: 'Typed by user',
      }).title
    ).toBe('Typed by user');
  });

  test('uses the next duplicate suffix when the date title already exists', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T09:00:00.000Z'));

    const middleware = createMiddleware({
      settings: {
        autoTitleNewDocWithCurrentDate: true,
      },
      titles: ['23/03/2026', '23/03/2026(2)'],
    });

    expect(middleware.beforeCreate({}).title).toBe('23/03/2026(3)');
  });

  test('uses the selected format for the generated title', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T09:00:00.000Z'));

    const middleware = createMiddleware({
      settings: {
        autoTitleNewDocWithCurrentDate: true,
        newDocDateTitleFormat: 'YYYY/MM/DD',
      },
    });

    expect(middleware.beforeCreate({}).title).toBe('2026/03/23');
  });

  test('supports month-name formats for generated titles', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T09:00:00.000Z'));
    getOrCreateI18n();

    const middleware = createMiddleware({
      settings: {
        autoTitleNewDocWithCurrentDate: true,
        newDocDateTitleFormat: 'journal',
      },
    });

    expect(middleware.beforeCreate({}).title).toBe('Mar 23, 2026');
  });
});
