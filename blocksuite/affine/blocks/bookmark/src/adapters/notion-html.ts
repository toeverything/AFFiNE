import { BookmarkBlockSchema } from '@blocksuite/affine-model';
import {
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import { nanoid } from '@blocksuite/store';

export const bookmarkBlockNotionHtmlAdapterMatcher: BlockNotionHtmlAdapterMatcher =
  {
    flavour: BookmarkBlockSchema.model.flavour,
    toMatch: o => {
      return (
        HastUtils.isElement(o.node) &&
        o.node.tagName === 'figure' &&
        !!HastUtils.querySelector(o.node, '.bookmark')
      );
    },
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        const bookmark = HastUtils.querySelector(o.node, '.bookmark');
        if (!bookmark) {
          return;
        }

        const { walkerContext } = context;
        const bookmarkURL = bookmark.properties?.href;
        const bookmarkTitle = HastUtils.getTextContent(
          HastUtils.querySelector(bookmark, '.bookmark-title')
        );
        const bookmarkDescription = HastUtils.getTextContent(
          HastUtils.querySelector(bookmark, '.bookmark-description')
        );
        const bookmarkIcon = HastUtils.querySelector(
          bookmark,
          '.bookmark-icon'
        );
        const bookmarkIconURL =
          typeof bookmarkIcon?.properties?.src === 'string'
            ? bookmarkIcon.properties.src
            : '';
        walkerContext
          .openNode(
            {
              type: 'block',
              id: nanoid(),
              flavour: BookmarkBlockSchema.model.flavour,
              props: {
                type: 'card',
                url: bookmarkURL ?? '',
                title: bookmarkTitle,
                description: bookmarkDescription,
                icon: bookmarkIconURL,
              },
              children: [],
            },
            'children'
          )
          .closeNode();
        walkerContext.skipAllChildren();
      },
    },
    fromBlockSnapshot: {},
  };

export const BookmarkBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(bookmarkBlockNotionHtmlAdapterMatcher);
