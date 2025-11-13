import {
  app,
  Menu,
  MenuItem,
  type MenuItemConstructorOptions,
  type NativeImage,
  nativeImage,
  Tray,
} from 'electron';
import { map, shareReplay } from 'rxjs';

import { isMacOS } from '../../shared/utils';
import { applicationMenuSubjects } from '../application-menu';
import { beforeAppQuit } from '../cleanup';
import { logger } from '../logger';
import {
  appGroups$,
  checkCanRecordMeeting,
  checkRecordingAvailable,
  MeetingsSettingsState,
  recordingStatus$,
  startRecording,
  stopRecording,
  updateApplicationsPing$,
} from '../recording/feature';
import { MenubarStateKey, MenubarStateSchema } from '../shared-state-schema';
import { globalStateStorage } from '../shared-storage/storage';
import { getMainWindow } from '../windows-manager';
import { icons } from './icons';
export interface TrayMenuConfigItem {
  label: string;
  click?: () => void;
  icon?: NativeImage | string | Buffer;
  disabled?: boolean;
  submenu?: TrayMenuConfig;
}

export type TrayMenuConfig = Array<TrayMenuConfigItem | 'separator'>;

// each provider has a unique key and provides a menu config (a group of menu items)
interface TrayMenuProvider {
  key: string;
  getConfig(): TrayMenuConfig;
}

function showMainWindow() {
  getMainWindow()
    .then(w => {
      w.show();
    })
    .catch(err => logger.error('Failed to show main window:', err));
}

function buildMenuConfig(config: TrayMenuConfig): MenuItemConstructorOptions[] {
  const menuConfig: MenuItemConstructorOptions[] = [];
  config.forEach(item => {
    if (item === 'separator') {
      menuConfig.push({ type: 'separator' });
    } else {
      const { icon, disabled, submenu, ...rest } = item;
      let nativeIcon: NativeImage | undefined;
      if (typeof icon === 'string') {
        nativeIcon = nativeImage.createFromPath(icon);
      } else if (Buffer.isBuffer(icon)) {
        nativeIcon = nativeImage.createFromBuffer(icon);
      }
      if (nativeIcon) {
        nativeIcon = nativeIcon.resize({ width: 20, height: 20 });
        // string icon should be template image
        if (typeof icon === 'string') {
          nativeIcon.setTemplateImage(true);
        }
      }
      const submenuConfig = submenu ? buildMenuConfig(submenu) : undefined;
      menuConfig.push({
        ...rest,
        enabled: !disabled,
        icon: nativeIcon,
        submenu: submenuConfig,
      });
    }
  });
  return menuConfig;
}

class TrayState implements Disposable {
  tray: Tray | null = null;

  // tray's icon
  icon: NativeImage = nativeImage
    .createFromPath(icons.tray)
    .resize({ width: 18, height: 18 });

  // tray's tooltip
  tooltip: string = 'AFFiNE';

  constructor() {
    this.icon.setTemplateImage(true);
    this.init();
  }

  // sorry, no idea on better naming
  getPrimaryMenuProvider(): TrayMenuProvider {
    return {
      key: 'primary',
      getConfig: () => [
        {
          label: 'Open Journal',
          icon: icons.journal,
          click: () => {
            logger.info('User action: Open Journal');
            showMainWindow();
            applicationMenuSubjects.openJournal$.next();
          },
        },
        {
          label: 'New Page',
          icon: icons.page,
          click: () => {
            logger.info('User action: New Page');
            showMainWindow();
            applicationMenuSubjects.newPageAction$.next('page');
          },
        },
        {
          label: 'New Edgeless',
          icon: icons.edgeless,
          click: () => {
            logger.info('User action: New Edgeless');
            showMainWindow();
            applicationMenuSubjects.newPageAction$.next('edgeless');
          },
        },
      ],
    };
  }

