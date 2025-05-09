import { textKeymap } from '@blocksuite/affine-inline-preset';
import { CodeBlockSchema } from '@blocksuite/affine-model';
import { KeymapExtension } from '@blocksuite/std';

export const CodeKeymapExtension = KeymapExtension(textKeymap, {
  flavour: CodeBlockSchema.model.flavour,
});
