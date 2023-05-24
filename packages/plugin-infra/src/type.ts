// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./webpack-hmr.d.ts" />

/**
 * AFFiNE Plugin System Types
 */

/**
 * A code loader interface of the plugin API.
 *
 * Plugin should be lazy-loaded. If a plugin is not enabled, it will not be loaded into the Mask.
 *
 * @example
 * ```ts
 * const loader = {
 *     load: () => import("./code"),
 *     hotModuleReload: hot => import.meta.webpackHot && import.meta.webpackHot.accept('./code', () => hot(import("./code")))
 * }
 * ```
 *
 * The `./code` should use `export default` to export what loader expects.
 */
export interface Loader<DeferredModule> {
  /**
   * The `load()` function will be called on demand.
   *
   * It should not have side effects (e.g. start some daemon, start a new HTTP request or WebSocket client),
   * those work should be in the `.init()` function.
   * @returns the actual definition of this plugin
   * @example load: () => import('./path')
   */
  load(): Promise<{
    default: DeferredModule;
  }>;

  /**
   * This provides the functionality for hot module reload on the plugin.
   * When the callback is called, the old instance of the plugin will be unloaded, then the new instance will be init.
   * @example hotModuleReload: hot => import.meta.webpackHot && import.meta.webpackHot.accept('./path', () => hot(import('./path')))
   */
  hotModuleReload(
    onHot: (
      hot: Promise<{
        default: DeferredModule;
      }>
    ) => void
  ): void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unused-vars
interface AFFiNEPlugin {
  // todo: add more fields
}

export interface I18NStringField {
  /** The i18n key of the string content. */
  i18nKey?: string;
  /** The fallback content to display if there is no i18n string found. */
  fallback: string;
}

/** The publisher of the plugin */
export interface Publisher {
  /** The name of the publisher */
  name: I18NStringField;
  /** URL of the publisher */
  link: string;
}

/** For what stage the plugin */
export enum ReleaseStage {
  NIGHTLY = 'nightly',
  PROD = 'prod',
  DEV = 'dev',
}

export type Definition<ID extends string> = {
  /**
   * ID of the plugin. It should be unique.
   * @example "com.affine.pro"
   */
  id: ID;
  /**
   * The human-readable name of the plugin.
   * @example { i18nKey: "name", fallback: "Never gonna give you up" }
   */
  name: I18NStringField;
  /**
   * A brief description of this plugin.
   * @example { i18nKey: "description", fallback: "This plugin is going to replace every link in the page to https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
   */
  description?: I18NStringField;
  /**
   * Publisher of this plugin.
   * @example { link: "https://github.com/Dimensiondev", name: { fallback: "Mask Network", i18nKey: "org_name" } }
   */
  publisher?: Publisher;

  /**
   * The version of this plugin.
   * @example "1.0.0"
   */
  version: string;

  /**
   * The loader of this plugin.
   * @example ReleaseStage.PROD
   */
  stage: ReleaseStage;
};

export type Adapter<Options extends Record<string, unknown>> = (
  options: Options
) => HTMLElement;

export type AffinePluginContext = {
  toast: (text: string) => void;
};

export type PluginUIAdapter = {
  sidebarItem: Adapter<Record<string, unknown>>;
  headerItem: Adapter<Record<string, unknown>>;
  content: Adapter<Record<string, unknown>>;
};

export type PluginAdapterCreator = (
  context: AffinePluginContext
) => PluginUIAdapter;

export type AffinePlugin<ID extends string> = {
  definition: Definition<ID>;
  uiAdapter: Partial<PluginUIAdapter>;
};
