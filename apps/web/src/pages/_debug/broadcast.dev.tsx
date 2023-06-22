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

declare global {
  // eslint-disable-next-line no-var
  var currentBroadCastChannel: BroadCastChannelProvider | undefined;
}

const blockSuiteWorkspaceAtom = atom(() =>
  createEmptyBlockSuiteWorkspace('broadcast-test', WorkspaceFlavour.LOCAL)
);
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
    logger.info('create page');
    const page = blockSuiteWorkspace.createPage({ id: nanoid() });
    await initEmptyPage(page);
  }, [blockSuiteWorkspace]);
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
