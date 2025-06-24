import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { app, Menu } from 'electron';
import { Subject } from 'rxjs';

import { IpcEvent, IpcScope } from '../../../ipc';
import { revealLogFile } from '../../../logger';
import { isMacOS } from '../utils';
import { PopupManager } from './popup.service';
import { TabViewsManager } from './tab-views.service';
import { WorkerManager } from './worker-manager.service';

const MENUITEM_NEW_PAGE = 'affine:new-page';

@Injectable()
export class ApplicationMenuManager implements OnModuleInit {
  @IpcEvent({ scope: IpcScope.MENU })
  readonly openInSettingModal$ = new Subject<{
    activeTab: string;
    scrollAnchor?: string;
  }>();

  @IpcEvent({ scope: IpcScope.MENU })
  readonly newPageAction$ = new Subject<'page' | 'edgeless'>();

  @IpcEvent({ scope: IpcScope.MENU })
  readonly openJournal$ = new Subject<void>();

  constructor(
    private readonly tabViews: TabViewsManager,
    private readonly workerManager: WorkerManager,
    private readonly popupManager: PopupManager,
    private readonly logger: Logger
  ) {}

  onModuleInit() {
    app.on('ready', () => {
      this.init();
    });
  }

  private init() {
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
                    this.tabViews.mainWindow?.show();
                    this.openInSettingModal$.next({
                      activeTab: 'about',
                    });
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
            click: () => {
              this.tabViews.mainWindow?.show();
              // fixme: if the window is just created, the new page action will not be triggered
              this.newPageAction$.next('page');
            },
          },
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
                  submenu: [
                    { role: 'startSpeaking' },
                    { role: 'stopSpeaking' },
                  ],
                },
              ]
            : [
                { role: 'delete' },
                { type: 'separator' },
                { role: 'selectAll' },
              ]),
        ],
      },
      // { role: 'viewMenu' }
      {
        label: 'View',
        submenu: [
          {
            label: 'Reload',
            accelerator: 'CommandOrControl+R',
            click: async () => {
              if (this.tabViews.activeWorkbenchId) {
                await this.tabViews.loadTab(this.tabViews.activeWorkbenchId);
              }
            },
          },
          {
            role: 'windowMenu',
          },
          {
            label: 'Open devtools',
            accelerator: isMac ? 'Cmd+Option+I' : 'Ctrl+Shift+I',
            click: () => {
              const workerContents = Array.from(
                this.workerManager.workers.values()
              ).map(
                worker =>
                  [worker.key, worker.browserWindow.webContents] as const
              );

              const tabs = Array.from(this.tabViews.tabViewsMap).map(view => {
                const isActive = this.tabViews.isActiveTab(view[0]);
                return [
                  view[0] + (isActive ? ' (active)' : ''),
                  view[1].webContents,
                ] as const;
              });

              const popups = Array.from(
                this.popupManager.popupWindows$.value.values()
              )
                .filter(popup => popup.browserWindow)
                .map(popup => {
                  return [
                    popup.type,
                    // oxlint-disable-next-line no-non-null-assertion
                    popup.browserWindow!.webContents,
                  ] as const;
                });

              const allWebContents = [
                ['tabs', tabs],
                ['workers', workerContents],
                ['popups', popups],
              ] as const;

              Menu.buildFromTemplate(
                allWebContents.flatMap(([type, contents]) => {
                  return [
                    {
                      label: type,
                      enabled: false,
                    },
                    ...contents.map(([id, webContents]) => ({
                      label: id,
                      click: () => {
                        webContents.openDevTools({
                          mode: 'undocked',
                        });
                      },
                    })),
                    { type: 'separator' },
                  ];
                })
              ).popup();
            },
          },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          ...(!isMacOS()
            ? [{ role: 'zoomIn', accelerator: 'Ctrl+=', visible: false }]
            : []),
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          { type: 'separator' },
          {
            label: 'New tab',
            accelerator: 'CommandOrControl+T',
            click: () => {
              this.logger.log('New tab with shortcut');
              this.tabViews.addTab().catch(console.error);
            },
          },
          {
            label: 'Close view',
            accelerator: 'CommandOrControl+W',
            click: () => {
              this.logger.log('Close view with shortcut');
              // tell the active workbench to close the current view
              this.tabViews.closeView$.next();
            },
          },
          {
            label: 'Undo close tab',
            accelerator: 'CommandOrControl+Shift+T',
            click: () => {
              this.logger.log('Undo close tab with shortcut');
              this.tabViews.undoCloseTab().catch(console.error);
            },
          },
          ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => {
            const shortcut = `CommandOrControl+${n}`;
            const listener = () => {
              this.tabViews.switchTab(n);
            };
            return {
              acceleratorWorksWhenHidden: true,
              label: `Switch to tab ${n}`,
              accelerator: shortcut,
              click: listener,
              visible: false,
            };
          }),
          {
            label: 'Switch to next tab',
            accelerator: 'Control+Tab',
            click: () => {
              this.tabViews.switchToNextTab();
            },
          },
          {
            label: 'Switch to previous tab',
            accelerator: 'Control+Shift+Tab',
            click: () => {
              this.tabViews.switchToPreviousTab();
            },
          },
          {
            label: 'Switch to next tab (mac 2)',
            accelerator: 'Alt+Command+]',
            visible: false,
            click: () => {
              this.tabViews.switchToNextTab();
            },
          },
          {
            label: 'Switch to previous tab (mac 2)',
            accelerator: 'Alt+Command+[',
            visible: false,
            click: () => {
              this.tabViews.switchToPreviousTab();
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
              // oxlint-disable-next-line no-var-requires
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
            label: 'Documentation',
            click: async () => {
              // oxlint-disable-next-line no-var-requires
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
}
