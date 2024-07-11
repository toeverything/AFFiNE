import { AffineSchemas } from '@blocksuite/blocks/schemas';
import { AIChatBlockSchema } from '@blocksuite/presets';
import { Schema } from '@blocksuite/store';

export const globalBlockSuiteSchema = new Schema();

const schemas = [...AffineSchemas, AIChatBlockSchema];
const surfaceBlockSchema = schemas.find(
  schema => schema.model.flavour === 'affine:surface'
);

if (surfaceBlockSchema) {
  const AIChatBlockFlavour = AIChatBlockSchema.model.flavour;
  surfaceBlockSchema.model.children?.push(AIChatBlockFlavour);
}

globalBlockSuiteSchema.register(schemas);
