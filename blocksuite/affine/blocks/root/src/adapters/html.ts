import { RootBlockSchema } from '@blocksuite/affine-model';
import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';

export const rootBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: RootBlockSchema.model.flavour,
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'header',
  fromMatch: o => o.node.flavour === RootBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const { walkerContext } = context;
      if (o.node.tagName === 'header') {
        walkerContext.skipAllChildren();
      }
    },
  },
  fromBlockSnapshot: {
    enter: (_, context) => {
      const { walkerContext } = context;
      const htmlRootDocContext =
        walkerContext.getGlobalContext('hast:html-root-doc');
      const isRootDoc = htmlRootDocContext ?? true;
      if (!isRootDoc) {
        return;
      }

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'html',
            properties: {},
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'element',
            tagName: 'head',
            properties: {},
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'element',
            tagName: 'style',
            properties: {},
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'text',
            value: `
            input[type='checkbox'] {
              display: none;
            }
            label:before {
              background: rgb(30, 150, 235);
              border-radius: 3px;
              height: 16px;
              width: 16px;
              display: inline-block;
              cursor: pointer;
            }
            input[type='checkbox'] + label:before {
              content: '';
              background: rgb(30, 150, 235);
              color: #fff;
              font-size: 16px;
              line-height: 16px;
              text-align: center;
            }
            input[type='checkbox']:checked + label:before {
              content: '✓';
            }
            `.replace(/\s\s+/g, ''),
          },
          'children'
        )
        .closeNode()
        .closeNode()
        .closeNode()
        .openNode(
          {
            type: 'element',
            tagName: 'body',
            properties: {},
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'element',
            tagName: 'div',
            properties: {
              style: 'width: 70vw; margin: 60px auto;',
            },
            children: [],
          },
          'children'
        )
        .openNode({
          type: 'comment',
          value: 'BlockSuiteDocTitlePlaceholder',
        })
        .closeNode();
    },
    leave: (_, context) => {
      const { walkerContext } = context;
      const htmlRootDocContext =
        walkerContext.getGlobalContext('hast:html-root-doc');
      const isRootDoc = htmlRootDocContext ?? true;
      if (!isRootDoc) {
        return;
      }
      walkerContext.closeNode().closeNode().closeNode();
    },
  },
};

export const RootBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  rootBlockHtmlAdapterMatcher
);
