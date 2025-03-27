import { createIdentifier, type ServiceProvider } from '@blocksuite/global/di';
import type {
  BaseAdapter,
  ExtensionType,
  Transformer,
} from '@blocksuite/store';

type AdapterConstructor = new (
  job: Transformer,
  provider: ServiceProvider
) => BaseAdapter;

export interface ClipboardAdapterConfig {
  mimeType: string;
  priority: number;
  adapter: AdapterConstructor;
}

export const ClipboardAdapterConfigIdentifier =
  createIdentifier<ClipboardAdapterConfig>('clipboard-adapter-config');

export function ClipboardAdapterConfigExtension(
  config: ClipboardAdapterConfig
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(
        ClipboardAdapterConfigIdentifier(config.mimeType),
        () => config
      );
    },
  };
}
