import {
  app,
  Menu,
  MenuItem,
  type MenuItemConstructorOptions,
  type NativeImage,
  nativeImage,
  Tray,
} from 'electron';

import { isMacOS } from '../../shared/utils';
import { applicationMenuSubjects } from '../application-menu';
import { beforeAppQuit } from '../cleanup';
import { logger } from '../logger';
import {
  appGroups$,
  pauseRecording,
  recordingStatus$,
  resumeRecording,
  startRecording,
  stopRecording,
} from '../recording';
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

class TrayState {
  tray: Tray | null = null;

  // tray's icon
  icon: NativeImage = nativeImage
    .createFromPath(icons.tray)
    .resize({ width: 16, height: 16 });

  // tray's tooltip
  tooltip: string = 'AFFiNE';

  constructor() {
    this.icon.setTemplateImage(true);
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

  getRecordingMenuProvider(): TrayMenuProvider {
    const appGroups = appGroups$.value;
    const runningAppGroups = appGroups.filter(appGroup => appGroup.isRunning);

    const recordingStatus = recordingStatus$.value;

    if (!recordingStatus || recordingStatus?.status === 'stopped') {
      return {
        key: 'recording',
        getConfig: () => [
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
              ...runningAppGroups.map(appGroup => ({
                label: appGroup.name,
                icon: appGroup.icon || undefined,
                click: () => {
                  logger.info(
                    `User action: Start Recording Meeting (${appGroup.name})`
                  );
                  startRecording(appGroup);
                },
              })),
            ],
          },
        ],
      };
    }

    const recordingLabel = recordingStatus.appGroup?.name
      ? `Recording (${recordingStatus.appGroup?.name})`
      : 'Recording';

    // recording is either started or paused
    return {
      key: 'recording',
      getConfig: () => [
        {
          label: recordingLabel,
          icon: icons.recording,
          disabled: true,
        },
        recordingStatus.status === 'paused'
          ? {
              label: 'Resume',
              click: () => {
                logger.info('User action: Resume Recording');
                resumeRecording();
              },
            }
          : {
              label: 'Pause',
              click: () => {
                logger.info('User action: Pause Recording');
                pauseRecording();
              },
            },
        {
          label: 'Stop',
          click: () => {
            logger.info('User action: Stop Recording');
            stopRecording().catch(err => {
              logger.error('Failed to stop recording:', err);
            });
          },
        },
      ],
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

  update() {
    if (!this.tray) {
      this.tray = new Tray(this.icon);
      this.tray.setToolTip(this.tooltip);
      const clickHandler = () => {
        logger.debug('User clicked on tray icon');
        this.update();
        if (!isMacOS()) {
          this.tray?.popUpContextMenu();
        }
      };
      this.tray.on('click', clickHandler);
      const appGroupsSubscription = appGroups$.subscribe(() => {
        logger.debug('App groups updated, refreshing tray menu');
        this.update();
      });
      beforeAppQuit(() => {
        logger.info('Cleaning up tray before app quit');
        this.tray?.off('click', clickHandler);
        this.tray?.destroy();
        appGroupsSubscription.unsubscribe();
      });
    }

    const providers = [
      this.getPrimaryMenuProvider(),
      isMacOS() ? this.getRecordingMenuProvider() : null,
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

let _trayState: TrayState | undefined;

export const setupTrayState = () => {
  if (!_trayState) {
    _trayState = new TrayState();
    _trayState.init();
  }
  return _trayState;
};
