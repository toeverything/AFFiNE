import { type Framework, WorkspacesService } from '@toeverything/infra';

import { FetchService } from '../cloud';
import { ImportTemplateDialog } from './entities/dialog';
import { TemplateDownloader } from './entities/downloader';
import { ImportTemplateDialogService } from './services/dialog';
import { TemplateDownloaderService } from './services/downloader';
import { ImportTemplateService } from './services/import';
import { TemplateDownloaderStore } from './store/downloader';

export { ImportTemplateDialogService } from './services/dialog';
export { TemplateDownloaderService } from './services/downloader';
export { ImportTemplateService } from './services/import';

export function configureImportTemplateModule(framework: Framework) {
  framework
    .service(ImportTemplateDialogService)
    .entity(ImportTemplateDialog)
    .service(TemplateDownloaderService)
    .entity(TemplateDownloader, [TemplateDownloaderStore])
    .store(TemplateDownloaderStore, [FetchService])
    .service(ImportTemplateService, [WorkspacesService]);
}
