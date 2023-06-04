import { AppContainer, MainContainer } from '@affine/component/workspace';
import { useRouter } from 'next/router';
import { lazy, Suspense } from 'react';

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
        <div id="toolWrapper" />
      </MainContainer>
    </AppContainer>
  );
};

export default InitPagePage;
