import { mintChallengeResponse } from '@affine/native';
import { Injectable } from '@nestjs/common';
import { app, clipboard, nativeImage, shell } from 'electron';

import { getIpcEvent, IpcHandle, IpcScope } from '../../../ipc';
import { isMacOS } from '../utils';

interface CaptureAreaArgs {
  x: number;
  y: number;
  width: number;
  height: number;
}

@Injectable()
export class UtilsHandleService {
  @IpcHandle({ scope: IpcScope.UI })
  handleCloseApp() {
    app.quit();
  }

  @IpcHandle({ scope: IpcScope.UI })
  restartApp() {
    app.relaunch();
    app.quit();
  }

  @IpcHandle({ scope: IpcScope.UI })
  async onLanguageChange(language: string) {
    const e = getIpcEvent();

    // only works for win/linux
    // see https://www.electronjs.org/docs/latest/tutorial/spellchecker#how-to-set-the-languages-the-spellchecker-uses
    if (isMacOS()) {
      return;
    }

    if (e.sender.session.availableSpellCheckerLanguages.includes(language)) {
      e.sender.session.setSpellCheckerLanguages([language, 'en-US']);
    }
  }

  @IpcHandle({ scope: IpcScope.UI })
  async captureArea({ x, y, width, height }: CaptureAreaArgs) {
    const e = getIpcEvent();
    const image = await e.sender.capturePage({
      x: Math.floor(x),
      y: Math.floor(y),
      width: Math.floor(width),
      height: Math.floor(height),
    });

    if (image.isEmpty()) {
      throw new Error('Image is empty or invalid');
    }

    const buffer = image.toPNG();
    if (!buffer || !buffer.length) {
      throw new Error('Failed to generate PNG buffer from image');
    }

    clipboard.writeImage(nativeImage.createFromBuffer(buffer));
  }

  @IpcHandle({ scope: IpcScope.UI })
  writeImageToClipboard(buffer: ArrayBuffer) {
    const image = nativeImage.createFromBuffer(Buffer.from(buffer));
    if (image.isEmpty()) return false;
    clipboard.writeImage(image);
    return true;
  }

  @IpcHandle({ scope: IpcScope.UI })
  getChallengeResponse(challenge: string) {
    // 20 bits challenge is a balance between security and user experience
    // 20 bits challenge cost time is about 1-3s on m2 macbook air
    return mintChallengeResponse(challenge, 20);
  }

  @IpcHandle({ scope: IpcScope.UI })
  openExternal(url: string) {
    return shell.openExternal(url);
  }
}
