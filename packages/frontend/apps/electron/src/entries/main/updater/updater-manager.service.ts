import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { app } from 'electron';
import { autoUpdater as defaultAutoUpdater } from 'electron-updater';
import { BehaviorSubject, Subject } from 'rxjs';

import { IpcEvent, IpcHandle, IpcScope } from '../../../ipc';
import { buildType, isDev } from '../../../shared/constants';
import { logger } from '../logger';
import { isWindows } from '../utils';
import { AFFiNEUpdateProvider } from './affine-update-provider';
import { WindowsUpdater } from './windows-updater';

export interface UpdateMeta {
  version: string;
  allowAutoUpdate: boolean;
}

@Injectable()
export class UpdaterManagerService implements OnModuleInit {
  constructor(private readonly logger: Logger) {}

  onModuleInit() {
    this.registerUpdater();
  }

  disabled = buildType === 'internal' || isDev;
  autoUpdater = isWindows() ? new WindowsUpdater() : defaultAutoUpdater;

  @IpcHandle({ scope: IpcScope.UPDATER })
  currentVersion() {
    return app.getVersion();
  }

  @IpcHandle({ scope: IpcScope.UPDATER })
  quitAndInstall() {
    return this.autoUpdater.quitAndInstall();
  }

  downloading = false;
  checkingUpdate = false;
  configured = false;

  @IpcEvent({ scope: IpcScope.UPDATER })
  updateAvailable$ = new Subject<UpdateMeta>();

  @IpcEvent({ scope: IpcScope.UPDATER })
  updateReady$ = new Subject<UpdateMeta>();

  @IpcEvent({ scope: IpcScope.UPDATER })
  downloadProgress$ = new BehaviorSubject<number>(0);

  config = {
    autoCheckUpdate: true,
    autoDownloadUpdate: true,
  };

  @IpcHandle({ scope: IpcScope.UPDATER })
  getConfig() {
    return this.config;
  }

  @IpcHandle({ scope: IpcScope.UPDATER })
  setConfig(newConfig: Partial<typeof this.config>) {
    this.configured = true;
    Object.assign(this.config, newConfig);
    if (this.config.autoCheckUpdate) {
      this.checkForUpdates().catch(err => {
        this.logger.error('Error checking for updates', err);
      });
    }
  }

  @IpcHandle({ scope: IpcScope.UPDATER })
  async checkForUpdates() {
    const result = await this.autoUpdater.checkForUpdatesAndNotify();

    if (!result) {
      return null;
    }
    const { isUpdateAvailable, updateInfo } = result;
    return {
      isUpdateAvailable,
      updateInfo,
    };
  }

  @IpcHandle({ scope: IpcScope.UPDATER })
  async downloadUpdate() {
    if (this.disabled || this.downloading) {
      return;
    }
    this.downloading = true;
    this.downloadProgress$.next(0);
    this.autoUpdater.downloadUpdate().catch(e => {
      this.downloading = false;
      this.logger.error('Failed to download update', e);
    });
    this.logger.log('Update available, downloading...');
    return;
  }

  registerUpdater() {
    if (this.disabled) {
      return;
    }

    const allowAutoUpdate = true;

    this.autoUpdater.logger = logger;
    this.autoUpdater.autoDownload = false;
    this.autoUpdater.allowPrerelease = buildType !== 'stable';
    this.autoUpdater.autoInstallOnAppQuit = false;
    this.autoUpdater.autoRunAppAfterInstall = true;

    const feedUrl = AFFiNEUpdateProvider.configFeed({
      channel: buildType,
    });

    this.autoUpdater.setFeedURL(feedUrl);

    // register events for checkForUpdates
    this.autoUpdater.on('checking-for-update', () => {
      this.logger.log('Checking for update');
    });
    this.autoUpdater.on('update-available', info => {
      this.logger.log(`Update available: ${JSON.stringify(info)}`);
      if (this.config.autoDownloadUpdate && allowAutoUpdate) {
        this.downloadUpdate().catch(err => {
          console.error(err);
        });
      }
      this.updateAvailable$.next({
        version: info.version,
        allowAutoUpdate,
      });
    });
    this.autoUpdater.on('update-not-available', info => {
      this.logger.log(`Update not available: ${JSON.stringify(info)}`);
    });
    this.autoUpdater.on('download-progress', e => {
      this.logger.log(`Download progress: ${e.percent}`);
      this.downloadProgress$.next(e.percent);
    });
    this.autoUpdater.on('update-downloaded', e => {
      this.downloading = false;
      this.updateReady$.next({
        version: e.version,
        allowAutoUpdate,
      });
      // I guess we can skip it?
      // updaterSubjects.clientDownloadProgress.next(100);
      this.logger.log('Update downloaded, ready to install');
    });
    this.autoUpdater.on('error', e => {
      this.logger.error('Error while updating client', e);
    });
    this.autoUpdater.forceDevUpdateConfig = isDev;

    // check update whenever the window is activated
    let lastCheckTime = 0;
    app.on('browser-window-focus', () => {
      (async () => {
        if (
          this.configured &&
          this.config.autoCheckUpdate &&
          lastCheckTime + 1000 * 1800 < Date.now()
        ) {
          lastCheckTime = Date.now();
          await this.checkForUpdates();
        }
      })().catch(err => {
        this.logger.error('Error checking for updates', err);
      });
    });
  }
}
