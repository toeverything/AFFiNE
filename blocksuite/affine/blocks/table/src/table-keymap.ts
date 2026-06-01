import { textKeymap } from '@blocksuite/affine-inline-preset';
import { TableBlockSchema } from '@blocksuite/affine-model';
import { KeymapExtension } from '@blocksuite/std';

export const TableKeymapExtension = KeymapExtension(textKeymap, {
  flavour: TableBlockSchema.model.flavour,
});
