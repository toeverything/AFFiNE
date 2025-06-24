import { app } from 'electron';
import { NsisUpdater } from 'electron-updater';
import { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper';

export class WindowsUpdater extends NsisUpdater {
  protected override downloadedUpdateHelper: DownloadedUpdateHelper =
    new DownloadedUpdateHelper(app.getPath('sessionData'));
}
