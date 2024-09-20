import { i18nTime } from '@affine/i18n';
import {
  BlockLinkIcon as LitBlockLinkIcon,
  EdgelessIcon as LitEdgelessIcon,
  LinkedEdgelessIcon as LitLinkedEdgelessIcon,
  LinkedPageIcon as LitLinkedPageIcon,
  PageIcon as LitPageIcon,
  TodayIcon as LitTodayIcon,
  TomorrowIcon as LitTomorrowIcon,
  YesterdayIcon as LitYesterdayIcon,
} from '@blocksuite/icons/lit';
import {
  BlockLinkIcon,
  EdgelessIcon,
  LinkedEdgelessIcon,
  LinkedPageIcon,
  PageIcon,
  TodayIcon,
  TomorrowIcon,
  YesterdayIcon,
} from '@blocksuite/icons/rc';
import type { DocRecord, DocsService } from '@toeverything/infra';
import { LiveData, Service } from '@toeverything/infra';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

import type { WorkspacePropertiesAdapter } from '../../properties';

type IconType = 'rc' | 'lit';
interface DocDisplayIconOptions<T extends IconType> {
  type?: T;
  compareDate?: Date | Dayjs;
  /**
   * Override the mode detected inside the hook:
   * by default, it will use the `primaryMode$` of the doc.
   */
  mode?: 'edgeless' | 'page';
  reference?: boolean;
  referenceToNode?: boolean;
}

const rcIcons = {
  BlockLinkIcon,
  EdgelessIcon,
  LinkedEdgelessIcon,
  LinkedPageIcon,
  PageIcon,
  TodayIcon,
  TomorrowIcon,
  YesterdayIcon,
};
const litIcons = {
  BlockLinkIcon: LitBlockLinkIcon,
  EdgelessIcon: LitEdgelessIcon,
  LinkedEdgelessIcon: LitLinkedEdgelessIcon,
  LinkedPageIcon: LitLinkedPageIcon,
  PageIcon: LitPageIcon,
  TodayIcon: LitTodayIcon,
  TomorrowIcon: LitTomorrowIcon,
  YesterdayIcon: LitYesterdayIcon,
};
const icons = { rc: rcIcons, lit: litIcons } as {
  rc: Record<keyof typeof rcIcons, any>;
  lit: Record<keyof typeof litIcons, any>;
};

export class DocDisplayMetaService extends Service {
  constructor(
    private readonly propertiesAdapter: WorkspacePropertiesAdapter,
    private readonly docsService: DocsService
  ) {
    super();
  }

  icon$<T extends IconType = 'rc'>(
    docId: string,
    options?: DocDisplayIconOptions<T>
  ): LiveData<T extends 'lit' ? typeof LitTodayIcon : typeof TodayIcon> {
    const iconSet = icons[options?.type ?? 'rc'];

    return LiveData.computed(get => {
      const doc = get(this.docsService.list.doc$(docId));
      const mode = doc ? get(doc.primaryMode$) : undefined;
      const finalMode = options?.mode ?? mode ?? 'page';
      const referenceToNode = !!(options?.reference && options.referenceToNode);

      // increases block link priority
      if (referenceToNode) {
        return iconSet.BlockLinkIcon;
      }

      const journalDate = this._toDayjs(
        this.propertiesAdapter.getJournalPageDateString(docId)
      );

      if (journalDate) {
        if (!options?.compareDate) return iconSet.TodayIcon;
        const compareDate = dayjs(options?.compareDate);
        return journalDate.isBefore(compareDate, 'day')
          ? iconSet.YesterdayIcon
          : journalDate.isAfter(compareDate, 'day')
            ? iconSet.TomorrowIcon
            : iconSet.TodayIcon;
      }

      return options?.reference
        ? finalMode === 'edgeless'
          ? iconSet.LinkedEdgelessIcon
          : iconSet.LinkedPageIcon
        : finalMode === 'edgeless'
          ? iconSet.EdgelessIcon
          : iconSet.PageIcon;
    });
  }

  title$(docId: string, originalTitle?: string) {
    return LiveData.computed(get => {
      const doc = get(this.docsService.list.doc$(docId));
      const docTitle = doc ? get(doc.title$) : undefined;

      const journalDateString =
        this.propertiesAdapter.getJournalPageDateString(docId);
      return journalDateString
        ? i18nTime(journalDateString, { absolute: { accuracy: 'day' } })
        : originalTitle ||
            docTitle ||
            ({
              key: 'Untitled',
            } as const);
    });
  }

  getDocDisplayMeta(docRecord: DocRecord, originalTitle?: string) {
    return {
      title: this.title$(docRecord.id, originalTitle).value,
      icon: this.icon$(docRecord.id).value,
      updatedDate: docRecord.meta$.value.updatedDate,
    };
  }

  private _isJournalString(j?: string | false) {
    return j ? !!j?.match(/^\d{4}-\d{2}-\d{2}$/) : false;
  }

  private _toDayjs(j?: string | false) {
    if (!j || !this._isJournalString(j)) return null;
    const day = dayjs(j);
    if (!day.isValid()) return null;
    return day;
  }
}
