import type { Schema } from '@toeverything/infra';

export const docIndexSchema = {
  title: 'FullText',
} satisfies Schema;

export const blockIndexSchema = {
  docId: 'String',
  blockId: 'String',
  content: 'FullText',
  flavour: 'String',
} satisfies Schema;
