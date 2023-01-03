import { styled } from '@/styles';

import usePageMetaList from '@/hooks/use-page-meta-list';
import { ReactElement } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';
import { Button } from '@/ui/button';

export const FeatureCardDiv = styled('div')({
  width: '800px',
  border: '1px #eee solid',
  margin: '20px auto',
  minHeight: '200px',
  padding: '15px',
});

export const Playground = () => {
  return (
    <>
      <FeatureCardDiv>
        <h1>Feature - Sign In</h1>
        <Button>Login</Button>
      </FeatureCardDiv>

      <FeatureCardDiv>
        <h1>Feature - Workspace List</h1>
      </FeatureCardDiv>
    </>
  );
};

Playground.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default Playground;
