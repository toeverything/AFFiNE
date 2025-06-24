import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { MediaStats } from '@toeverything/infra';
import { app } from 'electron';
import { map, shareReplay } from 'rxjs';

import {
  MeetingSettingsKey,
  MeetingSettingsSchema,
} from '../../../shared/shared-state-schema';
import { beforeAppQuit, beforeTabClose } from '../cleanup';
import { GlobalStateStorage } from '../storage';
@Injectable()
export class MeetingsSettingsState implements OnModuleInit {
  constructor(
    private readonly globalStateStorage: GlobalStateStorage,
    private readonly logger: Logger
  ) {}

  $ = this.globalStateStorage
    .watch<MeetingSettingsSchema>(MeetingSettingsKey)
    .pipe(
      map(v => MeetingSettingsSchema.parse(v ?? {})),
      shareReplay(1)
    );

  get value() {
    return MeetingSettingsSchema.parse(
      this.globalStateStorage.get(MeetingSettingsKey) ?? {}
    );
  }

  set value(value: MeetingSettingsSchema) {
    this.globalStateStorage.set(MeetingSettingsKey, value);
  }

  onModuleInit() {
    app
      .whenReady()
      .then(() => {
        this.globalStateStorage.set('media:playback-state', null);
        this.globalStateStorage.set('media:stats', null);
      })
      .catch(err => {
        this.logger.error(
          'Failed to set media:playback-state and media:stats to null',
          err
        );
      });

    beforeAppQuit(() => {
      this.globalStateStorage.set('media:playback-state', null);
      this.globalStateStorage.set('media:stats', null);
    });

    beforeTabClose(tabId => {
      const stats = this.globalStateStorage.get<MediaStats | null>(
        'media:stats'
      );
      if (stats && stats.tabId === tabId) {
        this.globalStateStorage.set('media:playback-state', null);
        this.globalStateStorage.set('media:stats', null);
      }
    });
  }
}
