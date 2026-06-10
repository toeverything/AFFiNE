import { ParagraphBlockSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  IN_PARAGRAPH_NODE_CONTEXT_KEY,
  isCalloutNode,
  type MarkdownAST,
  type MarkdownDeltaConverter,
} from '@blocksuite/affine-shared/adapters';
import type { BlockSnapshot, DeltaInsert } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import type { Blockquote, Heading, List, ListItem } from 'mdast';

/**
 * Extend the HeadingData type to include the collapsed property
 */
declare module 'mdast' {
  interface HeadingData {
    collapsed?: boolean;
  }
}

const PARAGRAPH_MDAST_TYPE = new Set(['paragraph', 'heading', 'blockquote']);

const isParagraphMDASTType = (node: MarkdownAST) =>
  PARAGRAPH_MDAST_TYPE.has(node.type);

const joinDeltaLines = (
  lines: DeltaInsert[][],
  prefix?: string
): DeltaInsert[] => {
  const deltas: DeltaInsert[] = [];
  lines.forEach(line => {
    if (deltas.length) deltas.push({ insert: '\n' });
    if (prefix) deltas.push({ insert: prefix });
    deltas.push(...line);
  });
  return deltas;
};

const flattenListItemToDelta = (
  node: ListItem,
  deltaConverter: MarkdownDeltaConverter,
  prefix: string,
  depth: number
): DeltaInsert[] => {
  const firstParagraph = node.children[0];
  const lines: DeltaInsert[][] = [];
  if (firstParagraph?.type === 'paragraph') {
    lines.push([
      { insert: prefix },
      ...deltaConverter.astToDelta(firstParagraph),
    ]);
  } else {
    lines.push([{ insert: prefix.trimEnd() }]);
  }
  node.children
    .slice(firstParagraph?.type === 'paragraph' ? 1 : 0)
    .forEach(child => {
      const delta = flattenMarkdownBlockToDelta(
        child as MarkdownAST,
        deltaConverter,
        depth + 1
      );
      if (delta.length) {
        lines.push(delta);
      }
    });
  return joinDeltaLines(lines);
};

const flattenMarkdownBlockToDelta = (
  node: MarkdownAST,
  deltaConverter: MarkdownDeltaConverter,
  depth = 0
): DeltaInsert[] => {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return deltaConverter.astToDelta(node);
    case 'list': {
      const list = node as List;
      return joinDeltaLines(
        list.children.map((item, index) => {
          const order = (list.start ?? 1) + index;
          const prefix =
            '  '.repeat(depth) + (list.ordered ? `${order}. ` : '- ');
          return flattenListItemToDelta(item, deltaConverter, prefix, depth);
        })
      );
    }
    case 'blockquote':
      return flattenBlockquoteToDelta(node as Blockquote, deltaConverter);
    default:
      return 'children' in node
        ? joinDeltaLines(
            (node.children as MarkdownAST[]).map(child =>
              flattenMarkdownBlockToDelta(child, deltaConverter, depth)
            )
          )
        : [];
  }
};

const flattenBlockquoteToDelta = (
  node: Blockquote,
  deltaConverter: MarkdownDeltaConverter
) =>
  joinDeltaLines(
    node.children.map(child =>
      flattenMarkdownBlockToDelta(child as MarkdownAST, deltaConverter)
    )
  );

const getSnapshotTextDelta = (node: BlockSnapshot): DeltaInsert[] => {
  const text = (node.props.text ?? { delta: [] }) as {
    delta: DeltaInsert[];
  };
  return text.delta;
};

const flattenSnapshotBlockToDelta = (
  node: BlockSnapshot,
  depth = 0
): DeltaInsert[] => {
  if (node.flavour === 'affine:list') {
    const type = node.props.type;
    const order = (node.props.order as number | undefined) ?? 1;
    const prefix =
      '  '.repeat(depth) + (type === 'numbered' ? `${order}. ` : '- ');
    return joinDeltaLines([
      [{ insert: prefix }, ...getSnapshotTextDelta(node)],
      ...node.children.map(child =>
        flattenSnapshotBlockToDelta(child, depth + 1)
      ),
    ]);
  }
  return joinDeltaLines([
    getSnapshotTextDelta(node),
    ...node.children.map(child => flattenSnapshotBlockToDelta(child, depth)),
  ]);
};

