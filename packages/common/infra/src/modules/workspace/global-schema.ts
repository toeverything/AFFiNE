import { AffineSchemas } from '@blocksuite/blocks/schemas';
import { AIChatBlockSchema } from '@blocksuite/presets';
import { Schema } from '@blocksuite/store';

let _schema: Schema | null = null;
export function getAFFiNEWorkspaceSchema() {
  if (!_schema) {
    _schema = new Schema();

    _schema.register([...AffineSchemas, AIChatBlockSchema]);
  }

  return _schema;
}
