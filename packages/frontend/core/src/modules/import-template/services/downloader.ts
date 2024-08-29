import { Service } from '@toeverything/infra';

import { TemplateDownloader } from '../entities/downloader';

export class TemplateDownloaderService extends Service {
  downloader = this.framework.createEntity(TemplateDownloader);
}
