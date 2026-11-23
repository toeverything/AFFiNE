import { ListBlockSchema } from '@blocksuite/affine-model';
import {
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import type { DeltaInsert } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';

const listBlockMatchTags = new Set(['ul', 'ol', 'li']);

export const listBlockNotionHtmlAdapterMatcher: BlockNotionHtmlAdapterMatcher =
  {
    flavour: ListBlockSchema.model.flavour,
    toMatch: o =>
      HastUtils.isElement(o.node) && listBlockMatchTags.has(o.node.tagName),
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }

        const { walkerContext, pageMap, deltaConverter } = context;
        switch (o.node.tagName) {
          case 'ul':
          case 'ol': {
            walkerContext.setNodeContext('hast:list:type', 'bulleted');
            if (o.node.tagName === 'ol') {
              walkerContext.setNodeContext('hast:list:type', 'numbered');
            } else if (Array.isArray(o.node.properties?.className)) {
              if (o.node.properties.className.includes('to-do-list')) {
                walkerContext.setNodeContext('hast:list:type', 'todo');
              } else if (o.node.properties.className.includes('toggle')) {
                walkerContext.setNodeContext('hast:list:type', 'toggle');
              } else if (
                o.node.properties.className.includes('bulleted-list')
              ) {
                walkerContext.setNodeContext('hast:list:type', 'bulleted');
              }
            }
            break;
          }
          case 'li': {
            const firstElementChild = HastUtils.getElementChildren(o.node)[0];
            const notionListType =
              walkerContext.getNodeContext('hast:list:type');
            const listType =
              notionListType === 'toggle' ? 'bulleted' : notionListType;
            let delta: DeltaInsert[] = [];
            if (notionListType === 'toggle') {
              delta = deltaConverter.astToDelta(
                HastUtils.querySelector(o.node, 'summary') ?? o.node,
                { pageMap }
              );
            } else if (notionListType === 'todo') {
              delta = deltaConverter.astToDelta(o.node, { pageMap });
            } else {
              delta = deltaConverter.astToDelta(
                HastUtils.getInlineOnlyElementAST(o.node),
                {
                  pageMap,
                }
              );
            }
            walkerContext.openNode(
              {
                type: 'block',
                id: nanoid(),
                flavour: 'affine:list',
                props: {
                  type: listType,
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta,
                  },
                  checked:
                    notionListType === 'todo'
                      ? firstElementChild &&
                        Array.isArray(
                          firstElementChild.properties?.className
                        ) &&
                        firstElementChild.properties.className.includes(
                          'checkbox-on'
                        )
                      : false,
                  collapsed:
                    notionListType === 'toggle'
                      ? firstElementChild &&
                        firstElementChild.tagName === 'details' &&
                        firstElementChild.properties.open === undefined
                      : false,
                },
                children: [],
              },
              'children'
            );
            break;
          }
        }
      },
      leave: (o, context) => {
        const { walkerContext } = context;
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        if (o.node.tagName === 'li') {
          walkerContext.closeNode();
        }
      },
    },
    fromBlockSnapshot: {},
  };

export const ListBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(listBlockNotionHtmlAdapterMatcher);
