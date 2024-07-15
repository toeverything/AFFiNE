import { AffineSchemas } from '@blocksuite/blocks/schemas';
import { Schema } from '@blocksuite/store';

export const globalBlockSuiteSchema = new Schema();

globalBlockSuiteSchema.register(AffineSchemas);
