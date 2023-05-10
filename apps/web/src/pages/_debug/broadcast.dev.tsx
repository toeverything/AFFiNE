import { Button } from '@affine/component';
import { AppContainer, MainContainer } from '@affine/component/workspace';
import { DebugLogger } from '@affine/debug';
import { createBroadCastChannelProvider } from '@affine/workspace/providers';
import type { BroadCastChannelProvider } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { nanoid } from '@blocksuite/store';
import { Typography } from '@mui/material';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { toast } from '../../utils';

const logger = new DebugLogger('broadcast');

declare global {
  // eslint-disable-next-line no-var
  var currentBroadCastChannel: BroadCastChannelProvider | undefined;
}

const BroadcastPage: React.FC = () => {
  const blockSuiteWorkspace = useMemo(
    () =>
      createEmptyBlockSuiteWorkspace('broadcast-test', WorkspaceFlavour.LOCAL),
    []
  );
  const [provider, setProvider] = useState<BroadCastChannelProvider | null>(
    null
  );
  useEffect(() => {
    const provider = createBroadCastChannelProvider(blockSuiteWorkspace);
    setProvider(provider);
    globalThis.currentBroadCastChannel = provider;
    provider.connect();
    return () => {
      provider.disconnect();
      globalThis.currentBroadCastChannel = undefined;
      setProvider(null);
    };
  }, [blockSuiteWorkspace]);
  if (!provider) {
    return null;
  }
  return (
    <AppContainer>
      <MainContainer>
        <Typography variant="h5">Broadcast Provider Test</Typography>
        <Button
          type="primary"
          data-testid="create-page"
          onClick={() => {
            logger.info('create page');
            blockSuiteWorkspace.createPage({ id: nanoid() });
          }}
        >
          Create Page
        </Button>
        <BlockSuitePageList
          blockSuiteWorkspace={blockSuiteWorkspace}
          listType="all"
          onOpenPage={() => {
            toast('do nothing');
          }}
        />
      </MainContainer>
    </AppContainer>
  );
};

export default BroadcastPage;
