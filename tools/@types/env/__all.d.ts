import type { BUILD_CONFIG_TYPE, Environment } from '@affine/env/global';

declare global {
  // eslint-disable-next-line no-var
  var process: {
    env: Record<string, string>;
  };
  // eslint-disable-next-line no-var
  var environment: Environment;
  // eslint-disable-next-line no-var
  var BUILD_CONFIG: BUILD_CONFIG_TYPE;
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
    /**
     * @deprecated
     */
    favorite?: boolean;
    trash?: boolean;
    trashDate?: number;
    updatedDate?: number;
    mode?: 'page' | 'edgeless';
    // todo: support `number` in the future
    isPublic?: boolean;
  }
}
