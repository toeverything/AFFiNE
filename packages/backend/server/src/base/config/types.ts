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
