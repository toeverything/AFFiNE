/**
 * @vitest-environment happy-dom
 */
import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { TextViewer } from '../text/text-viewer';

vi.mock('../utils', () => ({
  getAttachmentBlob: vi.fn(
    async () => new Blob(['const x = 1'], { type: 'text/plain' })
  ),
}));

const codeToHtml = vi.fn(
  () => '<pre class="shiki"><span>highlighted</span></pre>'
);

vi.mock('shiki', () => ({
  getSingletonHighlighter: async () => ({ codeToHtml }),
  bundledLanguagesInfo: [
    { id: 'typescript', name: 'typescript', aliases: ['ts'] },
  ],
}));

describe('TextViewer', () => {
  test('renders highlighted code', async () => {
    const model = {
      props: { name: 'code.ts' },
    } as unknown as AttachmentBlockModel;
    render(<TextViewer model={model} />);
    await waitFor(() => expect(codeToHtml).toHaveBeenCalled());
    const pre = await screen.findByText('highlighted');
    expect(pre).toBeTruthy();
  });
});
