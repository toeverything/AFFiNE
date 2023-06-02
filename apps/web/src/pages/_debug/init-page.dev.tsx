import { AppContainer, MainContainer } from '@affine/component/workspace';
import { initPage } from '@affine/env/blocksuite';
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
  let testType: 'empty' | 'preloading' = 'empty';
  if (router.query.type === 'preloading') {
    testType = 'preloading';
  } else if (router.query.type === 'empty') {
    testType = 'empty';
  }
  return (
    <AppContainer>
      <MainContainer>
        <Suspense>
          <Editor onInit={initPage} testType={testType} />
        </Suspense>
        <div id="toolWrapper" />
      </MainContainer>
    </AppContainer>
  );
};

export default InitPagePage;
