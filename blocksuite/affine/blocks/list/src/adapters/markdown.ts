import { ListBlockSchema } from '@blocksuite/affine-model';
import {
  AdapterTextUtils,
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import type { DeltaInsert } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import type { List } from 'mdast';

const LIST_MDAST_TYPE = new Set(['list', 'listItem']);
const isListMDASTType = (node: MarkdownAST) => LIST_MDAST_TYPE.has(node.type);

export const listBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: ListBlockSchema.model.flavour,
  toMatch: o => isListMDASTType(o.node),
  fromMatch: o => o.node.flavour === ListBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext, deltaConverter } = context;
      if (o.node.type === 'listItem') {
        const parentList = o.parent?.node as List;
        const listNumber = parentList.start
          ? parentList.start + parentList.children.indexOf(o.node)
          : null;
        walkerContext.openNode(
          {
            type: 'block',
            id: nanoid(),
            flavour: 'affine:list',
            props: {
              type:
                o.node.checked !== null
                  ? 'todo'
                  : parentList.ordered
                    ? 'numbered'
                    : 'bulleted',
              text: {
                '$blocksuite:internal:text$': true,
                delta:
                  o.node.children[0] && o.node.children[0].type === 'paragraph'
                    ? deltaConverter.astToDelta(o.node.children[0])
                    : [],
              },
              checked: o.node.checked ?? false,
              collapsed: false,
              order: listNumber,
            },
            children: [],
          },
          'children'
        );
        if (o.node.children[0] && o.node.children[0].type === 'paragraph') {
          walkerContext.skipChildren(1);
        }
      }
    },
    leave: (o, context) => {
      const { walkerContext } = context;
      if (o.node.type === 'listItem') {
        walkerContext.closeNode();
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext, deltaConverter } = context;
      const text = (o.node.props.text ?? { delta: [] }) as {
        delta: DeltaInsert[];
      };
      const currentTNode = walkerContext.currentNode();
      // check if the list is of the same type
      if (
        walkerContext.getNodeContext('affine:list:parent') === o.parent &&
        currentTNode.type === 'list' &&
        currentTNode.ordered === (o.node.props.type === 'numbered') &&
        AdapterTextUtils.isNullish(currentTNode.children[0].checked) ===
          AdapterTextUtils.isNullish(
            o.node.props.type === 'todo'
              ? (o.node.props.checked as boolean)
              : undefined
          )
      ) {
        // if true, add the list item to the list
      } else {
        // if false, create a new list
        walkerContext
          .openNode(
            {
              type: 'list',
              ordered: o.node.props.type === 'numbered',
              spread: false,
              children: [],
            },
            'children'
          )
          .setNodeContext('affine:list:parent', o.parent);
      }
      walkerContext
        .openNode(
          {
            type: 'listItem',
            checked:
              o.node.props.type === 'todo'
                ? (o.node.props.checked as boolean)
                : undefined,
            spread: false,
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'paragraph',
            children: deltaConverter.deltaToAST(text.delta),
          },
          'children'
        )
        .closeNode();
    },
    leave: (o, context) => {
      const { walkerContext } = context;
      const currentTNode = walkerContext.currentNode();
      const previousTNode = walkerContext.previousNode();
      if (
        walkerContext.getPreviousNodeContext('affine:list:parent') ===
          o.parent &&
        currentTNode.type === 'listItem' &&
        previousTNode?.type === 'list' &&
        previousTNode.ordered === (o.node.props.type === 'numbered') &&
        AdapterTextUtils.isNullish(currentTNode.checked) ===
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

export const ListBlockMarkdownAdapterExtension = BlockMarkdownAdapterExtension(
  listBlockMarkdownAdapterMatcher
);
