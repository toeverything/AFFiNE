import { getOrCreateI18n } from '@affine/i18n';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterAll, describe, expect, test, vi } from 'vitest';

const { contextMenus } = vi.hoisted(() => ({
  contextMenus: [] as { items: { label?: string }[] }[],
}));

vi.mock('electron', () => {
  const image = {
    resize: () => image,
    setTemplateImage: () => {},
  };
  class Menu {
    items: { label?: string }[] = [];
    append(item: { label?: string }) {
      this.items.push(item);
    }
  }
  class MenuItem {
    label?: string;
    constructor(options: { label?: string }) {
      this.label = options.label;
    }
  }
  class Tray {
    setToolTip() {}
    on() {}
    off() {}
    destroy() {}
    setContextMenu(menu: Menu) {
      contextMenus.push(menu);
    }
  }
  return {
    app: { getName: () => 'AFFiNE', quit: vi.fn() },
    Menu,
    MenuItem,
    nativeImage: {
      createFromPath: () => image,
      createFromBuffer: () => image,
    },
    Tray,
  };
});

vi.mock('../../src/shared/utils', () => ({
  isMacOS: () => true,
  resourcesPath: '/resources',
}));

vi.mock('../../src/main/logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/main/cleanup', () => ({
  beforeAppQuit: vi.fn(),
}));

vi.mock('../../src/main/application-menu', () => ({
  applicationMenuSubjects: {},
}));

vi.mock('../../src/main/windows-manager', () => ({
  showMainWindow: vi.fn(),
}));

vi.mock('../../src/main/shared-storage/storage', () => ({
  globalStateStorage: {
    get: () => ({ enabled: true }),
    watch: () => new BehaviorSubject({ enabled: true }),
  },
}));

vi.mock('../../src/main/recording/feature', () => ({
  appGroups$: new BehaviorSubject([]),
  checkCanRecordMeeting: () => true,
  checkRecordingAvailable: () => false,
  getCurrentRecordingStatus: () => null,
  MeetingsSettingsState: { value: { enabled: false } },
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  updateApplicationsPing$: new Subject(),
}));

describe('tray menu', () => {
  afterAll(async () => {
    await getOrCreateI18n().changeLanguage('en');
  });

  test('labels follow the app language', async () => {
    const { setupTrayState } = await import('../../src/main/tray');
    setupTrayState();

    const labels = () => contextMenus.at(-1)?.items.map(item => item.label);

    expect(labels()).toEqual([
      'Open Journal',
      'New Page',
      'New Edgeless',
      undefined,
      'Open AFFiNE',
      'Menubar settings...',
      'About AFFiNE',
      undefined,
      'Quit AFFiNE Completely...',
    ]);

    await getOrCreateI18n().changeLanguage('zh-Hans');

    expect(labels()).toEqual([
      '打开日记',
      '新建文档',
      '新建无界页面',
      undefined,
      '打开 AFFiNE',
      '菜单栏设置...',
      '关于 AFFiNE',
      undefined,
      '完全退出 AFFiNE...',
    ]);
  });
});
