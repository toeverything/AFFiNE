import { Injectable } from '@nestjs/common';

import { Config, OnEvent, URLHelper } from '../../base';
import { fixUrl, OriginRules } from './utils';

@Injectable()
export class WorkerService {
  allowedOrigins: OriginRules = [...this.url.allowedOrigins];

  constructor(
    private readonly config: Config,
    private readonly url: URLHelper
  ) {}

  @OnEvent('config.init')
  onConfigInit() {
    this.allowedOrigins = [
      ...this.config.worker.allowedOrigin
        .map(u => fixUrl(u)?.origin as string)
        .filter(v => !!v),
      ...this.url.allowedOrigins,
    ];
  }

  @OnEvent('config.changed')
  onConfigChanged(event: Events['config.changed']) {
    if ('worker' in event.updates) {
      this.onConfigInit();
    }
  }
}
