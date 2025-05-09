import { createIdentifier } from '@blocksuite/global/di';

import type { BlockSchemaType } from '../model/block/zod';
import type { ExtensionType } from './extension';

export const BlockSchemaIdentifier =
  createIdentifier<BlockSchemaType>('BlockSchema');

export function BlockSchemaExtension(
  blockSchema: BlockSchemaType
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(
        BlockSchemaIdentifier(blockSchema.model.flavour),
        () => blockSchema
      );
    },
  };
}
