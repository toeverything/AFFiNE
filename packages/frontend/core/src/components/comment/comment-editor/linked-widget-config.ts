import { MemberSearchService } from '@affine/core/modules/permissions';
import { highlighter } from '@affine/core/modules/quicksearch/utils/highlighter';
import { I18n } from '@affine/i18n';
import track from '@affine/track';
import type { AffineInlineEditor } from '@blocksuite/affine/shared/types';
import type {
  LinkedMenuItem,
  LinkedWidgetConfig,
} from '@blocksuite/affine/widgets/linked-doc';
import { UserIcon } from '@blocksuite/icons/lit';
import { BLOCK_ID_ATTR, type BlockComponent } from '@blocksuite/std';
import { computed } from '@preact/signals-core';
import type { FrameworkProvider } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import Fuse, { type FuseResultMatch } from 'fuse.js';
import { html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

export const createCommentLinkedWidgetConfig = (
  framework: FrameworkProvider
): Partial<LinkedWidgetConfig> | undefined => {
  const memberGroup = (
    query: string,
    close: () => void,
    inlineEditor: AffineInlineEditor
  ) => {
    const memberSearchService = framework.get(MemberSearchService);

    const getMenuItem = (
      id: string,
      name?: string | null,
      avatar?: string | null
    ): LinkedMenuItem => {
      const avatarStyle = styleMap({
        borderRadius: '50%',
        border: `1px solid ${cssVarV2('layer/background/overlayPanel')}`,
        width: '20px',
        height: '20px',
        boxSizing: 'border-box',
      });
      const icon = avatar
        ? html`<img style=${avatarStyle} src="${avatar}" />`
        : UserIcon();

      let displayName = name ?? 'Unknown';
      return {
        key: id,
        name: html`${unsafeHTML(displayName)}`,
        icon,
        action: () => {
          const root = inlineEditor.rootElement;
          const block = root?.closest<BlockComponent>(`[${BLOCK_ID_ATTR}]`);
          if (!block) return;

          close();

          track.doc.editor.atMenu.mentionMember({
            type: 'member',
          });

          const inlineRange = inlineEditor.getInlineRange();
          if (!inlineRange || inlineRange.length !== 0) return;

          inlineEditor.insertText(inlineRange, ' ', {
            mention: {
              member: id,
            },
          });
          inlineEditor.setInlineRange({
            index: inlineRange.index + 1,
            length: 0,
          });
        },
      };
    };
    const highlightFuseTitle = (
      matches: readonly FuseResultMatch[] | undefined,
      title: string,
      key: string
    ): string => {
      if (!matches) {
        return title;
      }
      const normalizedRange = ([start, end]: [number, number]) =>
        [
          start,
          end + 1 /* in fuse, the `end` is different from the `substring` */,
        ] as [number, number];
      const titleMatches = matches
        ?.filter(match => match.key === key)
        .flatMap(match => match.indices.map(normalizedRange));
      return (
        highlighter(
          title,
          `<span style="color: ${cssVarV2('text/emphasis')}">`,
          '</span>',
          titleMatches ?? []
        ) ?? title
      );
    };

    memberSearchService.search(query);

    const items = computed<LinkedMenuItem[]>(() => {
      const members = memberSearchService.result$.signal.value;

      if (query.length === 0) {
        return members
          .slice(0, 3)
          .map(member => getMenuItem(member.id, member.name, member.avatarUrl));
      }

      // Create a single Fuse instance for all members
      const fuse = new Fuse(members, {
        keys: ['name'],
        includeMatches: true,
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.0,
      });
      const searchResults = fuse.search(query);

      return searchResults.map(result => {
        const member = result.item;
        const displayName = highlightFuseTitle(
          result.matches,
          member.name ?? 'Unknown',
          'name'
        );
        return {
          ...getMenuItem(member.id, member.name, member.avatarUrl),
          name: html`${unsafeHTML(displayName)}`,
        };
      });
    });

    return {
      name: I18n.t('com.affine.editor.at-menu.mention-members'),
      items,
      loading: memberSearchService.isLoading$.signal,
      hidden: computed(() => {
        return (
          memberSearchService.result$.signal.value.length === 0 &&
          !memberSearchService.isLoading$.signal.value
        );
      }),
      maxDisplay: 3,
      overflowText: computed(() => {
        const totalCount = memberSearchService.result$.signal.value.length;
        const remainingCount = totalCount - 3;
        return I18n.t('com.affine.editor.at-menu.more-members-hint', {
          count: remainingCount,
        });
      }),
    };
  };

  return {
    getMenus: (query, close, _editorHost, inlineEditor) => {
      return [memberGroup(query, close, inlineEditor)];
    },
  };
};
