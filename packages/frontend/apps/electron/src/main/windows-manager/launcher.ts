import { powerMonitor, BrowserWindow } from 'electron';
import { logger } from '../logger';
import { initAndShowMainWindow } from './main-window';

let mainWindow: BrowserWindow | null = null;
let batterySaverEnabled = false;

/**
 * Launch app depending on launch stage
 */
export async function launch() {
  try {
    // Create or restore the main window
    mainWindow = await initAndShowMainWindow();

    // Send current battery status after window loads
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('battery-saver-status', batterySaverEnabled);
    });

    // Detect power status changes
    powerMonitor.on('on-battery', () => {
      batterySaverEnabled = true;
      logger.info('Battery saver mode ON (running on battery)');
      mainWindow?.webContents.send('battery-saver-status', true);
    });

    powerMonitor.on('on-ac', () => {
      batterySaverEnabled = false;
      logger.info('Battery saver mode OFF (running on AC)');
      mainWindow?.webContents.send('battery-saver-status', false);
    });

  } catch (e) {
    logger.error('Failed to restore or create window:', e);
  }
}
