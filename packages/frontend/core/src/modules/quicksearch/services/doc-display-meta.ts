import { i18nTime } from '@affine/i18n';
import { EdgelessIcon, PageIcon, TodayIcon } from '@blocksuite/icons/rc';
import type { DocRecord } from '@toeverything/infra';
import { Service } from '@toeverything/infra';

import type { WorkspacePropertiesAdapter } from '../../properties';

export class DocDisplayMetaService extends Service {
  constructor(private readonly propertiesAdapter: WorkspacePropertiesAdapter) {
    super();
  }

  getDocDisplayMeta(docRecord: DocRecord, originalTitle?: string) {
    const journalDateString = this.propertiesAdapter.getJournalPageDateString(
      docRecord.id
    );
    const icon = journalDateString
      ? TodayIcon
      : docRecord.mode$.value === 'edgeless'
        ? EdgelessIcon
        : PageIcon;

    const title = journalDateString
      ? i18nTime(journalDateString, { absolute: { accuracy: 'day' } })
      : originalTitle ||
        docRecord.meta$.value.title ||
        ({
          key: 'Untitled',
        } as const);

    return {
      title: title,
      icon: icon,
      updatedDate: docRecord.meta$.value.updatedDate,
    };
  }
}
