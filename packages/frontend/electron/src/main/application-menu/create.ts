import { app, Menu } from 'electron';

import { isMacOS } from '../../shared/utils';
import { logger, revealLogFile } from '../logger';
import { checkForUpdates } from '../updater';
import {
  addTab,
  closeTab,
  initAndShowMainWindow,
  showDevTools,
  showMainWindow,
} from '../windows-manager';
import { applicationMenuSubjects } from './subject';

// Unique id for menuitems
const MENUITEM_NEW_PAGE = 'affine:new-page';

export function createApplicationMenu() {
  const isMac = isMacOS();

  // Electron menu cannot be modified
  // You have to copy the complete default menu template event if you want to add a single custom item
  // See https://www.electronjs.org/docs/latest/api/menu#examples
  const template = [
    // { role: 'appMenu' }
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              {
                label: `About ${app.getName()}`,
                click: async () => {
                  await showMainWindow();
                  applicationMenuSubjects.openAboutPageInSettingModal$.next();
                },
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    // { role: 'fileMenu' }
    {
      label: 'File',
      submenu: [
        {
          id: MENUITEM_NEW_PAGE,
          label: 'New Doc',
          accelerator: isMac ? 'Cmd+N' : 'Ctrl+N',
          click: async () => {
            await initAndShowMainWindow();
            // fixme: if the window is just created, the new page action will not be triggered
            applicationMenuSubjects.newPageAction$.next();
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    // { role: 'editMenu' }
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
              { type: 'separator' },
              {
                label: 'Speech',
                submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }],
              },
            ]
          : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
      ],
    },
    // { role: 'viewMenu' }
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'New tab',
          accelerator: isMac ? 'Cmd+T' : 'Ctrl+T',
          click() {
            logger.info('New tab with shortcut');
            addTab().catch(console.error);
          },
        },
        {
          label: 'Close tab',
          accelerator: isMac ? 'Cmd+W' : 'Ctrl+W',
          click() {
            logger.info('Close tab with shortcut');
            closeTab().catch(console.error);
          },
        },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { shell } = require('electron');
            await shell.openExternal('https://affine.pro/');
          },
        },
        {
          label: 'Open log file',
          click: async () => {
            await revealLogFile();
          },
        },
        {
          label: 'Open dev tools',
          accelerator: isMac ? 'Cmd+Shift+I' : 'Ctrl+Shift+I',
          click: () => {
            showDevTools();
          },
        },
        {
          label: 'Check for Updates',
          click: async () => {
            await initAndShowMainWindow();
            await checkForUpdates();
          },
        },
        {
          label: 'Documentation',
          click: async () => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { shell } = require('electron');
            await shell.openExternal(
              'https://docs.affine.pro/docs/hello-bonjour-aloha-你好'
            );
          },
        },
      ],
    },
  ];

  // @ts-expect-error: The snippet is copied from Electron official docs.
  //                   It's working as expected. No idea why it contains type errors.
  //                   Just ignore for now.
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  return menu;
}
