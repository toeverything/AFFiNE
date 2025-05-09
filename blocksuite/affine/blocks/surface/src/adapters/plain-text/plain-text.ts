import { getMindMapNodeMap } from '@blocksuite/affine-model';
import {
  BlockPlainTextAdapterExtension,
  type BlockPlainTextAdapterMatcher,
} from '@blocksuite/affine-shared/adapters';

import { PlainTextElementModelAdapter } from './element-adapter/index.js';
import { ElementToPlainTextAdapterMatcherIdentifier } from './element-adapter/type.js';

export const surfaceBlockPlainTextAdapterMatcher: BlockPlainTextAdapterMatcher =
  {
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

export const SurfaceBlockPlainTextAdapterExtension =
  BlockPlainTextAdapterExtension(surfaceBlockPlainTextAdapterMatcher);

export const edgelessSurfaceBlockPlainTextAdapterMatcher: BlockPlainTextAdapterMatcher =
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
          provider.getAll(ElementToPlainTextAdapterMatcherIdentifier).values()
        );
        const plainTextElementModelAdapter = new PlainTextElementModelAdapter(
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
            const plainText = plainTextElementModelAdapter.fromElementModel(
              element,
              { walkerContext, elements }
            );
            if (plainText) {
              context.textBuffer.content += plainText + '\n';
            }
          });
        }
      },
    },
  };

export const EdgelessSurfaceBlockPlainTextAdapterExtension =
  BlockPlainTextAdapterExtension(edgelessSurfaceBlockPlainTextAdapterMatcher);