const flattenQuoteSnapshotToDelta = (
  text: DeltaInsert[],
  children: BlockSnapshot[]
) =>
  joinDeltaLines([
    text,
    ...children.map(child => flattenSnapshotBlockToDelta(child)),
  ]);

export const paragraphBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher =
  {
    flavour: ParagraphBlockSchema.model.flavour,
    toMatch: o => isParagraphMDASTType(o.node) && !isCalloutNode(o.node),
    fromMatch: o => o.node.flavour === ParagraphBlockSchema.model.flavour,
    toBlockSnapshot: {
      enter: (o, context) => {
        const { walkerContext, deltaConverter } = context;
        switch (o.node.type) {
          case 'paragraph': {
            walkerContext.setGlobalContext(IN_PARAGRAPH_NODE_CONTEXT_KEY, true);
            walkerContext
              .openNode(
                {
                  type: 'block',
                  id: nanoid(),
                  flavour: 'affine:paragraph',
                  props: {
                    type: 'text',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: deltaConverter.astToDelta(o.node),
                    },
                  },
                  children: [],
                },
                'children'
              )
              .closeNode();
            break;
          }
          case 'heading': {
            const isCollapsed = !!o.node.data?.collapsed;
            walkerContext
              .openNode(
                {
                  type: 'block',
                  id: nanoid(),
                  flavour: 'affine:paragraph',
                  props: {
                    type: `h${o.node.depth}`,
                    collapsed: isCollapsed,
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: deltaConverter.astToDelta(o.node),
                    },
                  },
                  children: [],
                },
                'children'
              )
              .closeNode();
            break;
          }
          case 'blockquote': {
            if (isCalloutNode(o.node)) {
              return;
            }

            walkerContext
              .openNode(
                {
                  type: 'block',
                  id: nanoid(),
                  flavour: 'affine:paragraph',
                  props: {
                    type: 'quote',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: flattenBlockquoteToDelta(
                        o.node as Blockquote,
                        deltaConverter
                      ),
                    },
                  },
                  children: [],
                },
                'children'
              )
              .closeNode();
            walkerContext.skipAllChildren();
            break;
          }
        }
      },
      leave: (o, context) => {
        if (o.node.type === 'paragraph') {
          const { walkerContext } = context;
          walkerContext.setGlobalContext(IN_PARAGRAPH_NODE_CONTEXT_KEY, false);
        }
      },
    },
    fromBlockSnapshot: {
      enter: (o, context) => {
        const { walkerContext, deltaConverter } = context;
        const paragraphDepth = (walkerContext.getGlobalContext(
          'affine:paragraph:depth'
        ) ?? 0) as number;
        const text = (o.node.props.text ?? { delta: [] }) as {
          delta: DeltaInsert[];
        };
        switch (o.node.props.type) {
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
          case 'h5':
          case 'h6': {
            walkerContext
              .openNode(
                {
                  type: 'heading',
                  depth: parseInt(o.node.props.type[1]) as Heading['depth'],
                  children: deltaConverter.deltaToAST(
                    text.delta,
                    paragraphDepth
                  ),
                },
                'children'
              )
              .closeNode();
            break;
          }
          case 'text': {
            walkerContext
              .openNode(
                {
                  type: 'paragraph',
                  children: deltaConverter.deltaToAST(
                    text.delta,
                    paragraphDepth
                  ),
                },
                'children'
              )
              .closeNode();
            break;
          }
          case 'quote': {
            const quoteDelta = flattenQuoteSnapshotToDelta(
              text.delta,
              o.node.children
            );
            walkerContext
              .openNode(
                {
                  type: 'blockquote',
                  children: [],
                },
                'children'
              )
              .openNode(
                {
                  type: 'paragraph',
                  children: deltaConverter.deltaToAST(quoteDelta),
                },
                'children'
              )
              .closeNode()
              .closeNode();
            walkerContext.skipAllChildren();
            break;
          }
        }
        walkerContext.setGlobalContext(
          'affine:paragraph:depth',
          paragraphDepth + 1
        );
      },
      leave: (_, context) => {
        const { walkerContext } = context;
        walkerContext.setGlobalContext(
          'affine:paragraph:depth',
          (walkerContext.getGlobalContext('affine:paragraph:depth') as number) -
            1
        );
      },
    },
  };

export const ParagraphBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(paragraphBlockMarkdownAdapterMatcher);
