import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
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

import {
  MenubarStateKey,
  MenubarStateSchema,
} from '../../../shared/shared-state-schema';
import { beforeAppQuit } from '../cleanup';
import { MeetingsSettingsState } from '../recording/meetings-settings-state.service';
import { RecordingManager } from '../recording/recording.service';
import { GlobalStateStorage } from '../storage/storage.service';
import { isMacOS } from '../utils';
import { ApplicationMenuManager, MainWindowManager } from '../windows';
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

  context = 'tray';

  constructor(
    private readonly mainWindow: MainWindowManager,
    private readonly applicationMenu: ApplicationMenuManager,
    private readonly recordingService: RecordingManager,
    private readonly meetingSettings: MeetingsSettingsState,
    private readonly logger: Logger
  ) {
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
            this.logger.log('User action: Open Journal');
            this.mainWindow
              .show()
              .then(() => {
                this.applicationMenu.openJournal$.next();
              })
              .catch(err => {
                this.logger.error(
                  'Failed to open main window:',
                  err,
                  this.context
                );
              });
          },
        },
        {
          label: 'New Page',
          icon: icons.page,
          click: () => {
            this.logger.log('User action: New Page');
            this.mainWindow
              .show()
              .then(() => {
                this.applicationMenu.newPageAction$.next('page');
              })
              .catch(err => {
                this.logger.error(
                  'Failed to open main window:',
                  err,
                  this.context
                );
              });
          },
        },
        {
          label: 'New Edgeless',
          icon: icons.edgeless,
          click: () => {
            this.logger.log('User action: New Edgeless');
            this.mainWindow
              .show()
              .then(() => {
                this.applicationMenu.newPageAction$.next('edgeless');
              })
              .catch(err => {
                this.logger.error(
                  'Failed to open main window:',
                  err,
                  this.context
                );
              });
          },
        },
      ],
    };
  }

  getRecordingMenuProvider(): TrayMenuProvider | null {
    if (!this.recordingService.checkRecordingAvailable()) {
      return null;
    }

    const getConfig = () => {
      const items: TrayMenuConfig = [];
      if (!this.meetingSettings.value.enabled) {
        items.push({
          label: 'Meetings are disabled',
          disabled: true,
        });
      } else if (!this.recordingService.checkCanRecordMeeting()) {
        items.push({
          label: 'Required permissions not granted',
          disabled: true,
        });
      } else {
        const appGroups = this.recordingService.appGroups$.value;
        const runningAppGroups = appGroups.filter(
          appGroup => appGroup.isRunning
        );

        const recordingStatus = this.recordingService.recordingStatus$.value;

        if (
          !recordingStatus ||
          (recordingStatus?.status !== 'paused' &&
            recordingStatus?.status !== 'recording')
        ) {
          const appMenuItems = runningAppGroups.map(appGroup => ({
            label: appGroup.name,
            icon: appGroup.icon || undefined,
            click: () => {
              this.logger.log(
                `User action: Start Recording Meeting (${appGroup.name})`,
                this.context
              );
              this.recordingService.startRecording(appGroup);
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
                    this.logger.log(
                      'User action: Start Recording Meeting (System audio)',
                      this.context
                    );
                    this.recordingService.startRecording();
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
                this.logger.log('User action: Stop Recording', this.context);
                this.recordingService
                  .stopRecording(recordingStatus.id)
                  .catch(err => {
                    this.logger.error('Failed to stop recording:', err);
                  });
              },
            }
          );
        }
      }
      if (this.recordingService.checkRecordingAvailable()) {
        items.push({
          label: `Meetings Settings...`,
          click: () => {
            this.mainWindow
              .show()
              .then(() => {
                this.applicationMenu.openInSettingModal$.next({
                  activeTab: 'meetings',
                });
              })
              .catch(err => {
                this.logger.error(
                  'Failed to open main window:',
                  err,
                  this.context
                );
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
            this.logger.log('User action: Open AFFiNE', this.context);
            this.mainWindow
              .show()
              .then(() => {
                this.applicationMenu.openJournal$.next();
              })
              .catch(err => {
                this.logger.error('Failed to open AFFiNE:', err, this.context);
              });
          },
        },
        {
          label: 'Menubar settings...',
          click: () => {
            this.mainWindow
              .show()
              .then(() => {
                this.applicationMenu.openInSettingModal$.next({
                  activeTab: 'appearance',
                  scrollAnchor: 'menubar',
                });
              })
              .catch(err => {
                this.logger.error('Failed to open AFFiNE:', err, this.context);
              });
          },
        },
        {
          label: `About ${app.getName()}`,
          click: () => {
            this.mainWindow
              .show()
              .then(() => {
                this.applicationMenu.openInSettingModal$.next({
                  activeTab: 'about',
                });
              })
              .catch(err => {
                this.logger.error('Failed to open AFFiNE:', err, this.context);
              });
          },
        },
        'separator',
        {
          label: 'Quit AFFiNE Completely...',
          click: () => {
            this.logger.log(
              'User action: Quit AFFiNE Completely',
              this.context
            );
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
        this.logger.debug('User clicked on tray icon', this.context);
        this.update();
        if (!isMacOS()) {
          this.tray?.popUpContextMenu();
        }
        this.recordingService.updateApplicationsPing$.next(Date.now());
      };
      this.tray.on('click', clickHandler);
      const appGroupsSubscription = this.recordingService.appGroups$.subscribe(
        () => {
          this.update();
        }
      );

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
    this.logger.log('Initializing tray', this.context);
    this.update();
  }
}

@Injectable()
export class TrayManager implements OnModuleInit {
  constructor(
    private readonly globalStateStorage: GlobalStateStorage,
    private readonly mainWindow: MainWindowManager,
    private readonly applicationMenu: ApplicationMenuManager,
    private readonly recordingService: RecordingManager,
    private readonly meetingSettings: MeetingsSettingsState,
    private readonly logger: Logger
  ) {}

  _trayState: TrayState | undefined;

  settingsState = {
    $: this.globalStateStorage.watch<MenubarStateSchema>(MenubarStateKey).pipe(
      map(v => MenubarStateSchema.parse(v ?? {})),
      shareReplay(1)
    ),

    value: () => {
      return MenubarStateSchema.parse(
        this.globalStateStorage.get(MenubarStateKey) ?? {}
      );
    },
  };

  updateTrayState = (state: MenubarStateSchema) => {
    if (state.enabled) {
      if (!this._trayState) {
        this._trayState = new TrayState(
          this.mainWindow,
          this.applicationMenu,
          this.recordingService,
          this.meetingSettings,
          this.logger
        );
      }
    } else {
      this._trayState?.[Symbol.dispose]();
      this._trayState = undefined;
    }
  };

  onModuleInit() {
    app.on('ready', () => {
      this.logger.log('Initializing tray manager', 'TrayManager');
      const subscription = this.settingsState.$.subscribe(state => {
        this.updateTrayState(state);
      });

      this.updateTrayState(this.settingsState.value());

      beforeAppQuit(() => {
        subscription.unsubscribe();
      });
    });
  }
}
