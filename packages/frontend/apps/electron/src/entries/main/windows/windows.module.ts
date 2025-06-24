import { Module } from '@nestjs/common';

import { HelperProcessModule } from '../helper-process';
import { ApplicationMenuManager } from './application-menu.service';
import { CustomThemeWindowManager } from './custom-theme-window.service';
import { MainWindowManager } from './main-window.service';
import { PopupManager } from './popup.service';
import { TabViewsState } from './states';
import { TabViewsIpcRegistry, TabViewsManager } from './tab-views.service';
import { WindowsService } from './windows.service';
import { WorkerManager } from './worker-manager.service';

@Module({
  providers: [
    WindowsService,
    MainWindowManager,
    TabViewsManager,
    TabViewsIpcRegistry,
    TabViewsState,
    ApplicationMenuManager,
    PopupManager,
    CustomThemeWindowManager,
    WorkerManager,
  ],
  exports: [
    WindowsService,
    MainWindowManager,
    TabViewsManager,
    TabViewsState,
    ApplicationMenuManager,
    PopupManager,
  ],
  imports: [HelperProcessModule],
})
export class WindowsModule {}
