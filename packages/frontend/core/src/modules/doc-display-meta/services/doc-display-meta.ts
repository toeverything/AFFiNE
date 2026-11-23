import { i18nTime } from '@affine/i18n';
import {
  AliasIcon as LitAliasIcon,
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
  AliasIcon,
  BlockLinkIcon,
  EdgelessIcon,
  LinkedEdgelessIcon,
  LinkedPageIcon,
  PageIcon,
  TodayIcon,
  TomorrowIcon,
  YesterdayIcon,
} from '@blocksuite/icons/rc';
import { LiveData, Service } from '@toeverything/infra';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

import type { DocRecord, DocsService } from '../../doc';
import type { ExplorerIconService } from '../../explorer-icon/services/explorer-icon';
import type { I18nService } from '../../i18n';
import type { JournalService } from '../../journal';
import { getDocIconComponent, getDocIconComponentLit } from './icon';

type IconType = 'rc' | 'lit';
interface DocDisplayIconOptions<T extends IconType> {
  type?: T;
  /**
   * Override the mode detected inside the hook:
   * by default, it will use the `primaryMode$` of the doc.
   */
  mode?: 'edgeless' | 'page';
  title?: string; // title alias
  reference?: boolean;
  referenceToNode?: boolean;
  /**
   * @default true
   */
  enableEmojiIcon?: boolean;
}
interface DocDisplayTitleOptions {
  title?: string; // title alias
  reference?: boolean;
  /**
   * @default true
   */
  enableEmojiIcon?: boolean;
}

const rcIcons = {
  AliasIcon,
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
  AliasIcon: LitAliasIcon,
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
    private readonly i18nService: I18nService,
    private readonly explorerIconService: ExplorerIconService
  ) {
    super();
  }

  getJournalIcon(
    journalDate: string | Dayjs,
    options?: DocDisplayIconOptions<'rc'>
  ): typeof TodayIcon;

  getJournalIcon(
    journalDate: string | Dayjs,
    options?: DocDisplayIconOptions<'lit'>
  ): typeof LitYesterdayIcon;

  getJournalIcon<T extends IconType = 'rc'>(
    journalDate: string | Dayjs,
    options?: DocDisplayIconOptions<T>
  ): T extends 'rc' ? typeof TodayIcon : typeof LitTodayIcon;

  getJournalIcon<T extends IconType = 'rc'>(
    journalDate: string | Dayjs,
    options?: DocDisplayIconOptions<T>
  ) {
    const iconSet = icons[options?.type ?? 'rc'];
    const day = dayjs(journalDate);
    return day.isBefore(dayjs(), 'day')
      ? iconSet.YesterdayIcon
      : day.isAfter(dayjs(), 'day')
        ? iconSet.TomorrowIcon
        : iconSet.TodayIcon;
  }

  icon$<T extends IconType = 'rc'>(
    docId: string,
    options?: DocDisplayIconOptions<T>
  ) {
    const iconSet = icons[options?.type ?? 'rc'];

    return LiveData.computed(get => {
      const enableEmojiIcon = options?.enableEmojiIcon !== false;
      const doc = get(this.docsService.list.doc$(docId));
      const referenced = !!options?.reference;
      const titleAlias = referenced ? options?.title : undefined;
      // const originalTitle = doc ? get(doc.title$) : '';
      // link to journal doc
      const journalDateString = get(this.journalService.journalDate$(docId));
      const journalIcon = journalDateString
        ? this.getJournalIcon(journalDateString, options)
        : undefined;
      // const journalTitle = journalDateString
      //   ? i18nTime(journalDateString, { absolute: { accuracy: 'day' } })
      //   : undefined;
      // const title = titleAlias ?? journalTitle ?? originalTitle;
      const mode = doc ? get(doc.primaryMode$) : undefined;
      const finalMode = options?.mode ?? mode ?? 'page';
      const referenceToNode = !!(referenced && options.referenceToNode);

      // emoji title
      if (enableEmojiIcon) {
        // const { emoji } = extractEmojiIcon(title);
        // if (emoji) return () => emoji;
        const icon = get(this.explorerIconService.icon$('doc', docId))?.icon;
        if (icon) {
          return options?.type === 'lit'
            ? getDocIconComponentLit(icon)
            : getDocIconComponent(icon);
        }
      }

      // title alias
      if (titleAlias) return iconSet.AliasIcon;

      if (journalIcon) return journalIcon;

      // link to specified block
      if (referenceToNode) return iconSet.BlockLinkIcon;

      // link to regular doc (reference)
      if (options?.reference) {
        return finalMode === 'edgeless'
          ? iconSet.LinkedEdgelessIcon
          : iconSet.LinkedPageIcon;
      }

      // default icon
      return finalMode === 'edgeless' ? iconSet.EdgelessIcon : iconSet.PageIcon;
    });
  }

  title$(docId: string, options?: DocDisplayTitleOptions) {
    return LiveData.computed(get => {
      const lng = get(this.i18nService.i18n.currentLanguageKey$);
      const doc = get(this.docsService.list.doc$(docId));
      const referenced = !!options?.reference;
      const titleAlias = referenced ? options?.title : undefined;
      const originalTitle = doc ? get(doc.title$) : '';
      // journal title
      const journalDateString = get(this.journalService.journalDate$(docId));
      const journalTitle = journalDateString
        ? i18nTime(journalDateString, { absolute: { accuracy: 'day' } })
        : undefined;
      // const title = titleAlias ?? journalTitle ?? originalTitle;

      // emoji title
      // if (enableEmojiIcon && title) {
      //   // When the title has only one emoji character,
      //   // if it's a journal document, the date should be displayed.
      //   const journalDateString = get(this.journalService.journalDate$(docId));
      //   if (journalDateString) {
      //     return i18nTime(journalDateString, { absolute: { accuracy: 'day' } });
      //   }
      // }

      // title alias
      if (titleAlias) return titleAlias;

      if (journalTitle) return journalTitle;

      // doc not found
      if (!doc) {
        return this.i18nService.i18n.i18next.t(
          'com.affine.notFoundPage.title',
          { lng }
        );
      }

      // original title
      if (originalTitle) return originalTitle;

      // empty title
      return this.i18nService.i18n.i18next.t('Untitled', { lng });
    });
  }

  getDocDisplayMeta(docRecord: DocRecord) {
    return {
      title: this.title$(docRecord.id).value,
      icon: this.icon$(docRecord.id).value,
      updatedDate: docRecord.meta$.value.updatedDate,
    };
  }
}
