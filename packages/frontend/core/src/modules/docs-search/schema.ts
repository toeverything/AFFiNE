import { defineSchema } from '@toeverything/infra';

export const docIndexSchema = defineSchema({
  title: 'FullText',
});

export type DocIndexSchema = typeof docIndexSchema;

export const blockIndexSchema = defineSchema({
  docId: 'String',
  blockId: 'String',
  content: 'FullText',
  flavour: 'String',
  blob: 'String',
  // reference doc id
  // ['xxx','yyy']
  refDocId: 'String',
  // reference info
  // [{"docId":"xxx","mode":"page","blockIds":["gt5Yfq1maYvgNgpi13rIq"]},{"docId":"yyy","mode":"edgeless","blockIds":["k5prpOlDF-9CzfatmO0W7"]}]
  ref: 'String',
});

export type BlockIndexSchema = typeof blockIndexSchema;
