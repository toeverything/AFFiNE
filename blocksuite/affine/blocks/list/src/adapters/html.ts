import { ListBlockSchema } from '@blocksuite/affine-model';
import {
  AdapterTextUtils,
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import type { DeltaInsert } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import type { Element } from 'hast';

export const listBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: ListBlockSchema.model.flavour,
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'li',
  fromMatch: o => o.node.flavour === ListBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }

      const parentList = o.parent?.node as Element;
      let listType = 'bulleted';
      if (parentList.tagName === 'ol') {
        listType = 'numbered';
      } else if (Array.isArray(parentList.properties?.className)) {
        if (parentList.properties.className.includes('to-do-list')) {
          listType = 'todo';
        } else if (parentList.properties.className.includes('toggle')) {
          listType = 'toggle';
        } else if (parentList.properties.className.includes('bulleted-list')) {
          listType = 'bulleted';
        }
      }

      const listNumber =
        typeof parentList.properties.start === 'number'
          ? parentList.properties.start + parentList.children.indexOf(o.node)
          : null;
      const firstElementChild = HastUtils.getElementChildren(o.node)[0];
      o.node = HastUtils.flatNodes(
        o.node,
        tagName => tagName === 'div' || tagName === 'p'
      ) as Element;

      const { walkerContext, deltaConverter } = context;
      walkerContext.openNode(
        {
          type: 'block',
          id: nanoid(),
          flavour: 'affine:list',
          props: {
            type: listType,
            text: {
              '$blocksuite:internal:text$': true,
              delta:
                listType !== 'toggle'
                  ? deltaConverter.astToDelta(
                      HastUtils.getInlineOnlyElementAST(o.node)
                    )
                  : deltaConverter.astToDelta(
                      HastUtils.querySelector(o.node, 'summary') ?? o.node
                    ),
            },
            checked:
              listType === 'todo'
                ? firstElementChild &&
                  Array.isArray(firstElementChild.properties?.className) &&
                  firstElementChild.properties.className.includes('checkbox-on')
                : false,
            collapsed:
              listType === 'toggle'
                ? firstElementChild &&
                  firstElementChild.tagName === 'details' &&
                  firstElementChild.properties.open === undefined
                : false,
            order: listNumber,
          },
          children: [],
        },
        'children'
      );
    },
    leave: (_, context) => {
      const { walkerContext } = context;
      walkerContext.closeNode();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const text = (o.node.props.text ?? { delta: [] }) as {
        delta: DeltaInsert[];
      };
      const { deltaConverter, walkerContext } = context;
      const currentTNode = walkerContext.currentNode();
      const liChildren = deltaConverter.deltaToAST(text.delta);
      if (o.node.props.type === 'todo') {
        liChildren.unshift({
          type: 'element',
          tagName: 'input',
          properties: {
            type: 'checkbox',
            checked: o.node.props.checked as boolean,
          },
          children: [
            {
              type: 'element',
              tagName: 'label',
              properties: {
                style: 'margin-right: 3px;',
              },
              children: [],
            },
          ],
        });
      }
      // check if the list is of the same type
      if (
        walkerContext.getNodeContext('affine:list:parent') === o.parent &&
        currentTNode.type === 'element' &&
        currentTNode.tagName ===
          (o.node.props.type === 'numbered' ? 'ol' : 'ul') &&
        !(
          Array.isArray(currentTNode.properties.className) &&
          currentTNode.properties.className.includes('todo-list')
        ) ===
          AdapterTextUtils.isNullish(
            o.node.props.type === 'todo'
              ? (o.node.props.checked as boolean)
              : undefined
          )
      ) {
        // if true, add the list item to the list
      } else {
        // if false, create a new list
        walkerContext.openNode(
          {
            type: 'element',
            tagName: o.node.props.type === 'numbered' ? 'ol' : 'ul',
            properties: {
              style:
                o.node.props.type === 'todo'
                  ? 'list-style-type: none; padding-inline-start: 18px;'
                  : null,
              className: [o.node.props.type + '-list'],
            },
            children: [],
          },
          'children'
        );
        walkerContext.setNodeContext('affine:list:parent', o.parent);
      }

      walkerContext.openNode(
        {
          type: 'element',
          tagName: 'li',
          properties: {
            className: ['affine-list-block-container'],
          },
          children: liChildren,
        },
        'children'
      );
    },
    leave: (o, context) => {
      const { walkerContext } = context;
      const currentTNode = walkerContext.currentNode() as Element;
      const previousTNode = walkerContext.previousNode() as Element;
      if (
        walkerContext.getPreviousNodeContext('affine:list:parent') ===
          o.parent &&
        currentTNode.tagName === 'li' &&
        previousTNode.tagName ===
          (o.node.props.type === 'numbered' ? 'ol' : 'ul') &&
        !(
          Array.isArray(previousTNode.properties.className) &&
          previousTNode.properties.className.includes('todo-list')
        ) ===
          AdapterTextUtils.isNullish(
            o.node.props.type === 'todo'
              ? (o.node.props.checked as boolean)
              : undefined
          )
      ) {
        walkerContext.closeNode();
        if (
          o.next?.flavour !== 'affine:list' ||
          o.next.props.type !== o.node.props.type
        ) {
          // If the next node is not a list or different type of list, close the list
          walkerContext.closeNode();
        }
      } else {
        walkerContext.closeNode().closeNode();
      }
    },
  },
};

export const ListBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  listBlockHtmlAdapterMatcher
);
