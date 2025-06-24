import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { app } from 'electron';

import { MainWindowManager } from './main-window.service';

/**
 * This service is responsible for managing the windows of the application.
 * AKA the "launcher".
 */
@Injectable()
export class WindowsService implements OnModuleInit {
  constructor(
    private readonly mainWindowService: MainWindowManager,
    private readonly logger: Logger
  ) {}

  onModuleInit() {
    app.on('ready', () => {
      this.logger.log('app is ready', 'WindowsService');
      this.initializeMainWindow().catch(err => {
        this.logger.error('Failed to initialize main window', err);
      });
    });
  }

  async initializeMainWindow() {
    return this.mainWindowService.initAndShowMainWindow();
  }

  async getMainWindow() {
    return this.mainWindowService.getMainWindow();
  }
}
