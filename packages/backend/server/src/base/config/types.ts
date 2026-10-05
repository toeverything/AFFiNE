import { LeafPaths, PathType } from '../utils';

declare global {
  type ConfigItem<T> = Leaf<T>;
  interface AppConfigSchema {}
  type AppConfig = DeeplyEraseLeaf<AppConfigSchema>;
}

export type AppConfigByPath<Module extends keyof AppConfigSchema> =
  AppConfigSchema[Module] extends infer Config
    ? {
        [Path in LeafPaths<Config>]: Path extends string
          ? PathType<Config, Path> extends infer Item
            ? Item extends Leaf<infer V>
              ? V
              : Item
            : never
          : never;
      }
    : never;

export type NodeConfig = Omit<
  AppConfig,
  | 'auth'
  | 'copilot'
  | 'crypto'
  | 'db'
  | 'indexer'
  | 'oauth'
  | 'payment'
  | 'redis'
  | 'storages'
> & {
  auth: Pick<
    AppConfig['auth'],
    'passwordRequirements' | 'signInRateLimit' | 'trustedCloudflareHeaders'
  >;
  copilot: Pick<AppConfig['copilot'], 'exa' | 'unsplash'>;
  db: Pick<AppConfig['db'], 'prisma'>;
  payment: Pick<AppConfig['payment'], 'showLifetimePrice'>;
  storages: {
    avatar: Pick<AppConfig['storages']['avatar'], 'publicPath'>;
  };
};
