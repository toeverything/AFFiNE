import { Button, toast } from '@affine/component';
import { DebugLogger } from '@affine/debug';
import { nanoid } from '@blocksuite/store';
import { Typography } from '@mui/material';
import React, { useEffect, useMemo, useState } from 'react';

import { createBroadCastChannelProvider } from '../../blocksuite/providers';
import PageList from '../../components/blocksuite/block-suite-page-list/page-list';
import { StyledPage, StyledWrapper } from '../../layouts/styles';
import { BroadCastChannelProvider } from '../../shared';
import { createEmptyBlockSuiteWorkspace } from '../../utils';

const logger = new DebugLogger('broadcast');

declare global {
  // eslint-disable-next-line no-var
  var currentBroadCastChannel: BroadCastChannelProvider | undefined;
}

const BroadcastPage: React.FC = () => {
  const blockSuiteWorkspace = useMemo(
    () => createEmptyBlockSuiteWorkspace('broadcast-test'),
    []
  );
  const [provider, setProvider] = useState<BroadCastChannelProvider | null>(
    null
  );
  useEffect(() => {
    globalThis.currentBlockSuiteWorkspace = blockSuiteWorkspace;
  }, [blockSuiteWorkspace]);
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
    <StyledPage>
      <StyledWrapper>
        <Typography variant="h5">Broadcast Provider Test</Typography>
        <Button
          type="primary"
          data-testid="create-page"
          onClick={() => {
            logger.info('create page');
            blockSuiteWorkspace.createPage(nanoid());
          }}
        >
          Create Page
        </Button>
        <PageList
          blockSuiteWorkspace={blockSuiteWorkspace}
          onClickPage={() => {
            toast('do nothing');
          }}
        />
      </StyledWrapper>
    </StyledPage>
  );
};

export default BroadcastPage;
