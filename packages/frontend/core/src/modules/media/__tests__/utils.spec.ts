/**
 * @vitest-environment happy-dom
 */
import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import { describe, expect, test } from 'vitest';

import { getAttachmentType } from '../utils';

const buildModel = (name: string, type = '') =>
  ({ props: { name, type } }) as unknown as AttachmentBlockModel;

describe('getAttachmentType', () => {
  test('returns text for unknown extension', () => {
    const model = buildModel('file.unknown');
    expect(getAttachmentType(model)).toBe('text');
  });

  test('returns text for go file', () => {
    const model = buildModel('code.go');
    expect(getAttachmentType(model)).toBe('text');
  });

  test('returns image for png file', () => {
    const model = buildModel('pic.png');
    expect(getAttachmentType(model)).toBe('image');
  });
});
