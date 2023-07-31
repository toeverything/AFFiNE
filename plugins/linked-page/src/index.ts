import type { PluginContext } from '@toeverything/plugin-infra/entry';

type LitBlockSpec = any
const findPageBlock = (blockSpec:LitBlockSpec) =>
  blockSpec.schema.model.flavour === 'affine:page'

const fakeLiteral = (strings: TemplateStringsArray) =>
  ({
    ['_$litStatic$']: strings[0],
    r: Symbol.for(''),
  } as const);

export const entry = (context: PluginContext) => {
  context.register('editor', (root, editor) => {
    const pageBlockSpec = editor.pagePreset.find(findPageBlock)
    if (!pageBlockSpec) {
      console.error('no page block found', editor.pagePreset);
      return () => {};
    }

    const LinkedPageWidget: any = customElements.get('affine-linked-page-widget');
    if (!LinkedPageWidget) {
      console.error('no page block found', LinkedPageWidget);
      return () => {};
    }

    class CustomLinkedPage extends LinkedPageWidget {
      options = {
        ...LinkedPageWidget.DEFAULT_OPTIONS,
        // just for testing
        triggerKeys: ['!'],
        // TODO update other options
      };
    }

    // @ts-expect-error LinkedPageWidget is a valid custom element
    customElements.define('affine-custom-linked-page', CustomLinkedPage);
    pageBlockSpec.view.widgets.linkedPage = fakeLiteral`affine-custom-linked-page`
    return () => {};
  });

  return () => {
    // You should unregister the `affine-custom-linked-page` but it's not possible
  };
};
