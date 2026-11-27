/**
 * @vitest-environment happy-dom
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@affine/core/modules/workbench', () => ({
  WorkbenchLink: ({
    to,
    children,
    ...props
  }: PropsWithChildren<{ to: string }>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@affine/core/components/page-list/page-content-preview', () => ({
  PagePreview: () => null,
}));

vi.mock('../../components/doc-card/tag', () => ({
  DocCardTags: () => null,
}));

vi.mock('@toeverything/infra', async importOriginal => ({
  ...((await importOriginal()) as Record<string, unknown>),
  useService: () => ({
    title$: () => 'Doc',
    isFavorite$: () => false,
  }),
  useLiveData: (value: unknown) => value,
}));

import { SearchResults } from './search-results';

afterEach(() => {
  cleanup();
});

describe('mobile SearchResults', () => {
  test.each([
    {
      name: 'links a block match to the matched block',
      doc: { id: 'doc-a', blockId: 'block-1' },
      href: '/doc-a?blockIds=block-1',
    },
    {
      name: 'links a title match to the doc',
      doc: { id: 'doc-a' },
      href: '/doc-a',
    },
  ])('$name', ({ doc, href }) => {
    render(<SearchResults title="Search result" docs={[doc]} />);

    expect(screen.getByTestId('doc-card').getAttribute('href')).toBe(href);
  });
});
