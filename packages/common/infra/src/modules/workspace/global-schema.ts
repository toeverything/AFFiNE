import { AffineSchemas } from '@blocksuite/blocks/schemas';
import { Schema } from '@blocksuite/store';

import { AIChatBlockSchema } from '../../blocksuite/blocks/ai-chat-block/ai-chat-model';

let _schema: Schema | null = null;
export function getAFFiNEWorkspaceSchema() {
  if (!_schema) {
    _schema = new Schema();

    _schema.register([...AffineSchemas, AIChatBlockSchema]);
  }

  return _schema;
}
