import { AffineSchemas } from '@blocksuite/affine/blocks/schemas';
import { AIChatBlockSchema } from '@blocksuite/affine/presets';
import { Schema } from '@blocksuite/affine/store';

let _schema: Schema | null = null;
export function getAFFiNEWorkspaceSchema() {
  if (!_schema) {
    _schema = new Schema();

    _schema.register([...AffineSchemas, AIChatBlockSchema]);
  }

  return _schema;
}
