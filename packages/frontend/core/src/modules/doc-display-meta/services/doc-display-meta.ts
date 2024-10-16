import { extractEmojiIcon } from '@affine/core/utils';
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
import type {
  DocRecord,
  DocsService,
  FeatureFlagService,
} from '@toeverything/infra';
import { LiveData, Service } from '@toeverything/infra';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

import type { JournalService } from '../../journal';

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
  /**
   * @default true
   */
  enableEmojiIcon?: boolean;
}
interface DocDisplayTitleOptions {
  originalTitle?: string;
  reference?: boolean;
  /**
   * @default true
   */
  enableEmojiIcon?: boolean;
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
    private readonly journalService: JournalService,
    private readonly docsService: DocsService,
    private readonly featureFlagService: FeatureFlagService
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
      const title = doc ? get(doc.title$) : '';
      const mode = doc ? get(doc.primaryMode$) : undefined;
      const finalMode = options?.mode ?? mode ?? 'page';
      const referenceToNode = !!(options?.reference && options.referenceToNode);

      // increases block link priority
      if (referenceToNode) {
        return iconSet.BlockLinkIcon;
      }

      // journal icon
      const journalDate = this._toDayjs(
        this.journalService.journalDate$(docId).value
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

      // reference icon
      if (options?.reference) {
        return finalMode === 'edgeless'
          ? iconSet.LinkedEdgelessIcon
          : iconSet.LinkedPageIcon;
      }

      // emoji icon
      const enableEmojiIcon =
        get(this.featureFlagService.flags.enable_emoji_doc_icon.$) &&
        options?.enableEmojiIcon !== false;
      if (enableEmojiIcon) {
        const { emoji } = extractEmojiIcon(title);
        if (emoji) return () => emoji;
      }

      // default icon
      return finalMode === 'edgeless' ? iconSet.EdgelessIcon : iconSet.PageIcon;
    });
  }

  title$(docId: string, options?: DocDisplayTitleOptions) {
    return LiveData.computed(get => {
      const doc = get(this.docsService.list.doc$(docId));
      const docTitle = doc ? get(doc.title$) : undefined;

      const journalDateString = get(this.journalService.journalDate$(docId));

      // journal
      if (journalDateString) {
        return i18nTime(journalDateString, { absolute: { accuracy: 'day' } });
      }

      if (options?.originalTitle) return options.originalTitle;

      // empty title
      if (!docTitle) return { i18nKey: 'Untitled' } as const;

      // reference
      if (options?.reference) return docTitle;

      // check emoji
      const enableEmojiIcon =
        get(this.featureFlagService.flags.enable_emoji_doc_icon.$) &&
        options?.enableEmojiIcon !== false;
      if (enableEmojiIcon) {
        const { rest } = extractEmojiIcon(docTitle);
        return rest;
      }

      // default
      return docTitle;
    });
  }

  getDocDisplayMeta(docRecord: DocRecord, originalTitle?: string) {
    return {
      title: this.title$(docRecord.id, { originalTitle }).value,
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
