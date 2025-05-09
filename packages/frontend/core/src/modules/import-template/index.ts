import { type Framework } from '@toeverything/infra';

import { WorkspacesService } from '../workspace';
import { TemplateDownloader } from './entities/downloader';
import { TemplateDownloaderService } from './services/downloader';
import { ImportTemplateService } from './services/import';
import { TemplateDownloaderStore } from './store/downloader';

export { TemplateDownloaderService } from './services/downloader';
export { ImportTemplateService } from './services/import';

export function configureImportTemplateModule(framework: Framework) {
  framework
    .service(TemplateDownloaderService)
    .entity(TemplateDownloader, [TemplateDownloaderStore])
    .store(TemplateDownloaderStore)
    .service(ImportTemplateService, [WorkspacesService]);
}
