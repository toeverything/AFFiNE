import type { Environment, RuntimeConfig } from '@affine/env/global';

declare global {
  // eslint-disable-next-line no-var
  var process: {
    env: Record<string, string>;
  };
  // eslint-disable-next-line no-var
  var environment: Environment;
  // eslint-disable-next-line no-var
  var runtimeConfig: RuntimeConfig;
  // eslint-disable-next-line no-var
  var $AFFINE_SETUP: boolean | undefined;
  /**
   * Inject by https://www.npmjs.com/package/@sentry/webpack-plugin
   */
  // eslint-disable-next-line no-var
  var SENTRY_RELEASE: { id: string } | undefined;
}

declare module '@blocksuite/store' {
  interface DocMeta {
    favorite?: boolean;
    // If a page remove to trash, and it is a subpage, it will remove from its parent `subpageIds`, 'trashRelate' is use for save it parent
    trashRelate?: string;
    trash?: boolean;
    trashDate?: number;
    updatedDate?: number;
    mode?: 'page' | 'edgeless';
    jumpOnce?: boolean;
    // todo: support `number` in the future
    isPublic?: boolean;
  }
}
