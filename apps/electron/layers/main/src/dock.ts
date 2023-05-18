import { app, Menu } from 'electron';

import { subjects } from './events';
import { restoreOrCreateWindow } from './main-window';

export async function registerDock() {
  const dockMenu = Menu.buildFromTemplate([
    {
      label: 'New Page',
      click: async () => {
        if (process.platform === 'darwin') {
          await restoreOrCreateWindow();
        }
        subjects.applicationMenu.newPageAction.next();
      },
    },
  ]);

  app.whenReady().then(() => {
    if (process.platform === 'darwin') {
      app.dock.setMenu(dockMenu);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
