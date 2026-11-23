import {
  createIdentifier,
  type ServiceIdentifier,
  type ServiceProvider,
} from '@blocksuite/global/di';
import type { BaseTextAttributes, ExtensionType } from '@blocksuite/store';

import type { InlineSpecs } from './type.js';

export const InlineSpecIdentifier =
  createIdentifier<unknown>('AffineInlineSpec');

export function InlineSpecExtension<TextAttributes extends BaseTextAttributes>(
  name: string,
  getSpec: (provider: ServiceProvider) => InlineSpecs<TextAttributes>
): ExtensionType & {
  identifier: ServiceIdentifier<InlineSpecs<TextAttributes>>;
};
export function InlineSpecExtension<TextAttributes extends BaseTextAttributes>(
  spec: InlineSpecs<TextAttributes>
): ExtensionType & {
  identifier: ServiceIdentifier<InlineSpecs<TextAttributes>>;
};
export function InlineSpecExtension<TextAttributes extends BaseTextAttributes>(
  nameOrSpec: string | InlineSpecs<TextAttributes>,
  getSpec?: (provider: ServiceProvider) => InlineSpecs<TextAttributes>
): ExtensionType & {
  identifier: ServiceIdentifier<InlineSpecs<TextAttributes>>;
} {
  if (typeof nameOrSpec === 'string') {
    const identifier =
      InlineSpecIdentifier<InlineSpecs<TextAttributes>>(nameOrSpec);
    return {
      identifier,
      setup: di => {
        di.addImpl(identifier, provider => getSpec!(provider));
      },
    };
  }
  const identifier = InlineSpecIdentifier<InlineSpecs<TextAttributes>>(
    nameOrSpec.name as string
  );
  return {
    identifier,
    setup: di => {
      di.addImpl(identifier, nameOrSpec);
    },
  };
}
