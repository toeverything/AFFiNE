import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { BrowserWindow } from 'electron';
import { screen } from 'electron/main';
import { BehaviorSubject } from 'rxjs';

import { IpcHandle, IpcScope } from '../../../ipc';
import { customThemeViewUrl } from '../constants';
import { getScreenSize } from './utils';

@Injectable()
export class CustomThemeWindowManager {
  private readonly window$ = new BehaviorSubject<BrowserWindow | undefined>(
    undefined
  );

  constructor(private readonly logger: Logger) {}

  private async ensureWindow() {
    if (this.window$.value) {
      return this.window$.value;
    }
    this.logger.debug(
      'Creating custom theme window',
      'CustomThemeWindowManager'
    );
    const { width: maxWidth, height: maxHeight } = getScreenSize(
      screen.getPrimaryDisplay()
    );
    const browserWindow = new BrowserWindow({
      width: Math.min(maxWidth, 800),
      height: Math.min(maxHeight, 600),
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        webgl: true,
        preload: join(__dirname, './preload.js'),
        additionalArguments: [`--window-name=theme-editor`],
      },
    });

    this.window$.next(browserWindow);

    browserWindow.on('closed', () => {
      this.window$.next(undefined);
    });

    await browserWindow.loadURL(customThemeViewUrl);
    return browserWindow;
  }

  @IpcHandle({ scope: IpcScope.UI })
  async openThemeEditor() {
    const window = await this.ensureWindow();
    window.show();
    window.focus();
  }
}