  getRecordingMenuProvider(): TrayMenuProvider | null {
    if (!checkRecordingAvailable()) {
      return null;
    }

    const getConfig = () => {
      const items: TrayMenuConfig = [];
      if (!MeetingsSettingsState.value.enabled) {
        items.push({
          label: 'Meetings are disabled',
          disabled: true,
        });
      } else if (!checkCanRecordMeeting()) {
        items.push({
          label: 'Required permissions not granted',
          disabled: true,
        });
      } else {
        const appGroups = appGroups$.value;
        const runningAppGroups = appGroups.filter(
          appGroup => appGroup.isRunning
        );

        const recordingStatus = recordingStatus$.value;

        if (
          !recordingStatus ||
          (recordingStatus?.status !== 'paused' &&
            recordingStatus?.status !== 'recording')
        ) {
          const appMenuItems = runningAppGroups.map(appGroup => ({
            label: appGroup.name,
            icon: appGroup.icon || undefined,
            click: () => {
              logger.info(
                `User action: Start Recording Meeting (${appGroup.name})`
              );
              startRecording(appGroup);
            },
          }));

          items.push(
            {
              label: 'Start Recording Meeting',
              icon: icons.record,
              submenu: [
                {
                  label: 'System audio (all audio will be recorded)',
                  icon: icons.monitor,
                  click: () => {
                    logger.info(
                      'User action: Start Recording Meeting (System audio)'
                    );
                    startRecording();
                  },
                },
                ...appMenuItems,
              ],
            },
            ...appMenuItems
          );
        } else {
          const recordingLabel = recordingStatus.appGroup?.name
            ? `Recording (${recordingStatus.appGroup?.name})`
            : 'Recording';

          // recording is either started or paused
          items.push(
            {
              label: recordingLabel,
              icon: icons.recording,
              disabled: true,
            },
            {
              label: 'Stop',
              click: () => {
                logger.info('User action: Stop Recording');
                stopRecording(recordingStatus.id).catch(err => {
                  logger.error('Failed to stop recording:', err);
                });
              },
            }
          );
        }
      }
      if (checkRecordingAvailable()) {
        items.push({
          label: `Meetings Settings...`,
          click: () => {
            showMainWindow();
            applicationMenuSubjects.openInSettingModal$.next({
              activeTab: 'meetings',
            });
          },
        });
      }

      return items;
    };

    return {
      key: 'recording',
      getConfig,
    };
  }

  getSecondaryMenuProvider(): TrayMenuProvider {
    return {
      key: 'secondary',
      getConfig: () => [
        {
          label: 'Open AFFiNE',
          click: () => {
            logger.info('User action: Open AFFiNE');
            getMainWindow()
              .then(w => {
                w.show();
              })
              .catch(err => {
                logger.error('Failed to open AFFiNE:', err);
              });
          },
        },
        {
          label: 'Menubar settings...',
          click: () => {
            showMainWindow();
            applicationMenuSubjects.openInSettingModal$.next({
              activeTab: 'appearance',
              scrollAnchor: 'menubar',
            });
          },
        },
        {
          label: `About ${app.getName()}`,
          click: () => {
            showMainWindow();
            applicationMenuSubjects.openInSettingModal$.next({
              activeTab: 'about',
            });
          },
        },
        'separator',
        {
          label: 'Quit AFFiNE Completely...',
          click: () => {
            logger.info('User action: Quit AFFiNE Completely');
            app.quit();
          },
        },
      ],
    };
  }

  buildMenu(providers: TrayMenuProvider[]) {
    const menu = new Menu();
    providers.forEach((provider, index) => {
      const config = provider.getConfig();
      buildMenuConfig(config).forEach(item => {
        menu.append(new MenuItem(item));
      });
      if (index !== providers.length - 1) {
        menu.append(new MenuItem({ type: 'separator' }));
      }
    });
    return menu;
  }

  disposables: (() => void)[] = [];

  [Symbol.dispose]() {
    this.disposables.forEach(d => d());
  }

  update() {
    if (!this.tray) {
      this.tray = new Tray(this.icon);
      this.tray.setToolTip(this.tooltip);
      const clickHandler = () => {
        logger.debug('User clicked on tray icon');
        this.update();
        if (!isMacOS()) {
          if (
            TraySettingsState.value.enabled &&
            TraySettingsState.value.openOnLeftClick
          ) {
            showMainWindow();
          } else {
            this.tray?.popUpContextMenu();
          }
        }
        updateApplicationsPing$.next(Date.now());
      };
      this.tray.on('click', clickHandler);
      const appGroupsSubscription = appGroups$.subscribe(() => {
        logger.debug('App groups updated, refreshing tray menu');
        this.update();
      });

      this.disposables.push(() => {
        this.tray?.off('click', clickHandler);
        this.tray?.destroy();
        appGroupsSubscription.unsubscribe();
      });
    }

    const providers = [
      this.getPrimaryMenuProvider(),
      this.getRecordingMenuProvider(),
      this.getSecondaryMenuProvider(),
    ].filter(p => p !== null);

    const menu = this.buildMenu(providers);
    this.tray.setContextMenu(menu);
  }

  init() {
    logger.info('Initializing tray');
    this.update();
  }
}

const TraySettingsState = {
  $: globalStateStorage.watch<MenubarStateSchema>(MenubarStateKey).pipe(
    map(v => MenubarStateSchema.parse(v ?? {})),
    shareReplay(1)
  ),

  get value() {
    return MenubarStateSchema.parse(
      globalStateStorage.get(MenubarStateKey) ?? {}
    );
  },
};

export const setupTrayState = () => {
  let _trayState: TrayState | undefined;
  if (TraySettingsState.value.enabled) {
    _trayState = new TrayState();
  }

  const updateTrayState = (state: MenubarStateSchema) => {
    if (state.enabled) {
      if (!_trayState) {
        _trayState = new TrayState();
      }
    } else {
      _trayState?.[Symbol.dispose]();
      _trayState = undefined;
    }
  };

  const subscription = TraySettingsState.$.subscribe(updateTrayState);

  beforeAppQuit(() => {
    subscription.unsubscribe();
  });
};
