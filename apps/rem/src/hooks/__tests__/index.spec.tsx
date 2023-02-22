/**
 * @vitest-environment happy-dom
 */
import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import { Page } from '@blocksuite/store';
import { render } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';

import { BlockSuiteWorkspace } from '../../shared';
import { usePageMetas } from '../use-page-metas';

let blockSuiteWorkspace: BlockSuiteWorkspace;
beforeEach(() => {
  blockSuiteWorkspace = new BlockSuiteWorkspace({
    room: 'test',
  })
    .register(builtInSchemas)
    .register(__unstableSchemas);
  blockSuiteWorkspace.signals.pageAdded.on(pageId => {
    const page = blockSuiteWorkspace.getPage(pageId) as Page;
    const pageBlockId = page.addBlockByFlavour('affine:page', { title: '' });
    const frameId = page.addBlockByFlavour('affine:frame', {}, pageBlockId);
    page.addBlockByFlavour('affine:paragraph', {}, frameId);
  });
  blockSuiteWorkspace.createPage('page0');
  blockSuiteWorkspace.createPage('page1');
  blockSuiteWorkspace.createPage('page2');
});

test('usePageMetas', async () => {
  const Component = () => {
    const pageMetas = usePageMetas(blockSuiteWorkspace);
    return (
      <div>
        {pageMetas.map(meta => (
          <div key={meta.id}>{meta.id}</div>
        ))}
      </div>
    );
  };
  const result = render(<Component />);
  await result.findByText('page0');
  await result.findByText('page1');
  await result.findByText('page2');
  expect(result.asFragment()).toMatchSnapshot();
});
