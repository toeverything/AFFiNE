import { NoSsr } from '@mui/material';
import { useRouter } from 'next/router';
import { lazy } from 'react';

import { StyledPage, StyledWrapper } from '../../layouts/styles';
import type { NextPageWithLayout } from '../../shared';
import { initPage } from '../../utils/blocksuite';

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
        <Editor onInit={initPage} testType={testType} />
        <div id="toolWrapper" />
      </StyledWrapper>
    </StyledPage>
  );
};

export default InitPagePage;

InitPagePage.getLayout = page => {
  return <NoSsr>{page}</NoSsr>;
};
