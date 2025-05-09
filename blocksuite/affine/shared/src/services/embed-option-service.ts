import type { EmbedCardStyle } from '@blocksuite/affine-model';
import type { Container } from '@blocksuite/global/di';
import { createIdentifier } from '@blocksuite/global/di';
import { type BlockStdScope, StdIdentifier } from '@blocksuite/std';
import { Extension, type ExtensionType } from '@blocksuite/store';

export type EmbedOptions = {
  flavour: string;
  urlRegex: RegExp;
  styles: EmbedCardStyle[];
  viewType: 'card' | 'embed';
};

export interface EmbedOptionProvider {
  getEmbedBlockOptions(url: string): EmbedOptions | null;
  registerEmbedBlockOptions(options: EmbedOptions): void;
}

export const EmbedOptionProvider = createIdentifier<EmbedOptionProvider>(
  'AffineEmbedOptionProvider'
);

export const EmbedOptionConfigIdentifier = createIdentifier<EmbedOptions>(
  'AffineEmbedOptionConfig'
);

export const EmbedOptionConfig = (options: EmbedOptions): ExtensionType => {
  return {
    setup: di => {
      di.addImpl(EmbedOptionConfigIdentifier(options.flavour), options);
    },
  };
};

export class EmbedOptionService
  extends Extension
  implements EmbedOptionProvider
{
  private readonly _embedBlockRegistry = new Set<EmbedOptions>();

  constructor(readonly std: BlockStdScope) {
    super();
    const configs = this.std.provider.getAll(EmbedOptionConfigIdentifier);
    configs.forEach(value => {
      this.registerEmbedBlockOptions(value);
    });
  }

  getEmbedBlockOptions = (url: string): EmbedOptions | null => {
    const entries = this._embedBlockRegistry.entries();
    for (const [options] of entries) {
      const regex = options.urlRegex;
      if (regex.test(url)) return options;
    }
    return null;
  };

  registerEmbedBlockOptions = (options: EmbedOptions): void => {
    this._embedBlockRegistry.add(options);
  };

  static override setup(di: Container) {
    di.addImpl(EmbedOptionProvider, EmbedOptionService, [StdIdentifier]);
  }
}
