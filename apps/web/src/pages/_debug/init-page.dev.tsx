import { BlockHubWrapper } from '@affine/component/block-hub';
import { MainContainer } from '@affine/component/workspace';
import { rootBlockHubAtom } from '@affine/workspace/atom';
import { useRouter } from 'next/router';
import { lazy, Suspense } from 'react';

import { AppContainer } from '../../components/affine/app-container';
import type { NextPageWithLayout } from '../../shared';

const Editor = lazy(() =>
  import('../../components/__debug__/client/editor').then(module => ({
    default: module.default,
  }))
);

const InitPagePage: NextPageWithLayout = () => {
  const router = useRouter();
  if (!router.isReady) {
    return <>loading...</>;
  }

  return (
    <AppContainer>
      <MainContainer>
        <Suspense>
          <Editor />
        </Suspense>
        <BlockHubWrapper blockHubAtom={rootBlockHubAtom} />
      </MainContainer>
    </AppContainer>
  );
};

export default InitPagePage;
