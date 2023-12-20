import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema } from '@blocksuite/store';

export const globalBlockSuiteSchema = new Schema();

globalBlockSuiteSchema.register(AffineSchemas).register(__unstableSchemas);
