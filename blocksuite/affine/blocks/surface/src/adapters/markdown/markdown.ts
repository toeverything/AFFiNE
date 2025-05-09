import { getMindMapNodeMap } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
} from '@blocksuite/affine-shared/adapters';

import { MarkdownElementModelAdapter } from './element-adapter/index.js';
import { ElementToMarkdownAdapterMatcherIdentifier } from './element-adapter/type.js';

export const surfaceBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: 'affine:surface',
  toMatch: () => false,
  fromMatch: o => o.node.flavour === 'affine:surface',
  toBlockSnapshot: {},
  fromBlockSnapshot: {
    enter: (_, context) => {
      context.walkerContext.skipAllChildren();
    },
  },
};

export const SurfaceBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(surfaceBlockMarkdownAdapterMatcher);

export const edgelessSurfaceBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher =
  {
    flavour: 'affine:surface',
    toMatch: () => false,
    fromMatch: o => o.node.flavour === 'affine:surface',
    toBlockSnapshot: {},
    fromBlockSnapshot: {
      enter: (o, context) => {
        const { walkerContext, provider } = context;
        if (!provider) {
          context.walkerContext.skipAllChildren();
          return;
        }

        const elementModelMatchers = Array.from(
          provider.getAll(ElementToMarkdownAdapterMatcherIdentifier).values()
        );
        const markdownElementModelAdapter = new MarkdownElementModelAdapter(
          elementModelMatchers
        );
        if ('elements' in o.node.props) {
          const elements = o.node.props.elements as Record<
            string,
            Record<string, unknown>
          >;
          // Get all the node maps of mindMap elements
          const mindMapArray = Object.entries(elements)
            .filter(([_, element]) => element.type === 'mindmap')
            .map(([_, element]) => getMindMapNodeMap(element));
          walkerContext.setGlobalContext(
            'surface:mindMap:nodeMapArray',
            mindMapArray
          );

          Object.entries(
            o.node.props.elements as Record<string, Record<string, unknown>>
          ).forEach(([_, element]) => {
            const markdownAST = markdownElementModelAdapter.fromElementModel(
              element,
              { walkerContext, elements }
            );
            if (markdownAST) {
              walkerContext.openNode(markdownAST, 'children').closeNode();
            }
          });
        }
      },
    },
  };

export const EdgelessSurfaceBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(edgelessSurfaceBlockMarkdownAdapterMatcher);
