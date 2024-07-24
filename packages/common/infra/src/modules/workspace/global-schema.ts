import { AffineSchemas } from '@blocksuite/blocks/schemas';
import { AIChatBlockSchema } from '@blocksuite/presets';
import { Schema } from '@blocksuite/store';

export const globalBlockSuiteSchema = new Schema();

const schemas = [...AffineSchemas, AIChatBlockSchema];
globalBlockSuiteSchema.register(schemas);
