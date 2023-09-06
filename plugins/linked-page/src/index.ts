import type { PluginContext } from '@affine/sdk/entry';
import type { BaseBlockModel } from '@blocksuite/store';
import type { Page, PageMeta } from '@blocksuite/store';

// Copy from https://github.com/toeverything/blocksuite/blob/6c9c5137f2cda0d25738c99268ef62fdd9a1dbc4/packages/blocks/src/widgets/linked-page/config.ts#L13-L38
type LinkedPageItem = {
  key: string;
  name: string;
  icon: string;
  action: () => void;
};

type LinkedPageGroup = {
  name: string;
  styles?: string;
  items: LinkedPageItem[];
};

type LinkedPageOptions = {
  triggerKeys: string[];
  ignoreBlockTypes: string[];
  convertTriggerKey: boolean;
  getMenus: (ctx: {
    query: string;
    page: Page;
    pageMetas: PageMeta[];
    model: BaseBlockModel;
  }) => LinkedPageGroup[];
};

type LitBlockSpec = unknown;

const isPageBlock = (blockSpec: LitBlockSpec) => {
  try {
    // @ts-expect-error we has try-catch
    return blockSpec.schema.model.flavour === 'affine:page';
  } catch (error) {
    return false;
  }
};

// https://github.com/lit/lit/blob/84df6ef8c73fffec92384891b4b031d7efc01a64/packages/lit-html/src/static.ts#L93
const fakeLiteral = (strings: TemplateStringsArray, ...values: unknown[]) =>
  ({
    ['_$litStatic$']: String.raw({ raw: strings }, ...values),
    r: Symbol.for(''),
  }) as const;

const CUSTOM_LINKED_PAGE_TAG = 'affine-custom-linked-page' as const;

export const entry = (context: PluginContext) => {
  if (!('customElements' in globalThis)) {
    console.error('customElements not found in globalThis');
    return;
  }

  context.register('editor', (root, editor) => {
    const LinkedPageWidget = customElements.get('affine-linked-page-widget');
    if (!LinkedPageWidget) {
      console.error('no page block found', LinkedPageWidget);
      return () => {};
    }

    const maybeDefaultOptions =
      'DEFAULT_OPTIONS' in LinkedPageWidget
        ? (LinkedPageWidget.DEFAULT_OPTIONS as LinkedPageOptions)
        : undefined;

    if (!maybeDefaultOptions) {
      console.error('DEFAULT_OPTIONS not found', LinkedPageWidget);
      return () => {};
    }
    const linkedPageOptions = maybeDefaultOptions;

    const customGetMenus: LinkedPageOptions['getMenus'] = (...args) => {
      const menus = linkedPageOptions.getMenus(...args);

      if (menus[0] && menus[0].name === 'Link to Page') {
        const pageMetas = editor.page.workspace.meta.pageMetas;
        // Filter out trash pages
        menus[0].items = menus[0].items.filter(({ key }) => {
          const pageId = key;
          const pageMeta = pageMetas.find(({ id }) => id === pageId);
          return pageMeta?.trash !== true;
        });

        // Use edgeless icon for edgeless page
        // menus[0].items
        //   .filter(({ key }) => {
        //     const pageId = key;
        //     const pageMeta = pageMetas.find(({ id }) => id === pageId);
        //     console.log('pageMeta', pageMeta?.mode, pageMeta);
        //     // TODO get preferences from pageSettingsAtom
        //     return false
        //   })
        //   .forEach(item => {
        //     const span = document.createElement('span');
        //     createRoot(span).render(createElement(EdgelessIcon));
        //     item.icon = span as any;
        //   });
      }

      return menus;
    };

    class CustomLinkedPage extends LinkedPageWidget {
      options: LinkedPageOptions = {
        ...linkedPageOptions,
        getMenus: customGetMenus,
      };
    }

    if (!customElements.get(CUSTOM_LINKED_PAGE_TAG)) {
      customElements.define(CUSTOM_LINKED_PAGE_TAG, CustomLinkedPage);
    }

    const pageBlockSpec = editor.pagePreset.find(isPageBlock);
    if (!pageBlockSpec) {
      console.error('no page block found in page spec', editor.pagePreset);
      return () => {};
    }
    if (!pageBlockSpec.view.widgets) {
      pageBlockSpec.view.widgets = {};
    }

    // const originalLinkedPage = pageBlockSpec.view.widgets['linkedPage'];
    pageBlockSpec.view.widgets['linkedPage'] =
      fakeLiteral`${CUSTOM_LINKED_PAGE_TAG}` as any;

    const edgelessPageBlockSpec = editor.edgelessPreset.find(isPageBlock);
    if (!edgelessPageBlockSpec) {
      console.error(
        'no page block found in edgeless spec',
        editor.edgelessPreset
      );
      return () => {};
    }
    if (!edgelessPageBlockSpec.view.widgets) {
      edgelessPageBlockSpec.view.widgets = {};
    }
    // const originalEdgelessLinkedPage =
    //   edgelessPageBlockSpec.view.widgets['linkedPage'];
    edgelessPageBlockSpec.view.widgets['linkedPage'] =
      fakeLiteral`${CUSTOM_LINKED_PAGE_TAG}` as any;

    return () => {
      // if (originalLinkedPage && pageBlockSpec.view.widgets) {
      //   pageBlockSpec.view.widgets['linkedPage'] = originalLinkedPage;
      // }
      // if (originalEdgelessLinkedPage && edgelessPageBlockSpec.view.widgets) {
      //   edgelessPageBlockSpec.view.widgets['linkedPage'] =
      //     originalEdgelessLinkedPage;
      // }
    };
  });

  return () => {
    // You should unregister the `affine-custom-linked-page` but it's not possible
  };
};
