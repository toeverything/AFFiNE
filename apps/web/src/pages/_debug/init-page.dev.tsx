import { initPage } from '@affine/env/blocksuite';
import { useRouter } from 'next/router';
import { lazy, Suspense } from 'react';

import { StyledPage, StyledWrapper } from '../../layouts/styles';
import type { NextPageWithLayout } from '../../shared';

const Editor = lazy(() =>
  import('../../components/__debug__/client/Editor').then(module => ({
    default: module.default,
  }))
);

const InitPagePage: NextPageWithLayout = () => {
  const router = useRouter();
  if (!router.isReady) {
    return <>loading...</>;
  }
  let testType: 'empty' | 'importMarkdown' = 'empty';
  if (router.query.type === 'importMarkdown') {
    testType = 'importMarkdown';
  } else if (router.query.type === 'empty') {
    testType = 'empty';
  }
  return (
    <StyledPage>
      <StyledWrapper>
        <Suspense>
          <Editor onInit={initPage} testType={testType} />
        </Suspense>
        <div id="toolWrapper" />
      </StyledWrapper>
    </StyledPage>
  );
};

export default InitPagePage;
