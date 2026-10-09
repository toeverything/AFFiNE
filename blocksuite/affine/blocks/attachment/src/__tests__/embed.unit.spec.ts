import type { AttachmentBlockModel } from '@blocksuite/affine-model';
import { Container } from '@blocksuite/global/di';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DRAWIO_EMBED_URL } from '../drawio/utils';
import {
  AttachmentDrawioEmbedUrlExtension,
  AttachmentEmbedConfigExtension,
  AttachmentEmbedConfigIdentifier,
} from '../embed';

const drawioConfig = (container: Container) =>
  container.provider().getAll(AttachmentEmbedConfigIdentifier).get('drawio');

const renderedEmbedUrl = (container: Container) => {
  const model = { props: { name: 'flow.drawio' } } as AttachmentBlockModel;
  const result = drawioConfig(container)?.render?.(model, 'blob:x');
  return result?.values.find(
    value => typeof value === 'string' && value.startsWith('http')
  );
};

describe('draw.io embed config', () => {
  it('uses the default draw.io server', () => {
    const container = new Container();
    AttachmentEmbedConfigExtension().setup(container);
    expect(renderedEmbedUrl(container)).toBe(DEFAULT_DRAWIO_EMBED_URL);
  });

  it('can point at another draw.io server', () => {
    const container = new Container();
    AttachmentEmbedConfigExtension().setup(container);
    AttachmentDrawioEmbedUrlExtension('https://drawio.example.com/').setup(
      container
    );
    expect(renderedEmbedUrl(container)).toBe('https://drawio.example.com/');
    // the other built-in configs are kept
    expect(
      container.provider().getAll(AttachmentEmbedConfigIdentifier).size
    ).toBeGreaterThan(1);
  });
});
