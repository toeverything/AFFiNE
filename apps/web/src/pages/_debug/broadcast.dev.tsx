import { Button } from '@affine/component';
import { MainContainer } from '@affine/component/workspace';
import { DebugLogger } from '@affine/debug';
import { initEmptyPage } from '@affine/env/blocksuite';
import type { BroadCastChannelProvider } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { createBroadCastChannelProvider } from '@affine/workspace/providers';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { nanoid } from '@blocksuite/store';
import { NoSsr, Typography } from '@mui/material';
import { atom, useAtom, useAtomValue } from 'jotai';
import type React from 'react';
import { useCallback } from 'react';

import { AppContainer } from '../../components/affine/app-container';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { toast } from '../../utils';

const logger = new DebugLogger('broadcast');

const blockSuiteWorkspaceAtom = atom(() => {
  const workspace = createEmptyBlockSuiteWorkspace('broadcast-test', WorkspaceFlavour.LOCAL)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  globalThis.currentWorkspace = workspace
  return workspace
});


const providerAtom = atom((get, { signal }) => {
  const blockSuiteWorkspace = get(blockSuiteWorkspaceAtom);
  const provider = createBroadCastChannelProvider(
    blockSuiteWorkspace.id,
    blockSuiteWorkspace.doc,
    {
      awareness: blockSuiteWorkspace.awarenessStore.awareness,
    }
  ) as BroadCastChannelProvider;
  signal.addEventListener('abort', () => {
    provider.disconnect();
  });
  provider.connect();
  return provider;
});

const BroadcastPage: React.FC = () => {
  const blockSuiteWorkspace = useAtomValue(blockSuiteWorkspaceAtom);
  useAtom(providerAtom);
  const createPage = useCallback(async () => {
    const page = blockSuiteWorkspace.createPage({ id: nanoid() });
    await initEmptyPage(page);
    logger.info('create page', page.spaceDoc.guid);
  }, [blockSuiteWorkspace]);
  const cleanupPages = useCallback(() => {
    blockSuiteWorkspace.pages.forEach(page => blockSuiteWorkspace.removePage(page.id))
  }, [blockSuiteWorkspace])
  const openPage = useCallback(
    (pageId: string) => {
      const page = blockSuiteWorkspace.getPage(pageId);
      console.log('openPage', page);
      toast('do nothing');
    },
    [blockSuiteWorkspace]
  );
  return (
    <AppContainer>
      <MainContainer>
        <Typography variant="h5">Broadcast Provider Test</Typography>
        <Button type="primary" data-testid="create-page" onClick={createPage}>
          Create Page
        </Button>
        <Button type="primary" data-testid="cleanup-pages" onClick={cleanupPages}>
          Cleanup Pages
        </Button>
        <NoSsr>
          <BlockSuitePageList
            blockSuiteWorkspace={blockSuiteWorkspace}
            listType="all"
            onOpenPage={openPage}
          />
        </NoSsr>
      </MainContainer>
    </AppContainer>
  );
};

export default BroadcastPage;
