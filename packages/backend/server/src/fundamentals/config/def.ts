import type { LeafPaths } from '../utils/types';
import { AppStartupConfig } from './types';

export type EnvConfigType = 'string' | 'int' | 'float' | 'boolean';
export type ServerFlavor = 'allinone' | 'graphql' | 'sync' | 'renderer';
export type AFFINE_ENV = 'dev' | 'beta' | 'production';
export type NODE_ENV = 'development' | 'test' | 'production';

export enum DeploymentType {
  Affine = 'affine',
  Selfhosted = 'selfhosted',
}

export type ConfigPaths = LeafPaths<AppStartupConfig, '', '......'>;

export interface PreDefinedAFFiNEConfig {
  ENV_MAP: Record<string, ConfigPaths | [ConfigPaths, EnvConfigType?]>;
  serverId: string;
  serverName: string;
  readonly projectRoot: string;
  readonly AFFINE_ENV: AFFINE_ENV;
  readonly NODE_ENV: NODE_ENV;
  readonly version: string;
  readonly type: DeploymentType;
  readonly isSelfhosted: boolean;
  readonly flavor: { type: string } & { [key in ServerFlavor]: boolean };
  readonly affine: { canary: boolean; beta: boolean; stable: boolean };
  readonly node: { prod: boolean; dev: boolean; test: boolean };
  readonly deploy: boolean;
}

export interface AppPluginsConfig {}

export type AFFiNEConfig = PreDefinedAFFiNEConfig &
  AppStartupConfig &
  AppPluginsConfig;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace globalThis {
    // eslint-disable-next-line no-var
    var AFFiNE: AFFiNEConfig;
  }
}
